import { z } from 'zod';
import { changeSchema } from '../../shared/agent.schema';
import { resumeRevision, snapshotFromResume, stableStringify, targetValue, type RunView } from '../../shared/agent';
import type { ResumeData } from '../types/resume';

export interface AgentApplication {
  baseSnapshot: string;
  changes: RunView['changes'];
}
// A literal comparison only: this does not evaluate relevance or factual quality.
export function isFormattingOnlyChange(change: Pick<RunView['changes'][number], 'before' | 'after'>): boolean {
  const sameText = (before: string, after: string) => {
    const a = before.replace(/\s+/gu, '');
    const b = after.replace(/\s+/gu, '');
    return a === b || (a.length > 0 && b === `${a}。`) || (b.length > 0 && a === `${b}。`);
  };
  if (typeof change.before === 'string' && typeof change.after === 'string') return sameText(change.before, change.after);
  return Array.isArray(change.before) && Array.isArray(change.after)
    && change.before.length === change.after.length
    && change.before.every((before, index) => sameText(before, change.after[index]));
}
export function validateAgentChanges(state: ResumeData, payload: AgentApplication): void {
  const snapshot = snapshotFromResume(state);
  if (stableStringify(snapshot) !== payload.baseSnapshot) throw new Error('简历已修改或重排，请重新分析后再应用建议。');
  const changes = z.array(changeSchema).min(1).max(20).parse(payload.changes);
  const targets = new Set<string>();
  const ids = new Set<string>();
  for (const change of changes) {
    const target = stableStringify(change.target);
    if (targets.has(target) || ids.has(change.id)) throw new Error('建议存在重复目标，请重新分析。');
    targets.add(target); ids.add(change.id);
    const before = targetValue(snapshot, change.target);
    if (before === undefined || stableStringify(before) !== stableStringify(change.before)) throw new Error('建议原文与当前简历不一致，请重新分析。');
    const isList = change.target.section === 'workExperience' && change.target.field === 'highlights';
    if ((isList ? !Array.isArray(change.after) || !Array.isArray(change.before) : typeof change.after !== 'string' || typeof change.before !== 'string') || !change.needsConfirmation) throw new Error('建议字段类型或确认标记无效，已拒绝整批修改。');
  }
}
export async function prepareAgentApplication(state: ResumeData, run: RunView, selected: string[]): Promise<AgentApplication> {
  if (run.status !== 'completed') throw new Error('请等待分析完成后再应用。');
  if (await resumeRevision(state) !== run.resumeRevision) throw new Error('简历已变化，请重新分析后再应用。');
  const changes = run.changes.filter(change => selected.includes(change.id));
  if (changes.length !== new Set(selected).size) throw new Error('选择的建议已失效，请重新选择。');
  const payload = { baseSnapshot: stableStringify(snapshotFromResume(state)), changes };
  validateAgentChanges(state, payload);
  return payload;
}
export function applyAgentChanges(state: ResumeData, payload: AgentApplication): ResumeData {
  try { validateAgentChanges(state, payload); } catch { return state; }
  const next = { ...state, lastModified: Date.now() };
  for (const { target, after } of payload.changes) {
    if (target.section === 'selfEvaluation') next.selfEvaluation = after as string;
    else Object.assign(next, { [target.section]: next[target.section].map(item => item.id === target.itemId ? { ...item, [target.field]: after } : item) });
  }
  return next;
}
