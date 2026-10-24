import type { RunView } from "../../shared/agent.js";
import { ToolResultError } from "./errors.js";
import { cosmeticContent } from "../../shared/resumeWritingSkill.js";
import { checkFactualClaims } from "../../shared/factualGuards.js";
import { CareerValidationError } from "../../shared/career.js";

// Preserve word order and technical symbols (C++, C#, versions, percentages).
// This only detects cosmetic edits; it does not prove relevance or factual truth.

export function validateDraftQuality(changes: RunView["changes"]): void {
  for (const [index, change] of changes.entries()) {
    try {
      checkFactualClaims(change.after, change.sources.map((source, i) => ({ id: String(i), factId: source.refId, field: 'description', quote: source.quote })), `$.result.changes[${index}].after`);
    } catch (error) {
      if (error instanceof CareerValidationError) throw new ToolResultError('建议包含无依据的责任、技能或重复表述，请保留事实边界', error.path, error.rule);
      throw error;
    }
    if (cosmeticContent(change.before) === cosmeticContent(change.after))
      throw new ToolResultError(
        "建议仅改变标点、空格或分行；请基于已验证事实改善岗位表达或信息顺序，无可改进时省略该项",
        `$.result.changes[${index}].after`,
        "cosmetic_only_change",
      );
  }
}
