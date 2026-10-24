import { z } from "zod";

export type FailureKind =
  | "response_json_parse"
  | "content_missing"
  | "json_parse"
  | "field_validation"
  | "truncated"
  | "upstream_finish";
export interface ValidationDiagnostic {
  kind: FailureKind;
  issues: Array<{ path: string; code: string }>;
  position?: number;
}
// Only protocol field names and array indices may enter logs or repair prompts.
// In particular, do not log Zod messages, unexpected keys, values or model text.
const fields = new Set(
  "tool result requirements id text jdQuote required evidence requirementId coverage refs section itemId field quote questions question changes target before after reason sources kind refId needsConfirmation".split(
    " ",
  ),
);
const pathOf = (path: Array<string | number>) =>
  "$" +
  path
    .map((part) =>
      typeof part === "number"
        ? `[${part}]`
        : fields.has(part)
          ? `.${part}`
          : ".[field]",
    )
    .join("");
export function fieldIssues(error: z.ZodError): ValidationDiagnostic {
  const flatten = (issues: z.ZodIssue[]): z.ZodIssue[] =>
    issues.flatMap((issue) =>
      issue.code === "invalid_union"
        ? issue.unionErrors.flatMap((error) => flatten(error.issues))
        : [issue],
    );
  return {
    kind: "field_validation",
    issues: flatten(error.issues)
      .slice(0, 40)
      .map((issue) => ({
        path: pathOf(issue.path),
        code: issue.code,
      })),
  };
}
export function jsonFailure(
  kind: "json_parse" | "response_json_parse",
  error: unknown,
): ValidationDiagnostic {
  // Extract the numeric position only; V8's error message can quote private text.
  const position =
    error instanceof SyntaxError ? /position (\d+)/.exec(error.message) : null;
  return {
    kind,
    issues: [],
    ...(position ? { position: Number(position[1]) } : {}),
  };
}
export const finishReason = (value: unknown): string | null =>
  typeof value !== "string"
    ? null
    : [
          "stop",
          "length",
          "content_filter",
          "tool_calls",
          "function_call",
          "insufficient_system_resource",
          "aborted",
        ].includes(value)
      ? value
      : "unknown";
export const safeRequestId = (value: unknown): string | null =>
  typeof value === "string" && /^[A-Za-z0-9_.:/-]{1,200}$/.test(value)
    ? value
    : null;
