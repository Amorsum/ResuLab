import { test } from "node:test";
import assert from "node:assert/strict";
import { agentExamples, exampleSnapshot } from "../../shared/agent.examples.js";
import {
  runViewSchema,
  targetSchema,
  resumeSnapshotSchema,
} from "../../shared/agent.schema.js";
import {
  resumeRevision,
  stableStringify,
  snapshotFromResume,
} from "../../shared/agent.js";
import { evaluationCases } from "../../shared/agent.cases.js";

test("whitespace cannot masquerade as a source quote", () => {
  const view = structuredClone(agentExamples.completed);
  view.changes[0].sources[0].quote = "   ";
  assert.equal(runViewSchema.safeParse(view).success, false);
});

test("five synthetic front-end fixtures match the shared protocol", () => {
  assert.equal(Object.keys(agentExamples).length, 5);
  for (const fixture of Object.values(agentExamples))
    assert.deepEqual(runViewSchema.parse(fixture), fixture);
});
test("ten shared synthetic evaluation inputs satisfy input limits", () => {
  assert.equal(evaluationCases.length, 10);
  for (const item of evaluationCases)
    assert.equal(
      resumeSnapshotSchema.safeParse(item.resumeSnapshot).success,
      true,
    );
});
test("revision ignores layout, cloud IDs, timestamps and personal contact fields; detects content and ordering", async () => {
  const base = await resumeRevision(exampleSnapshot);
  assert.equal(
    await resumeRevision({
      ...exampleSnapshot,
      lastModified: 123,
      _cloudId: "cloud",
      personalInfo: { phone: "private" },
      fontSize: 18,
    }),
    base,
  );
  assert.equal(
    await resumeRevision(JSON.parse(stableStringify(exampleSnapshot))),
    base,
  );
  assert.notEqual(
    await resumeRevision({ ...exampleSnapshot, selfEvaluation: "new" }),
    base,
  );
  const extra = { ...exampleSnapshot.workExperience[0], id: "work-2" };
  assert.notEqual(
    await resumeRevision({
      ...exampleSnapshot,
      workExperience: [...exampleSnapshot.workExperience, extra],
    }),
    await resumeRevision({
      ...exampleSnapshot,
      workExperience: [extra, ...exampleSnapshot.workExperience],
    }),
  );
  assert.equal(
    "personalInfo" in
      snapshotFromResume({
        ...exampleSnapshot,
        personalInfo: { email: "private" },
      }),
    false,
  );
});
test("field whitelist rejects protected fields, arbitrary paths and duplicate IDs", () => {
  for (const target of [
    { section: "personalInfo", field: "fullName" },
    { section: "workExperience", itemId: "work-1", field: "companyName" },
    { section: "__proto__", field: "x" },
    { section: "projects", itemId: "p1", field: "description", path: "a.b" },
  ])
    assert.equal(targetSchema.safeParse(target).success, false);
  assert.equal(
    resumeSnapshotSchema.safeParse({
      ...exampleSnapshot,
      workExperience: [
        exampleSnapshot.workExperience[0],
        exampleSnapshot.workExperience[0],
      ],
    }).success,
    false,
  );
  assert.equal(
    resumeSnapshotSchema.safeParse({
      ...exampleSnapshot,
      personalInfo: { phone: "private" },
    }).success,
    false,
  );
});
