import {
  draftingSchema,
  extractionSchema,
  matchingSchema,
  runViewSchema,
  toolSchema,
} from "../../shared/agent.schema.js";
import {
  snapshotReferences,
  stableStringify,
  targetValue,
  type RunView,
} from "../../shared/agent.js";
import { AgentError, safeError } from "./errors.js";
import type { Store, RunRecord } from "./store.js";
import type { ModelProvider } from "./provider.js";
import type { Config } from "./config.js";

const tools = toolSchema.options;
function ensure(condition: unknown, message: string): asserts condition {
  if (!condition)
    throw new AgentError("TOOL_RESULT_INVALID", message, 502, true);
}
function unique(ids: string[]) {
  return new Set(ids).size === ids.length;
}
export function validateRequirements(run: RunRecord) {
  ensure(
    unique(run.run_view.requirements.map((r) => r.id)),
    "岗位要求 ID 重复",
  );
  for (const requirement of run.run_view.requirements)
    ensure(run.jd_text.includes(requirement.jdQuote), "岗位引用不在 JD 原文中");
}
export function validateEvidence(run: RunRecord) {
  const view = run.run_view,
    requirements = new Map(view.requirements.map((r) => [r.id, r]));
  const refs = new Map(
    snapshotReferences(run.resume_snapshot).map((ref) => [ref.id, ref]),
  );
  ensure(
    view.evidence.length === requirements.size &&
      unique(view.evidence.map((e) => e.requirementId)),
    "每项岗位要求必须有且只有一条覆盖判断",
  );
  for (const evidence of view.evidence) {
    ensure(
      requirements.has(evidence.requirementId),
      "证据引用了不存在的岗位要求",
    );
    if (evidence.coverage === "supported")
      ensure(evidence.refs.length > 0, "已支持的要求必须有证据");
    if (evidence.coverage === "missing")
      ensure(evidence.refs.length === 0, "缺口不能伪造证据");
    for (const ref of evidence.refs) {
      const original = refs.get(ref.id);
      ensure(
        original &&
          original.section === ref.section &&
          original.itemId === ref.itemId &&
          original.field === ref.field &&
          original.quote.includes(ref.quote),
        "简历证据必须能定位到当前快照原文",
      );
    }
  }
  ensure(unique(view.questions.map((q) => q.id)), "追问 ID 重复");
  for (const q of view.questions)
    ensure(
      requirements.has(q.requirementId) &&
        view.evidence.some(
          (e) =>
            e.requirementId === q.requirementId && e.coverage !== "supported",
        ),
      "仅对真实缺口或模糊经历追问",
    );
}
export function validateChanges(
  run: RunRecord,
  changes: RunView["changes"],
): RunView["changes"] {
  const evidenceIds = new Set(
    run.run_view.evidence.flatMap((e) => e.refs).map((ref) => ref.id),
  );
  const refs = new Map(
    snapshotReferences(run.resume_snapshot)
      .filter((ref) => evidenceIds.has(ref.id))
      .map((ref) => [ref.id, ref]),
  );
  const answers = new Map(
    run.run_view.questions
      .filter((q) => q.answer)
      .map((q) => [q.id, q.answer!]),
  );
  ensure(
    unique(changes.map((c) => c.id)) &&
      unique(changes.map((c) => stableStringify(c.target))),
    "修改 ID 或目标字段重复",
  );
  for (const change of changes) {
    const before = targetValue(run.resume_snapshot, change.target);
    ensure(
      before !== undefined &&
        stableStringify(before) === stableStringify(change.before),
      "修改目标不存在或 before 与原文不符",
    );
    ensure(
      Array.isArray(before) === Array.isArray(change.after),
      "修改后的字段类型不合法",
    );
    const sourceTexts: string[] = [];
    for (const source of change.sources) {
      const original =
        source.kind === "resume"
          ? refs.get(source.refId)?.quote
          : answers.get(source.refId);
      ensure(
        original && original.includes(source.quote),
        "修改来源无法定位或引用不匹配",
      );
      sourceTexts.push(source.quote);
    }
    const after = Array.isArray(change.after)
      ? change.after.join("\n")
      : change.after;
    const sourceText = sourceTexts.join("\n");
    const numbers = (s: string) => s.match(/\d+(?:[.,]\d+)*(?:%|％)?/g) ?? [];
    const known = new Set(numbers(sourceText));
    ensure(
      numbers(after).every((n) => known.has(n)),
      "建议包含没有来源的数字或指标",
    );
    // Semantic truth cannot be proven by a schema; every accepted edit requires user review.
    change.needsConfirmation = true;
  }
  return changes.filter(
    (change) =>
      stableStringify(change.before) !== stableStringify(change.after),
  );
}

