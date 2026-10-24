import { test } from "node:test";
import assert from "node:assert/strict";
import {
  evidenceCatalog,
  evidenceSelectionSchema,
  resolveEvidenceSelections,
} from "../src/evidence.js";
import { matchingSchema } from "../../shared/agent.schema.js";
import { exampleSnapshot, agentExamples } from "../../shared/agent.examples.js";
import { validateEvidence } from "../src/engine.js";
import type { RunRecord } from "../src/store.js";

test("model selections resolve to immutable source quotations and the unchanged public protocol", () => {
  const catalog = evidenceCatalog(exampleSnapshot);
  const id = [...catalog].find(([, ref]) => ref.field === "description")![0];
  const selection = evidenceSelectionSchema.parse({
    tool: "find_resume_evidence",
    result: {
      evidence: [
        { requirementId: "req-1", coverage: "supported", refs: [{ id }] },
      ],
      questions: [],
    },
  });
  const resolved = resolveEvidenceSelections(selection, catalog);
  matchingSchema.parse(resolved);
  assert.equal(
    resolved.result.evidence[0].refs[0].quote,
    "使用 TypeScript 开发接口",
  );
  const run = {
    resume_snapshot: structuredClone(exampleSnapshot),
    run_view: { ...structuredClone(agentExamples.running), ...resolved.result },
  } as RunRecord;
  validateEvidence(run);
  resolved.result.evidence[0].refs[0].quote = "捏造的事实";
  assert.throws(() => validateEvidence(run), {
    code: "TOOL_RESULT_INVALID",
    path: "$.result.evidence[0].refs[0].quote",
    rule: "quote_not_in_source",
  });
  assert.equal(catalog.get(id)!.quote, "使用 TypeScript 开发接口");
});
test("invented IDs and model-written quote/locator fields cannot bypass source validation", () => {
  const make = (ref: unknown) => ({
    tool: "find_resume_evidence",
    result: {
      evidence: [
        { requirementId: "req-1", coverage: "supported", refs: [ref] },
      ],
      questions: [],
    },
  });
  assert.equal(
    evidenceSelectionSchema.safeParse(
      make({ id: "evidence-1", quote: "捏造文字" }),
    ).success,
    false,
  );
  const selection = evidenceSelectionSchema.parse(make({ id: "unknown-id" }));
  assert.throws(
    () =>
      resolveEvidenceSelections(selection, evidenceCatalog(exampleSnapshot)),
    { code: "TOOL_RESULT_INVALID", path: "$.result.evidence[0].refs[0].id" },
  );
});
test("long highlights and Unicode are sliced without inventing text or exceeding quote limits", () => {
  const snapshot = structuredClone(exampleSnapshot);
  snapshot.workExperience[0].highlights = [
    "a".repeat(599) + "😀" + "b".repeat(3000),
    "c".repeat(3000),
  ];
  const joined = snapshot.workExperience[0].highlights.join("\n");
  const refs = [...evidenceCatalog(snapshot).values()].filter(
    (r) => r.field === "highlights",
  );
  assert.ok(refs.length > 1);
  assert.equal(refs.map((r) => r.quote).join(""), joined);
  for (const ref of refs) {
    assert.ok(joined.includes(ref.quote));
    assert.ok(ref.quote.length <= 600);
    assert.ok(!/[\uD800-\uDBFF]$/.test(ref.quote));
  }
});
