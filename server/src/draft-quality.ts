import type { RunView } from "../../shared/agent.js";
import { ToolResultError } from "./errors.js";

// Preserve word order and technical symbols (C++, C#, versions, percentages).
// This only detects cosmetic edits; it does not prove relevance or factual truth.
function content(value: string | string[]): string {
  return (Array.isArray(value) ? value.join("\n") : value)
    .replace(/\.(?=\s|$)/g, "")
    .replace(/[\s,，。;；:：!！?？、“”‘’「」『』()（）【】\[\]·•]/gu, "");
}

export function validateDraftQuality(changes: RunView["changes"]): void {
  for (const [index, change] of changes.entries()) {
    if (content(change.before) === content(change.after))
      throw new ToolResultError(
        "建议仅改变标点、空格或分行；请基于已验证事实改善岗位表达或信息顺序，无可改进时省略该项",
        `$.result.changes[${index}].after`,
        "cosmetic_only_change",
      );
  }
}