export async function executeRun(
  initial: RunRecord,
  store: Store,
  provider: ModelProvider,
  config: Config,
  outerSignal: AbortSignal,
): Promise<void> {
  let run = initial;
  const control = new AbortController();
  const signal = AbortSignal.any([outerSignal, control.signal]);
  let heartbeat: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  const renew = async () => {
    try {
      const ok = await store.rpc<boolean>("agent_renew_lease", {
        p_run: run.id,
        p_token: initial.lease_token,
        p_seconds: 90,
      });
      if (!ok)
        control.abort(
          new AgentError("LEASE_LOST", "任务执行权已失效", 409, true),
        );
    } catch {
      control.abort(
        new AgentError("LEASE_LOST", "无法续租执行权，等待恢复", 409, true),
      );
    }
    if (!stopped && !signal.aborted) heartbeat = setTimeout(renew, 15000);
  };
  heartbeat = setTimeout(renew, 15000);
  const checkpoint = async (stage: number, status: RunView["status"]) => {
    signal.throwIfAborted();
    runViewSchema.parse(run.run_view);
    run = await store.rpc<RunRecord>("agent_checkpoint", {
      p_run: run.id,
      p_token: initial.lease_token,
      p_view: run.run_view,
      p_stage: stage,
      p_status: status,
    });
  };
  try {
    while (run.stage < tools.length) {
      signal.throwIfAborted();
      const stage = run.stage,
        stepId = `step-${stage}`,
        tool = tools[stage];
      const prior = run.run_view.steps.find((s) => s.id === stepId);
      run.run_view.steps = run.run_view.steps.filter((s) => s.id !== stepId);
      run.run_view.steps.push({
        id: stepId,
        tool,
        status: "running",
        attempt: (prior?.attempt ?? 0) + 1,
        summary: "正在执行",
      });
      await checkpoint(stage, "running");
      const started = performance.now();
      let awaitInput = false;
      if (stage === 0) {
        const result = await provider.generate(
          run,
          stepId,
          extractionSchema,
          '返回 {"tool":"extract_job_requirements","result":{"requirements":[{"id":"req-1","text":"要求","jdQuote":"JD 原文逐字引用","required":true}]}}。最多20项，ID唯一。',
          { jdText: run.jd_text },
          signal,
        );
        run.run_view.requirements = result.result.requirements;
        try {
          validateRequirements(run);
        } catch (error) {
          run.run_view.requirements = [];
          throw error;
        }
      } else if (stage === 1) {
        const result = await provider.generate(
          run,
          stepId,
          matchingSchema,
          '返回 {"tool":"find_resume_evidence","result":{"evidence":[{"requirementId":"req-1","coverage":"supported","refs":[{"id":"给定证据ID","section":"给定section","itemId":"给定条目ID（自我评价省略）","field":"给定field","quote":"给定原文的连续片段"}]}],"questions":[{"id":"q-1","requirementId":"req-1","question":"需要补充的问题"}]}}。coverage只能是supported、needs_clarification、missing三者之一，不要用竖线拼接。refs逐字段复制references中的定位信息，自我评价省略itemId，其余条目保留itemId，不使用null。quote只取必要的原文短片段，避免整段重复。每个要求一个evidence；supported须有引用，missing须无引用。根据真实缺口决定是否追问，只对非supported要求提问，最多3题，可以无问题。不得在问题中预设用户已做过或诱导虚构。',
          {
            requirements: run.run_view.requirements,
            references: snapshotReferences(run.resume_snapshot),
          },
          signal,
        );
        run.run_view.evidence = result.result.evidence;
        run.run_view.questions = result.result.questions;
        try {
          validateEvidence(run);
        } catch (error) {
          run.run_view.evidence = [];
          run.run_view.questions = [];
          throw error;
        }
      } else if (stage === 2) {
        awaitInput = run.run_view.questions.length > 0;
      } else if (stage === 3) {
        const result = await provider.generate(
          run,
          stepId,
          draftingSchema,
          '返回 {"tool":"draft_resume_changes","result":{"changes":[{"id":"change-1","target":{"section":"workExperience","itemId":"原条目ID","field":"description"},"before":"原文","after":"建议","reason":"理由","sources":[{"kind":"resume","refId":"证据ID或问题ID","quote":"原文连续片段"}],"needsConfirmation":true}]}}。sources.kind只能为resume或answer之一，不要用竖线拼接。只允许education.description、workExperience.description/highlights、projects.description、selfEvaluation.selfEvaluation（该section无itemId）。before逐字匹配字段，highlights是字符串数组，其余是字符串。每个目标至多一项，最多20项。来源只用给定evidence或已回答questions。没有证据的事实不新增，不复制JD为个人能力，不编造数字/技能；没有安全修改时返回空changes。',
          {
            snapshot: run.resume_snapshot,
            requirements: run.run_view.requirements,
            evidence: run.run_view.evidence,
            questions: run.run_view.questions,
          },
          signal,
        );
        run.run_view.changes = validateChanges(run, result.result.changes);
      } else {
        run.run_view.changes = validateChanges(run, run.run_view.changes);
      }
      const step = run.run_view.steps.find((s) => s.id === stepId)!;
      step.status = "completed";
      step.durationMs = Math.round(performance.now() - started);
      step.summary = [
        `识别 ${run.run_view.requirements.length} 项岗位要求`,
        `完成 ${run.run_view.evidence.length} 项证据判断`,
        awaitInput
          ? `等待回答 ${run.run_view.questions.length} 个问题`
          : "无需追问",
        `生成 ${run.run_view.changes.length} 项有来源的修改建议`,
        "字段、原文和来源校验通过",
      ][stage];
      await checkpoint(
        stage + 1,
        awaitInput ? "awaiting_input" : stage === 4 ? "completed" : "running",
      );
      if (awaitInput) return;
    }
  } catch (error) {
    if (
      signal.aborted ||
      (error instanceof AgentError && error.code === "LEASE_LOST")
    )
      return;
    const e = safeError(error);
    const step = run.run_view.steps.find((s) => s.id === `step-${run.stage}`);
    if (step) {
      step.status = "failed";
      step.summary = e.message;
    }
    run.run_view.error = {
      code: e.code,
      message: e.message,
      retryable:
        e.retryable &&
        run.run_view.usage.calls < config.MAX_MODEL_CALLS_PER_RUN &&
        run.retry_count < 3,
    };
    if (run.stage < 4) run.run_view.changes = [];
    try {
      await checkpoint(run.stage, "failed");
    } catch {
      console.error(
        JSON.stringify({ runId: run.id, code: "CHECKPOINT_FAILED" }),
      );
    }
  } finally {
    stopped = true;
    clearTimeout(heartbeat);
  }
}

export function startScheduler(
  store: Store,
  provider: ModelProvider,
  config: Config,
) {
  const control = new AbortController();
  const active = new Set<Promise<void>>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  let polling: Promise<void> | undefined;
  const tick = async () => {
    try {
      while (!stopped && active.size < config.MAX_CONCURRENT_RUNS) {
        const run = await store.rpc<RunRecord | null>("agent_claim_run", {
          p_seconds: 90,
          p_max_concurrent: config.MAX_CONCURRENT_RUNS,
        });
        if (!run) break;
        if (stopped) break;
        const work = executeRun(run, store, provider, config, control.signal)
          .catch(() => {
            console.error(
              JSON.stringify({ runId: run.id, code: "EXECUTOR_FAILED" }),
            );
          })
          .finally(() => active.delete(work));
        active.add(work);
      }
    } catch {
      console.error(JSON.stringify({ code: "SCHEDULER_STORE_UNAVAILABLE" }));
    }
    if (!stopped)
      timer = setTimeout(() => {
        polling = tick();
      }, 1000);
  };
  polling = tick();
  return {
    async stop() {
      stopped = true;
      clearTimeout(timer);
      control.abort(new Error("Server shutting down"));
      await polling;
      await Promise.allSettled(active);
    },
  };
}
