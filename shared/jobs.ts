import { z } from 'zod';
import type { CareerPlan, CareerResult } from './career.js';
import type { ResumeData } from '../src/types/resume.js';

export const PROTOCOL = 1 as const;
export const APP_ORIGINS = ['http://127.0.0.1:3000', 'https://resulab.amorsum.top'];
export const MAX_PDF_BYTES = 8 * 1024 * 1024;
export const CHUNK_BYTES = 192 * 1024;
const text = (max: number) => z.string().max(max);
const ownerSchema = z.string().regex(/^[a-zA-Z0-9_-]{1,120}$/);
export const searchSchema = z.object({
  keyword: text(120).min(1), city: text(60), salaryMin: z.number().min(0).max(1000000),
  salaryMax: z.number().min(0).max(1000000), experience: text(60), education: text(60),
  jobType: z.enum(['', '实习', '全职', '兼职']), excludeCompanies: z.array(text(120)).max(100),
  limit: z.number().int().min(1).max(50),
}).strict().refine(v => !v.salaryMax || v.salaryMax >= v.salaryMin, '薪资上限不能小于下限');
export type JobSearch = z.infer<typeof searchSchema>;
export const defaultSearch: JobSearch = { keyword: '', city: '', salaryMin: 0, salaryMax: 0, experience: '', education: '', jobType: '', excludeCompanies: [], limit: 20 };
export const jobSchema = z.object({
  id: text(200).min(1), source: z.literal('boss'), url: z.string().url().max(2000).refine(value => {
    const url = new URL(value); return url.protocol === 'https:' && url.hostname === 'www.zhipin.com' && /^\/job_detail\/[\w~-]+\.html$/.test(url.pathname);
  }, '仅接受 BOSS 岗位详情链接'), title: text(200).min(1), company: text(200).min(1),
  recruiter: text(200), recruiterKey: text(300), city: text(100), salary: text(100), experience: text(100), education: text(100),
  jobType: z.enum(['', '实习', '全职', '兼职']), jdText: text(12000), collectedAt: z.number().finite(),
}).strict().refine(v => new URL(v.url).pathname === `/job_detail/${v.id}.html`, '岗位编号与链接不一致');
export type Job = z.infer<typeof jobSchema>;
export type JobMatch = { inputRevision: string; plan: CareerPlan; modelCalls: number };
export type DeliveryStatus = 'review' | 'queued' | 'communicated' | 'attachment_pending' | 'sent' | 'failed' | 'unknown' | 'cancelled';
export const statusLabels: Record<DeliveryStatus, string> = { review: '待审核', queued: '待执行', communicated: '已沟通', attachment_pending: '待发送附件', sent: '附件已发送', failed: '失败', unknown: '结果待核验', cancelled: '已取消' };
export interface JobDraft {
  resume: ResumeData; result: CareerResult; inputRevision: string; filename: string; hash: string; pdf: Blob; greeting: string;
}
export interface JobRecord { job: Job; selected: boolean; match?: JobMatch; draft?: JobDraft; error?: string; status: DeliveryStatus; note?: string; batchId?: string; reviewed?: boolean; allowExistingConversation?: boolean }
export interface JobsWorkspace { ownerId: string; revision: number; search: JobSearch; records: JobRecord[]; batchId?: string; eventSeq: number; updatedAt: number }
export const emptyJobs = (ownerId: string): JobsWorkspace => ({ ownerId, revision: 0, search: { ...defaultSearch }, records: [], eventSeq: 0, updatedAt: Date.now() });

