import { z } from "zod";
import {
  changeSchema,
  draftingSchema,
  targetSchema,
} from "../../shared/agent.schema.js";
import {
  targetValue,
  snapshotReferences,
  type ResumeSnapshot,
  type RunView,
  type ChangeTarget,
} from "../../shared/agent.js";
import { ToolResultError } from "./errors.js";
import type { RunRecord } from "./store.js";
import { quoteSlices } from "./evidence.js";

// The model proposes edits; the immutable run snapshot supplies before.
// Public changes retain the shared schema, including the exact original value.
export const draftProposalSchema = draftingSchema.extend({
  result: draftingSchema.shape.result.extend({
    changes: z
      .array(
        changeSchema.omit({ before: true }).extend({
          sources: z
            .array(z.object({ id: z.string().min(1).max(160) }).strict())
            .min(1)
            .max(12),
        }),
      )
      .max(20),
  }),
});
export function originalTargetValue(
  snapshot: ResumeSnapshot,
  target: unknown,
  path: string,
): string | string[] {
  const checked = targetSchema.safeParse(target);
  if (!checked.success)
    throw new ToolResultError(
      "修改目标不在允许的字段中",
      path,
      "target_not_allowed",
    );
  const value = targetValue(snapshot, checked.data);
  if (value === undefined)
    throw new ToolResultError("修改目标不存在", path, "target_not_found");
  return structuredClone(value);
}
export function draftTargets(snapshot: ResumeSnapshot): ChangeTarget[] {
  return [
    ...snapshot.education.map((item) => ({
      section: "education" as const,
      itemId: item.id,
      field: "description" as const,
    })),
    ...snapshot.workExperience.flatMap((item) =>
      (["description", "highlights"] as const).map((field) => ({
        section: "workExperience" as const,
        itemId: item.id,
        field,
      })),
    ),
    ...snapshot.projects.map((item) => ({
      section: "projects" as const,
      itemId: item.id,
      field: "description" as const,
    })),
    { section: "selfEvaluation", field: "selfEvaluation" },
  ];
}
export function resolveDraftProposals(
  proposal: z.infer<typeof draftProposalSchema>,
  snapshot: ResumeSnapshot,
  catalog: ReturnType<typeof draftSourceCatalog>,
): RunView["changes"] {
  return proposal.result.changes.map((change, index) => ({
    ...change,
    before: originalTargetValue(
      snapshot,
      change.target,
      `$.result.changes[${index}].target`,
    ),
    sources: change.sources.map((selected, sourceIndex) => {
      const source = catalog.get(selected.id);
      if (!source)
        throw new ToolResultError(
          "修改来源必须来自给定目录",
          `$.result.changes[${index}].sources[${sourceIndex}].id`,
          "unknown_source",
        );
      return { ...source };
    }),
  }));
}
export function draftSourceCatalog(run: RunRecord) {
  const catalog = new Map<
    string,
    RunView["changes"][number]["sources"][number]
  >();
  const allowed = new Set(
    run.run_view.evidence.flatMap((e) => e.refs.map((ref) => ref.id)),
  );
  for (const ref of snapshotReferences(run.resume_snapshot)) {
    if (!allowed.has(ref.id)) continue;
    for (const quote of quoteSlices(ref.quote))
      catalog.set(`source-${catalog.size + 1}`, {
        kind: "resume",
        refId: ref.id,
        quote,
      });
  }
  for (const question of run.run_view.questions) {
    if (!question.answer) continue;
    for (const quote of quoteSlices(question.answer))
      catalog.set(`source-${catalog.size + 1}`, {
        kind: "answer",
        refId: question.id,
        quote,
      });
  }
  return catalog;
}
