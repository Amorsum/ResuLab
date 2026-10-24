import { z } from "zod";
import { evidenceSchema, matchingSchema } from "../../shared/agent.schema.js";
import {
  snapshotReferences,
  type ResumeSnapshot,
  type EvidenceReference,
} from "../../shared/agent.js";
import { ToolResultError } from "./errors.js";

// Internal model protocol: select an opaque catalog ID. Public evidence continues
// to use the shared protocol, populated from immutable source slices by the server.
export const evidenceSelectionSchema = matchingSchema.extend({
  result: matchingSchema.shape.result.extend({
    evidence: z
      .array(
        evidenceSchema.extend({
          refs: z
            .array(z.object({ id: z.string().min(1).max(160) }).strict())
            .max(12),
        }),
      )
      .max(20),
  }),
});
export function evidenceCatalog(snapshot: ResumeSnapshot) {
  const catalog = new Map<string, EvidenceReference>();
  for (const reference of snapshotReferences(snapshot)) {
    // Bound repeated quotations and support highlights joined across many items.
    // Each quote remains a literal contiguous slice of one source field.
    for (const quote of quoteSlices(reference.quote))
      catalog.set(`evidence-${catalog.size + 1}`, { ...reference, quote });
  }
  return catalog;
}
export function* quoteSlices(text: string) {
  for (let start = 0; start < text.length;) {
    let end = Math.min(start + 600, text.length);
    if (end < text.length && /[\uD800-\uDBFF]/.test(text[end - 1])) end--;
    const quote = text.slice(start, end).trim();
    if (quote) yield quote;
    start = end;
  }
}
export function resolveEvidenceSelections(
  selection: z.infer<typeof evidenceSelectionSchema>,
  catalog: Map<string, EvidenceReference>,
): z.infer<typeof matchingSchema> {
  return {
    ...selection,
    result: {
      ...selection.result,
      evidence: selection.result.evidence.map((evidence, i) => ({
        ...evidence,
        refs: evidence.refs.map((ref, j) => {
          const source = catalog.get(ref.id);
          if (!source)
            throw new ToolResultError(
              "简历证据必须来自给定证据目录",
              `$.result.evidence[${i}].refs[${j}].id`,
              "unknown_reference",
            );
          return { ...source };
        }),
      })),
    },
  };
}