export function filterJob(job: Job, search: JobSearch): { excluded: string[]; unknown: string[] } {
  const excluded: string[] = [], unknown: string[] = [];
  if (search.excludeCompanies.some(name => name.trim() && job.company.toLocaleLowerCase().includes(name.trim().toLocaleLowerCase()))) excluded.push('排除公司');
  for (const key of ['city', 'experience', 'education', 'jobType'] as const) {
    const expected = search[key]; if (!expected) continue;
    if (!job[key]) unknown.push(`${key === 'city' ? '城市' : key === 'experience' ? '经验' : key === 'education' ? '学历' : '类型'}待确认`);
    else if (key === 'city' ? !job.city.includes(expected) : job[key] !== expected && !['不限', '经验不限', '学历不限'].includes(job[key])) excluded.push(`${key === 'city' ? '城市' : key === 'experience' ? '经验' : key === 'education' ? '学历' : '类型'}不符合所选范围`);
  }
  if (search.salaryMin || search.salaryMax) {
    // Only compare explicit monthly K ranges. Daily/yearly/negotiable salaries remain unknown.
    const range = job.salary.match(/^(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)\s*[kK](?:[·•].*)?$/);
    if (!range) unknown.push('月薪范围待确认');
    else if ((search.salaryMin && Number(range[2]) * 1000 < search.salaryMin) || (search.salaryMax && Number(range[1]) * 1000 > search.salaryMax)) excluded.push('薪资范围不相交');
  }
  if (!job.jdText.trim()) unknown.push('缺少完整 JD');
  return { excluded, unknown };
}
export function coverage(plan: CareerPlan, requiredOnly = false): number {
  const items = plan.requirements.filter(item => !requiredOnly || item.required);
  return items.length ? items.reduce((sum, item) => sum + (item.coverage === 'supported' ? 1 : item.coverage === 'partial' ? 0.5 : 0), 0) / items.length : 0;
}
export function rankJobs(records: JobRecord[]): JobRecord[] {
  return [...records].sort((a, b) => (b.match ? coverage(b.match.plan, true) : -1) - (a.match ? coverage(a.match.plan, true) : -1)
    || (b.match ? coverage(b.match.plan) : -1) - (a.match ? coverage(a.match.plan) : -1));
}
export async function sha256(value: string | Uint8Array | Blob): Promise<string> {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value instanceof Blob ? new Uint8Array(await value.arrayBuffer()) : value;
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(bytes)))].map(n => n.toString(16).padStart(2, '0')).join('');
}
const hashSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const deliverySchema = z.object({ job: jobSchema, filename: text(240).min(1).refine(v => v.endsWith('.pdf') && !/[\\/\x00-\x1f]/.test(v)), hash: hashSchema,
  bytes: z.number().int().min(1).max(MAX_PDF_BYTES), greeting: text(1000).min(1), snapshotHash: hashSchema,
  allowExistingConversation: z.boolean(),
}).strict();
export type DeliveryItem = z.infer<typeof deliverySchema>;
export const manifestSchema = z.object({ id: z.string().uuid(), ownerId: ownerSchema, items: z.array(deliverySchema).min(1).max(20), createdAt: z.number().finite() }).strict()
  .refine(v => new Set(v.items.map(i => i.job.id)).size === v.items.length, '批次中岗位重复');
export type BatchManifest = z.infer<typeof manifestSchema>;
/** Normalize key order through the strict schema before hashing a reviewed wire payload. */
export async function manifestDigest(value: unknown): Promise<string> { return sha256(JSON.stringify(manifestSchema.parse(value))); }
export interface DeliveryEvent { seq: number; jobId: string; status: DeliveryStatus; message: string; at: number }
export interface BatchView { id: string; ownerId: string; state: 'paused' | 'running' | 'completed' | 'cancelled'; items: { jobId: string; status: DeliveryStatus }[]; events: DeliveryEvent[]; reason: string }
export interface Capabilities { read: boolean; search: boolean; communicate: boolean; attach: boolean; reason: string; adapterVersion: string }
export const BOSS_CAPABILITIES: Capabilities = {
  read: true, search: true, communicate: false, attach: false,
  reason: '公开页面读取与搜索可尝试；登录后会话身份、专用附件选择及发送回执尚未完成真实验收，发送保持禁用。', adapterVersion: 'boss-dom/0.1.0',
};
export type RequestType = 'PAIR' | 'STATUS' | 'SEARCH' | 'SEARCH_STATUS' | 'PREPARE' | 'PDF_CHUNK' | 'APPROVE' | 'PAUSE' | 'RESUME' | 'CANCEL' | 'EVENTS' | 'CLEAR' | 'DISCONNECT';
export interface BridgeRequest { channel: 'resulab-jobs'; version: 1; direction: 'request'; requestId: string; session: string; ownerId: string; type: RequestType; taskId: string; payload: unknown }
export const bridgeSchema = z.object({ channel: z.literal('resulab-jobs'), version: z.literal(1), direction: z.literal('request'), requestId: z.string().uuid(),
  session: text(100), ownerId: ownerSchema, type: z.enum(['PAIR', 'STATUS', 'SEARCH', 'SEARCH_STATUS', 'PREPARE', 'PDF_CHUNK', 'APPROVE', 'PAUSE', 'RESUME', 'CANCEL', 'EVENTS', 'CLEAR', 'DISCONNECT']), taskId: text(100), payload: z.unknown(),
}).strict();
