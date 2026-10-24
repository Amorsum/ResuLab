// Isolated real-model drafting comparison. Synthetic content only; no auth/DB writes.
// node verify-draft-quality.mjs <candidateServer> <envFile> <baselineServer> <report>
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const [candidate, envFile, baseline, reportFile] = process.argv.slice(2);
if (!candidate || !envFile || !baseline || !reportFile) throw new Error("Missing arguments");
const require = createRequire(path.resolve(baseline, "package.json"));
const env = require("dotenv").parse(fs.readFileSync(envFile));
const moduleAt = (relative) => import(pathToFileURL(path.resolve(candidate, "dist", relative)).href);
const { loadConfig } = await moduleAt("server/src/config.js");
const { openAIProvider } = await moduleAt("server/src/provider.js");
const { draftProposalSchema, draftSourceCatalog, resolveDraftProposals } = await moduleAt("server/src/drafting.js");
const { draftingInput, draftingInstruction } = await moduleAt("server/src/drafting-instructions.js");
const { validateDraftQuality } = await moduleAt("server/src/draft-quality.js");
const { validateChanges } = await moduleAt("server/src/engine.js");
const { exampleSnapshot, agentExamples } = await moduleAt("shared/agent.examples.js");
const { snapshotReferences } = await moduleAt("shared/agent.js");
const config = loadConfig({ ...env, MAX_MODEL_RETRIES: "0" });
const baselineCode = fs.readFileSync(path.resolve(baseline, "dist/server/src/engine.js"), "utf8");
const baselineInstruction = baselineCode.match(/draftProposalSchema,\s*'([^']+)'/)?.[1];
if (!baselineInstruction?.includes("没有安全修改时返回空changes")) throw new Error("Unknown baseline prompt");
const snapshot = structuredClone(exampleSnapshot);
Object.assign(snapshot.workExperience[0], {
  companyName: "合成电商团队", position: "开发实习生",
  description: "每天整理需求和发版说明，使用TypeScript写订单查询接口，跟前端核对字段；用SQL按渠道汇总订单数据，用Excel去重后整理周报；上线后协助查看日志定位接口报错。参与开发，接口方案由同事确定。",
  highlights: ["负责订单查询接口的筛选条件和分页逻辑", "周报按渠道展示订单数量，不包含转化率分析"],
});
const scenarios = [
  { id: "backend", jd: "后端开发：使用TypeScript开发业务接口，完成筛选和分页；与前端协作，协助排查接口错误。", requirements: ["TypeScript业务接口开发及筛选分页", "前端协作与接口问题排查"] },
  { id: "data-operations", jd: "数据运营：使用SQL按渠道汇总业务数据，使用Excel清洗去重并整理周报。", requirements: ["SQL渠道数据汇总", "Excel数据清洗和周报整理"] },
  { id: "missing-skill", jd: "后端开发：TypeScript业务接口；Redis缓存与性能优化。", requirements: ["TypeScript业务接口", "Redis缓存与性能优化"], answer: "没有使用过Redis，也没有做过性能优化。我只参与订单查询接口开发，方案由同事确定。" },
];
const report = { at: new Date().toISOString(), syntheticOnly: true, realProvider: true, realDatabase: false, realAuth: false, model: config.MODEL_ID, baseline: path.basename(path.dirname(baseline)), candidates: [], success: false };
const save = () => fs.writeFileSync(reportFile, JSON.stringify(report, null, 2) + "\n");
try {
  for (const scenario of scenarios) {
    for (const version of ["baseline", "candidate"]) {
      const run = { id: crypto.randomUUID(), lease_token: crypto.randomUUID(), jd_text: scenario.jd, resume_snapshot: structuredClone(snapshot), run_view: structuredClone(agentExamples.completed) };
      run.run_view.usage = { calls: 0, inputTokens: 0, outputTokens: 0, estimatedCost: 0, currency: config.MODEL_CURRENCY, elapsedMs: 0, waitingMs: 0 };
      run.run_view.requirements = scenario.requirements.map((text, index) => ({ id: `req-${index + 1}`, text, jdQuote: scenario.jd, required: true }));
      const refs = snapshotReferences(run.resume_snapshot).filter((ref) => ["description", "highlights"].includes(ref.field));
      run.run_view.evidence = run.run_view.requirements.map((req, index) => ({ requirementId: req.id, coverage: scenario.answer && index === 1 ? "missing" : "supported", refs: scenario.answer && index === 1 ? [] : structuredClone(refs) }));
      run.run_view.questions = scenario.answer ? [{ id: "q-1", requirementId: "req-2", question: "是否有缓存及性能优化经验？", answer: scenario.answer }] : [];
      run.run_view.steps = [{ id: "step-3", attempt: 1 }];
      const events = [];
      const calls = [];
      const store = { async rpc(name, args) {
        if (name === "agent_begin_model_call") {
          if (calls.length >= args.p_max_calls) throw new Error("BUDGET_EXHAUSTED");
          const id = crypto.randomUUID(); calls.push({ id });
          return { id, calls: calls.length };
        }
        if (name !== "agent_finish_model_call") throw new Error("Unexpected RPC");
        Object.assign(calls.find((call) => call.id === args.p_call), { input: args.p_input, output: args.p_output, cost: args.p_cost });
        const sum = (key) => calls.every((call) => call[key] !== null && call[key] !== undefined) ? calls.reduce((total, call) => total + call[key], 0) : null;
        return { inputTokens: sum("input"), outputTokens: sum("output"), estimatedCost: sum("cost") };
      } };
      const sources = draftSourceCatalog(run);
      const data = draftingInput(run);
      if (version === "baseline") for (const source of data.sourceCatalog) delete source.requirementIds;
      const result = { caseId: scenario.id, version, status: "failed", changes: [], events };
      report.candidates.push(result);
      const started = performance.now();
      try {
        const proposal = await openAIProvider(config, store, fetch, (event) => events.push(event)).generate(
          run, "step-3", draftProposalSchema, version === "candidate" ? draftingInstruction : baselineInstruction, data, AbortSignal.timeout(210000),
          (value) => {
            const resolved = resolveDraftProposals(value, run.resume_snapshot, sources);
            validateChanges(run, resolved);
            if (version === "candidate") validateDraftQuality(resolved);
          },
        );
        result.changes = validateChanges(run, resolveDraftProposals(proposal, run.resume_snapshot, sources));
        result.cosmeticCount = result.changes.filter((change) => { try { validateDraftQuality([change]); return false; } catch { return true; } }).length;
        result.status = "completed";
        result.factualRulesPassed = true;
      } catch (error) { result.errorCode = error.code ?? "EVALUATION_FAILED"; }
      result.elapsedMs = Math.round(performance.now() - started);
      result.usage = run.run_view.usage;
      save();
      console.log(JSON.stringify({ caseId: result.caseId, version, status: result.status, changes: result.changes.length, cosmeticCount: result.cosmeticCount, calls: calls.length }));
    }
  }
  report.success = report.candidates.filter((result) => result.version === "candidate").every((result) => result.status === "completed" && result.changes.length > 0 && result.cosmeticCount === 0);
  report.reviewRequired = "Compare job focus and responsibility boundaries manually; passing source/number rules does not prove semantic truth.";
} finally { save(); }
if (!report.success) process.exitCode = 1;
