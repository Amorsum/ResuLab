import { z } from "zod";
import {
  changeSchema,
  draftingSchema,
  targetSchema,
} from "../../shared/agent.schema.js";
import {
  targetValue,
  type ResumeSnapshot,
  type RunView,
  type ChangeTarget,
} from "../../shared/agent.js";
import { ToolResultError } from "./errors.js";

// The model proposes edits; the immutable run snapshot supplies before.
// Public changes retain the shared schema, including the exact original value.
export const draftProposalSchema = draftingSchema.extend({
  result: draftingSchema.shape.result.extend({
    changes: z.array(changeSchema.omit({ before: true })).max(20),
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
): RunView["changes"] {
  return proposal.result.changes.map((change, index) => ({
    ...change,
    before: originalTargetValue(
      snapshot,
      change.target,
      `$.result.changes[${index}].target`,
    ),
  }));
}
