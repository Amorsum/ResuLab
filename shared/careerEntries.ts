import { z } from 'zod';
import { parseCareerFact, CareerValidationError, type CareerFact, type CareerPlan, type CareerResult, type CareerSection } from './career.js';

export const ENTRY_KINDS = ['project', 'competition', 'research', 'work', 'campus', 'volunteer', 'award', 'education', 'skill', 'other'] as const;
export const entryDetailsSchema = z.object({
  organization: z.string().max(200).default(''), role: z.string().max(200).default(''),
  startDate: z.string().max(20).default(''), endDate: z.string().max(20).default(''),
  action: z.string().max(4000).default(''), method: z.string().max(2000).default(''),
  outcome: z.string().max(2000).default(''), award: z.string().max(200).default(''),
  awardLevel: z.string().max(100).default(''), url: z.string().max(2000).refine(v => !v || /^https?:\/\//i.test(v), '链接须以 https:// 或 http:// 开头').default(''),
}).strict().refine(v => !v.startDate || !v.endDate || v.startDate <= v.endDate, '结束时间不能早于开始时间');
const factSchema = z.unknown().transform((value, ctx) => {
  try { return parseCareerFact(value); }
  catch { ctx.addIssue({ code: 'custom', message: '事实字段不合法' }); return z.NEVER; }
});
export const entryInputSchema = z.object({
  id: z.string().uuid(), title: z.string().trim().min(1).max(120), kind: z.enum(ENTRY_KINDS),
  rawText: z.string().max(20000), details: entryDetailsSchema,
  facts: z.array(factSchema).max(40), status: z.enum(['draft', 'confirmed', 'archived']),
  doNotClaim: z.string().max(1200), relatedEntryId: z.string().uuid().nullable().default(null),
  groupId: z.string().max(200).default(''), migrationKey: z.string().max(240).nullable().default(null),
  projectEvidence: z.array(z.object({ materialId: z.string().uuid(), evidenceId: z.string().max(160), path: z.string().max(500), startLine: z.number().int().positive(), endLine: z.number().int().positive() }).strict()).max(100).optional(),
}).strict().superRefine((value, ctx) => {
  if (value.status === 'confirmed' && !value.facts.length) ctx.addIssue({ code: 'custom', message: '请先整理并核对至少一条事实' });
  if (new Set(value.facts.map(f => f.id)).size !== value.facts.length) ctx.addIssue({ code: 'custom', message: '事实编号不能重复' });
  if (value.facts.some(f => f.id.length > 122)) ctx.addIssue({ code: 'custom', message: '事实编号过长' });
});
export type CareerEntryInput = z.infer<typeof entryInputSchema>;
export interface CareerEntry extends CareerEntryInput { ownerId: string; revision: number; createdAt: number; updatedAt: number }
export interface CareerOrigin { entryId: string; revision: number; factId: string; unverified?: boolean }
export interface CareerSelectionPlan {
  selectedIds: string[]; lockedIds: string[]; excludedIds: string[];
}
export const selectionSchema = z.object({
  selectedIds: z.array(z.string().max(160)).max(160), lockedIds: z.array(z.string().max(160)).max(160),
  excludedIds: z.array(z.string().max(160)).max(160),
}).strict().superRefine((v, ctx) => {
  if ([v.selectedIds, v.lockedIds, v.excludedIds].some(ids => new Set(ids).size !== ids.length) ||
    v.lockedIds.some(id => !v.selectedIds.includes(id)) || v.selectedIds.some(id => v.excludedIds.includes(id)))
    ctx.addIssue({ code: 'custom', message: '锁定、排除与入选清单冲突' });
});
export interface CareerRunContext {
  version: 2; target: { mode: 'role' | 'jd'; text: string }; entries: CareerEntry[];
  selection: CareerSelectionPlan; phase: 'recommend' | 'selection' | 'write' | 'review' | 'cancelled';
  plan?: CareerPlan; result?: CareerResult; useOriginal?: boolean;
  questions?: import('./careerReadiness.js').FactQuestion[];
}
export interface CareerRunView {
  runId: string; status: string; context: CareerRunContext; error?: { code: string; message: string; retryable: boolean };
  usage: { calls: number; elapsedMs: number; inputTokens: number | null; outputTokens: number | null };
}
export interface CareerApplicationRow { fact: CareerFact; origin: CareerOrigin; action: 'append' | 'replace' | 'skip'; targetId?: string }
export interface CareerApplicationPlan { base: string; rows: CareerApplicationRow[]; desiredPosition?: string; summary?: string }

/** Stable, entry-scoped IDs; array ordering never changes a fact's identity. */
export function entryFacts(entries: CareerEntry[]): CareerFact[] {
  return entries.filter(e => e.status === 'confirmed').flatMap(entry => entry.facts.map(fact => {
    const id = `${entry.id}:${fact.id}`;
    return parseCareerFact({ ...fact, id, data: { ...fact.data, id }, sourceTitle: entry.title, doNotClaim: entry.doNotClaim });
  }));
}
export function factOrigin(entries: CareerEntry[], id: string): CareerOrigin {
  for (const e of entries) for (const f of e.facts) if (`${e.id}:${f.id}` === id)
    return { entryId: e.id, revision: e.revision, factId: f.id };
  throw new Error('经历来源不存在');
}
export function selectionFacts(entries: CareerEntry[], selection: CareerSelectionPlan): CareerFact[] {
  selectionSchema.parse(selection);
  const facts = entryFacts(entries), known = new Map(facts.map(f => [f.id, f]));
  if ([...selection.selectedIds, ...selection.excludedIds].some(id => !known.has(id))) throw new CareerValidationError('unknown_fact', '$.selection');
  return selection.selectedIds.map(id => known.get(id)!);
}
export function selectedCareerPlan(plan: CareerPlan, selection: CareerSelectionPlan): CareerPlan {
  const selected = selection.selectedIds.map(factId => plan.selected.find(item => item.factId === factId) || { factId, requirementIds: [], reason: '用户手动保留，未认定为岗位证据' });
  return { ...plan, selected, requirements: plan.requirements.map(req => req.coverage === 'supported' && !selected.some(item => item.requirementIds.includes(req.id))
    ? { ...req, coverage: 'missing', gap: '原有证据已从本次选材移除' } : req) };
}
export function sectionKind(section: CareerSection): CareerEntryInput['kind'] {
  return ({ workExperience: 'work', projects: 'project', education: 'education', skills: 'skill', certificates: 'award', languages: 'skill' } as const)[section];
}
