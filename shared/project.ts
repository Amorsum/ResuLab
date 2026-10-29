import { z } from 'zod';

export const PROJECT_LIMITS = { archiveBytes: 50 * 1024 * 1024, expandedBytes: 200 * 1024 * 1024, entries: 10000, fileBytes: 512 * 1024, retainedChars: 4000000, analysisChars: 72000, selectedFiles: 200, chunkChars: 24000 } as const;
export interface ProjectFile { path: string; text: string; chars: number; selected: boolean }
/** Include JSON escaping and paths in the model budget, not just raw source text. */
export function projectSelectionBudget(files: ProjectFile[]) { return files.reduce((sum, file) => sum + JSON.stringify({ path: file.path, startLine: 1, text: file.text }).length + 1, 2); }
export interface ProjectMaterial {
  id: string; name: string; source: 'zip' | 'github' | 'gitee'; url: string; commit: string;
  files: ProjectFile[]; excluded: number; createdAt: number; deleted?: boolean;
}
export const findingSchema = z.object({ text: z.string().min(1).max(1000), kind: z.enum(['documentation', 'implementation']), path: z.string().max(500), startLine: z.number().int().positive(), endLine: z.number().int().positive(), quote: z.string().min(1).max(4000) }).strict();
export const projectUnderstandingSchema = z.object({ projectName: z.string().min(1).max(120), summary: z.string().min(1).max(2000), findings: z.array(findingSchema).min(1).max(16), unknowns: z.array(z.string().max(500)).max(8), questions: z.array(z.object({ field: z.enum(['role', 'actions', 'outcomes']), question: z.string().min(1).max(500) }).strict()).max(3).optional() }).strict();
export type ProjectUnderstanding = z.infer<typeof projectUnderstandingSchema>;
export interface ProjectEvidence extends z.infer<typeof findingSchema> { id: string; materialId: string }
export const projectDraftEditSchema = z.object({ projectName: z.string().max(120), role: z.string().max(200), summary: z.string().max(1600), bullets: z.array(z.string().max(1000)).max(5), techStack: z.array(z.string().max(80)).max(20) }).strict();
export const projectDraftSchema = projectDraftEditSchema.extend({ projectName: z.string().trim().min(1).max(120), bullets: z.array(z.string().trim().min(1).max(1000)).min(1).max(5) });
export type ProjectDraft = z.infer<typeof projectDraftSchema>;
export const projectAnswersSchema = z.object({ role: z.string().max(1000), actions: z.string().max(4000), outcomes: z.string().max(2000) }).strict();
export interface ProjectSession {
  id: string; revision: number; title: string; materialId: string; selectedPaths: string[];
  step: 1 | 2 | 3; status: 'idle' | 'queued' | 'running' | 'failed' | 'completed';
  understanding?: ProjectUnderstanding; evidence: ProjectEvidence[];
  answers: z.infer<typeof projectAnswersSchema>; understandingCorrection: string;
  draft?: ProjectDraft; previousDraft?: ProjectDraft; proposal?: ProjectDraft;
  entryId: string; savedEntryRevision?: number; runId?: string; error?: string;
  materialDeleted?: boolean; createdAt: number; updatedAt: number;
  analysisStale?: boolean;
}
export interface ProjectRunContext { sessionId: string; sessionRevision: number; action: 'analyze' | 'draft' | 'rewrite'; instruction?: string; field?: string; inputSignature?: string; partials: ProjectUnderstanding[] }
export const PROJECT_QUESTIONS = [
  ['role', '你在项目中的角色是什么？哪些部分由你负责，哪些由团队其他成员完成？'],
  ['actions', '你本人完成了哪些具体实现、技术选择或问题处理？可以结合上面的文件说明。'],
  ['outcomes', '实际交付或验证到了哪一步？有可核实的效果或数据吗？不知道可以留空。'],
] as const;

export function projectDescription(draft: ProjectDraft) { return [draft.summary, ...draft.bullets.map(text => `• ${text}`)].filter(Boolean).join('\n'); }
export function hasProjectContribution(answers: ProjectSession['answers']) { return [answers.role, answers.actions].every(value => Boolean(value.trim()) && !/^(?:不知道|不清楚|未知|待补充|跳过|不确定|无|暂无)[。！!\s]*$/.test(value.trim())); }
export function assertProjectEvidence(finding: z.infer<typeof findingSchema>, files: ProjectFile[]) {
  const file = files.find(f => f.path === finding.path);
  if (!file || finding.endLine < finding.startLine || finding.endLine - finding.startLine > 40) throw new Error('证据文件或行号无效');
  const lines = file.text.split('\n');
  if (finding.endLine > lines.length || !lines.slice(finding.startLine - 1, finding.endLine).join('\n').includes(finding.quote)) throw new Error('证据片段与原文不一致');
}
/** Rewriting may change only the requested field; the rest is copied from the user's current draft. */
export function mergeProjectRewrite(current: ProjectDraft, proposed: ProjectDraft, field: string) {
  const next = structuredClone(current);
  if (field === 'summary' || field === 'role' || field === 'projectName') next[field] = proposed[field];
  else if (/^bullet:[0-4]$/.test(field)) { const i = Number(field.split(':')[1]); if (!current.bullets[i] || !proposed.bullets[i]) throw new Error('所选段落不存在'); next.bullets[i] = proposed.bullets[i]; }
  else throw new Error('请选择需要修改的段落');
  return next;
}
