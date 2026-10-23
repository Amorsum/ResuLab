import type { z } from "zod";
import {
  resumeSnapshotSchema,
  type runViewSchema,
  type targetSchema,
  type referenceSchema,
  type createRunSchema,
} from "./agent.schema.js";
export { AGENT_LIMITS, PROTOCOL_VERSION } from "./agent.schema.js";
export type ResumeSnapshot = z.infer<typeof resumeSnapshotSchema>;
export type RunView = z.infer<typeof runViewSchema>;
export type RunStatus = RunView["status"];
export type ChangeTarget = z.infer<typeof targetSchema>;
export type EvidenceReference = z.infer<typeof referenceSchema>;
export type CreateRunInput = z.infer<typeof createRunSchema>;

/** Same whitelist and hash in browser and Node. Arrays retain order and business IDs. */
export function snapshotFromResume(resume: object): ResumeSnapshot {
  const raw = resume as Record<string, unknown>;
  return resumeSnapshotSchema.parse(
    Object.fromEntries(
      [
        "education",
        "workExperience",
        "projects",
        "skills",
        "certificates",
        "languages",
        "selfEvaluation",
      ].map((key) => [key, raw[key]]),
    ),
  );
}
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .filter((key) => obj[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(obj[key])}`)
    .join(",")}}`;
}
export async function sha256(value: unknown): Promise<string> {
  const hash = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(stableStringify(value)),
  );
  return Array.from(new Uint8Array(hash), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
export async function resumeRevision(resume: object): Promise<string> {
  return sha256(snapshotFromResume(resume));
}
export function referenceId(
  section: string,
  itemId: string | undefined,
  field: string,
): string {
  return `resume:${section}:${encodeURIComponent(itemId ?? "")}:${field}`;
}
export function snapshotReferences(
  snapshot: ResumeSnapshot,
): EvidenceReference[] {
  const refs: EvidenceReference[] = [];
  for (const [section, items] of Object.entries(snapshot)) {
    if (typeof items === "string") {
      if (items.trim())
        refs.push({
          id: referenceId(section, undefined, section),
          section: "selfEvaluation",
          field: section,
          quote: items,
        });
      continue;
    }
    for (const item of items)
      for (const [field, value] of Object.entries(item)) {
        if (field === "id") continue;
        const quote = Array.isArray(value)
          ? value.join("\n")
          : typeof value === "string"
            ? value
            : "";
        if (quote.trim())
          refs.push({
            id: referenceId(section, item.id, field),
            section: section as EvidenceReference["section"],
            itemId: item.id,
            field,
            quote,
          });
      }
  }
  return refs;
}
export function targetValue(
  snapshot: ResumeSnapshot,
  target: ChangeTarget,
): string | string[] | undefined {
  if (target.section === "selfEvaluation") return snapshot.selfEvaluation;
  const item = snapshot[target.section].find(
    (item) => item.id === target.itemId,
  );
  return item
    ? (item as unknown as Record<string, string | string[]>)[target.field]
    : undefined;
}
