import { test } from "node:test";
import assert from "node:assert/strict";
import { agentExamples, exampleSnapshot } from "../../shared/agent.examples.js";
import { draftingSchema } from "../../shared/agent.schema.js";
import {
  draftProposalSchema,
  draftTargets,
  draftSourceCatalog,
  originalTargetValue,
  resolveDraftProposals,
} from "../src/drafting.js";
import { validateChanges } from "../src/engine.js";
import type { RunRecord } from "../src/store.js";

const fixture = () =>
  ({
    resume_snapshot: structuredClone(exampleSnapshot),
    run_view: structuredClone(agentExamples.completed),
  }) as RunRecord;
const proposal = () => {
  const { before: _before, ...change } = structuredClone(
    agentExamples.completed.changes[0],
  );
  return {
    tool: "draft_resume_changes" as const,
    result: { changes: [{ ...change, sources: [{ id: "source-1" }] }] },
  };
};
test("missing targets and mismatched before are distinct and strict byte-for-byte comparisons remain", () => {
  const run = fixture(),
    changes = structuredClone(run.run_view.changes);
  changes[0].target = {
    section: "workExperience",
    itemId: "unknown-item",
    field: "description",
  };
  assert.throws(() => validateChanges(run, changes), {
    code: "TOOL_RESULT_INVALID",
    rule: "target_not_found",
    path: "$.result.changes[0].target",
  });
  changes[0].target = structuredClone(run.run_view.changes[0].target);
  changes[0].before = String(changes[0].before) + " ";
  assert.throws(() => validateChanges(run, changes), {
    rule: "before_mismatch",
    path: "$.result.changes[0].before",
  });
  run.resume_snapshot.workExperience[0].description = "原文\r\n第二行";
  changes[0].before = "原文\n第二行";
  assert.throws(() => validateChanges(run, changes), {
    rule: "before_mismatch",
  });
});
test("only legal existing targets supply exact string/array/empty before, with detached arrays", () => {
  const run = fixture(),
    data = proposal();
  run.resume_snapshot.workExperience[0].description =
    " 原文\r\n不能改写 before ";
  let changes = resolveDraftProposals(
    draftProposalSchema.parse(data),
    run.resume_snapshot,
    draftSourceCatalog(run),
  );
  assert.equal(
    changes[0].before,
    run.resume_snapshot.workExperience[0].description,
  );
  run.resume_snapshot.workExperience[0].highlights = ["保留顺序", "含有空格 "];
  data.result.changes[0].target = {
    section: "workExperience",
    itemId: "work-1",
    field: "highlights",
  };
  changes = resolveDraftProposals(
    draftProposalSchema.parse(data),
    run.resume_snapshot,
    draftSourceCatalog(run),
  );
  assert.deepEqual(changes[0].before, ["保留顺序", "含有空格 "]);
  (changes[0].before as string[]).push("不得修改快照");
  assert.equal(run.resume_snapshot.workExperience[0].highlights.length, 2);
  assert.equal(
    originalTargetValue(
      run.resume_snapshot,
      { section: "selfEvaluation", field: "selfEvaluation" },
      "$.target",
    ),
    "",
  );
  for (const target of draftTargets(run.resume_snapshot))
    originalTargetValue(run.resume_snapshot, target, "$.target");
});
test("model before and protected/arbitrary target fields are rejected instead of silently accepted", () => {
  const data = proposal();
  assert.equal(
    draftProposalSchema.safeParse({
      ...data,
      result: {
        changes: [{ ...data.result.changes[0], before: "模型伪造原文" }],
      },
    }).success,
    false,
  );
  for (const target of [
    { section: "skills", itemId: "work-1", field: "skillName" },
    { section: "workExperience", itemId: "work-1", field: "companyName" },
    { section: "selfEvaluation", field: "selfEvaluation", itemId: "extra" },
  ])
    assert.throws(
      () => originalTargetValue(exampleSnapshot, target, "$.target"),
      { rule: "target_not_allowed" },
    );
  const changes = resolveDraftProposals(
    draftProposalSchema.parse(proposal()),
    exampleSnapshot,
    draftSourceCatalog(fixture()),
  );
  draftingSchema.parse({ tool: "draft_resume_changes", result: { changes } });
});
test("backfilling before preserves after types, duplicate targets, source quotes and numeric safeguards", () => {
  for (const [fault, rule, path] of [
    ["type", "after_type_mismatch", "$.result.changes[0].after"],
    ["source", "unknown_source", "$.result.changes[0].sources[0].refId"],
    ["quote", "source_quote_mismatch", "$.result.changes[0].sources[0].quote"],
    ["number", "unsupported_number", "$.result.changes[0].after"],
    ["duplicate", "duplicate_target", "$.result.changes[1].target"],
  ]) {
    const run = fixture(),
      changes = resolveDraftProposals(
        draftProposalSchema.parse(proposal()),
        run.resume_snapshot,
        draftSourceCatalog(run),
      );
    if (fault === "type") changes[0].after = ["数组类型"];
    if (fault === "source") changes[0].sources[0].refId = "missing-source";
    if (fault === "quote") changes[0].sources[0].quote = "原文没有的引用";
    if (fault === "number") changes[0].after = "开发接口，性能提升90%";
    if (fault === "duplicate")
      changes.push({ ...structuredClone(changes[0]), id: "another-change" });
    assert.throws(() => validateChanges(run, changes), {
      code: "TOOL_RESULT_INVALID",
      rule,
      path,
    });
  }
});
test("draft sources select only allowed resume/answered facts, and cannot retype quotes or invent IDs", () => {
  const run = fixture();
  run.run_view.questions = [
    {
      id: "q-1",
      requirementId: "req-1",
      question: "实际负责的功能？",
      answer: "我负责登录鉴权接口。",
    },
  ];
  const catalog = draftSourceCatalog(run),
    data = proposal();
  assert.equal(
    [...catalog.values()].filter((source) => source.kind === "resume").length,
    1,
  );
  assert.ok(
    [...catalog.values()].some(
      (source) => source.kind === "answer" && source.refId === "q-1",
    ),
  );
  assert.equal(
    draftProposalSchema.safeParse({
      ...data,
      result: {
        changes: [
          {
            ...data.result.changes[0],
            sources: [{ id: "source-1", quote: "伪造引用" }],
          },
        ],
      },
    }).success,
    false,
  );
  data.result.changes[0].sources = [{ id: "unknown-source" }];
  assert.throws(
    () =>
      resolveDraftProposals(
        draftProposalSchema.parse(data),
        run.resume_snapshot,
        catalog,
      ),
    { rule: "unknown_source", path: "$.result.changes[0].sources[0].id" },
  );
  const valid = resolveDraftProposals(
    draftProposalSchema.parse(proposal()),
    run.resume_snapshot,
    catalog,
  );
  assert.equal(
    valid[0].sources[0].quote,
    exampleSnapshot.workExperience[0].description,
  );
  validateChanges(run, valid);
  valid[0].sources[0].quote = "更改返回的副本";
  assert.equal(
    catalog.get("source-1")?.quote,
    exampleSnapshot.workExperience[0].description,
  );
});
