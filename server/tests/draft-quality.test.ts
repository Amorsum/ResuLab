import { test } from "node:test";
import assert from "node:assert/strict";
import { agentExamples } from "../../shared/agent.examples.js";
import { validateDraftQuality } from "../src/draft-quality.js";
import { draftingInput } from "../src/drafting-instructions.js";
import type { RunRecord } from "../src/store.js";
import { exampleSnapshot } from "../../shared/agent.examples.js";

function change(before: string | string[], after: string | string[]) {
  return [{ ...structuredClone(agentExamples.completed.changes[0]), before, after }];
}
test("punctuation, whitespace, line breaks and bullet splitting cannot count as content improvements", () => {
  for (const [before, after] of [
    ["使用 TypeScript 开发接口", "使用 TypeScript 开发接口。"],
    ["整理报名表，发送通知", "整理报名表；\n发送通知。"],
    [["核对字段", "查看日志"], ["核对字段。", "查看日志。"]],
    ["核对字段，查看日志", ["核对字段", "查看日志"]],
    [" 已经清楚的原文 ", " 已经清楚的原文 "],
  ] as Array<[string | string[], string | string[]]>)
    assert.throws(() => validateDraftQuality(change(before, after)), {
      rule: "cosmetic_only_change",
      path: "$.result.changes[0].after",
    });
});
test("actual reordering, clearer responsibilities and integrated answers remain possible", () => {
  for (const [before, after] of [
    ["查看日志；开发订单查询接口", "开发订单查询接口；查看日志"],
    ["使用 TypeScript 开发接口", "负责基于 TypeScript 的接口开发"],
    ["开发接口", "开发登录鉴权接口"],
    [["查看日志", "开发接口"], ["开发接口", "查看日志"]],
  ] as Array<[string | string[], string | string[]]>)
    validateDraftQuality(change(before, after));
  validateDraftQuality([]);
});
test("technical symbol changes are not mistaken for harmless punctuation", () => {
  // Facts still need independent validation; these changes must not be normalized away.
  for (const [before, after] of [["C", "C++"], ["C", "C#"], ["1.5", "15"], ["Node.js", "Nodejs"], ["10%", "10"]])
    validateDraftQuality(change(before, after));
});
test("drafting input connects selected immutable sources with job requirements and actual answers", () => {
  const run = {
    resume_snapshot: structuredClone(exampleSnapshot),
    run_view: structuredClone(agentExamples.completed),
  } as RunRecord;
  run.run_view.questions = [{ id: "q-1", requirementId: "req-1", question: "负责什么接口？", answer: "登录鉴权接口" }];
  const input = draftingInput(run);
  assert.equal(input.sourceCatalog.length, 2);
  for (const source of input.sourceCatalog)
    assert.deepEqual(source.requirementIds, ["req-1"]);
  assert.equal(input.sourceCatalog[0].quote, exampleSnapshot.workExperience[0].description);
  assert.equal(input.sourceCatalog[1].quote, "登录鉴权接口");
});
