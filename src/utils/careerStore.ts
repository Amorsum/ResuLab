import { entryInputSchema, entryDetailsSchema, entryFacts, sectionKind, selectionSchema, type CareerEntry, type CareerEntryInput } from '../../shared/careerEntries';
import { CAREER_SECTIONS, parseCareerFact } from '../../shared/career';
import { createEmptyResume } from '../constants/defaultResume';
import { cleanLibraryResume, readLibrary, type CareerLibrary, type LibrarySource } from './careerLibrary';
import { supabase } from '../lib/supabase';

export class CareerApiError extends Error { constructor(message: string, public status = 0, public code?: string) { super(message); } }
export async function careerRequest<T>(token: string, path: string, body?: unknown, method?: string, signal?: AbortSignal): Promise<T> {
  const base = (import.meta.env.VITE_AGENT_API_BASE || 'http://localhost:8788').replace(/\/$/, '');
  let response: Response;
  try { response = await fetch(`${base}/api/career${path}`, { method: method || (body === undefined ? 'GET' : 'POST'),
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(30000)]) });
  } catch { throw new CareerApiError(signal?.aborted ? '已停止等待同步，本机经历仍保留' : '无法连接经历库后端，请检查本地服务和网络后重试；本机经历仍保留'); }
  const value = await response.json().catch(() => null);
  if (!response.ok) throw new CareerApiError(value?.error?.message || '经历库服务暂不可用，本机内容已保留', response.status, value?.error?.code);
  return value as T;
}
export interface PendingEntry { input: CareerEntryInput; expectedRevision: number; confirm: boolean; error?: string; conflict?: boolean }
export interface CareerWorkspace { ownerId: string; entries: CareerEntry[]; pending: Record<string, PendingEntry>; remote: CareerEntry[] }
export const emptyCareerWorkspace = (ownerId: string): CareerWorkspace => ({ ownerId, entries: [], pending: {}, remote: [] });
async function database() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open('resulab-career-v2', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('workspaces', { keyPath: 'ownerId' });
    req.onsuccess = () => resolve(req.result); req.onerror = () => reject(new Error('无法读取本机经历草稿'));
  });
}
export async function mutateCareerWorkspace(ownerId: string, mutate: (value: CareerWorkspace) => CareerWorkspace): Promise<CareerWorkspace> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('workspaces', 'readwrite'), store = tx.objectStore('workspaces'), get = store.get(ownerId);
    let next: CareerWorkspace, error: unknown;
    get.onsuccess = () => { try { next = mutate(get.result || emptyCareerWorkspace(ownerId)); store.put(next); } catch (e) { error = e; tx.abort(); } };
    tx.oncomplete = () => { db.close(); resolve(next); };
    tx.onabort = tx.onerror = () => { db.close(); reject(error || new Error('本机草稿保存失败，请先导出或复制输入')); };
  });
}
export async function readCareerWorkspace(ownerId: string): Promise<CareerWorkspace> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('workspaces', 'readonly'), req = tx.objectStore('workspaces').get(ownerId);
    tx.oncomplete = () => { db.close(); resolve(req.result || emptyCareerWorkspace(ownerId)); };
    tx.onerror = () => { db.close(); reject(new Error('本机草稿读取失败')); };
  });
}
export async function refreshCareerWorkspace(ownerId: string, token: string) {
  const remote = await careerRequest<CareerEntry[]>(token, '/entries');
  return mutateCareerWorkspace(ownerId, current => ({ ...current, remote,
    entries: [...remote.filter(e => !current.pending[e.id]), ...current.entries.filter(e => current.pending[e.id])] }));
}
export async function syncCareerWorkspace(ownerId: string, token: string): Promise<CareerWorkspace> {
  const snapshot = await readCareerWorkspace(ownerId);
  for (const [id, pending] of Object.entries(snapshot.pending)) {
    if (pending.conflict) continue;
    try {
      const entry = await careerRequest<CareerEntry>(token, pending.expectedRevision ? `/entries/${id}` : '/entries',
        { entry: pending.input, expectedRevision: pending.expectedRevision, confirm: pending.confirm }, pending.expectedRevision ? 'PATCH' : 'POST');
      await mutateCareerWorkspace(ownerId, current => {
        if (JSON.stringify(current.pending[id]) !== JSON.stringify(pending)) return current;
        delete current.pending[id]; current.entries = [...current.entries.filter(e => e.id !== id), entry]; return current;
      });
    } catch (error) {
      await mutateCareerWorkspace(ownerId, current => {
        if (JSON.stringify(current.pending[id]) === JSON.stringify(pending)) current.pending[id] = { ...pending, error: error instanceof Error ? error.message : '待上传', conflict: error instanceof CareerApiError && error.status === 409 };
        return current;
      });
      // Connectivity/auth failures affect all following requests. Conflicts are per entry.
      if (!(error instanceof CareerApiError && error.status === 409)) break;
    }
  }
  return refreshCareerWorkspace(ownerId, token);
}
export async function saveCareerEntry(ownerId: string, input: CareerEntryInput, expectedRevision: number, confirm = false, token?: string) {
  const parsed = entryInputSchema.parse(input), now = Date.now();
  await mutateCareerWorkspace(ownerId, current => {
    const old = current.entries.find(e => e.id === input.id), pending = current.pending[input.id];
    if (old && !pending && old.revision !== expectedRevision) throw new Error('本机经历已变化，请重新打开核对');
    const entry: CareerEntry = { ...parsed, status: confirm ? parsed.status : parsed.status === 'archived' ? 'archived' : 'draft', ownerId, revision: ownerId === 'local-guest' ? (old?.revision || 0) + 1 : old?.revision || 1, createdAt: old?.createdAt || now, updatedAt: now };
    current.entries = [...current.entries.filter(e => e.id !== entry.id), entry];
    if (ownerId !== 'local-guest') current.pending[entry.id] = { input: { ...parsed, status: entry.status }, expectedRevision: pending?.expectedRevision ?? expectedRevision, confirm };
    return current;
  });
  if (token) { try { return await syncCareerWorkspace(ownerId, token); } catch { /* local pending is authoritative until upload succeeds */ } }
  return readCareerWorkspace(ownerId);
}
export const entryInput = (entry: CareerEntry): CareerEntryInput => { const { ownerId: _o, revision: _r, createdAt: _c, updatedAt: _u, ...input } = entry; return input; };
export function blankCareerEntry(): CareerEntryInput {
  return { id: crypto.randomUUID(), title: '', kind: 'project', rawText: '', details: entryDetailsSchema.parse({}), facts: [], status: 'draft', doNotClaim: '', groupId: '', migrationKey: null, relatedEntryId: null };
}
export async function stableCareerId(key: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key)));
  bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
  const h = [...bytes.slice(0, 16)].map(b => b.toString(16).padStart(2, '0')).join(''); return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
export async function splitLegacyLibrary(library: CareerLibrary): Promise<CareerEntryInput[]> {
  const entries: CareerEntryInput[] = [];
  for (const source of library.sources) for (const section of CAREER_SECTIONS) for (const row of source.resume[section]) {
    // Default proficiency/degree and generated IDs do not make an empty form row an experience.
    if (!Object.entries(row).some(([field, value]) => !['id', 'degree', 'level', 'category', 'isCurrent'].includes(field) &&
      (typeof value === 'string' ? Boolean(value.trim()) : Array.isArray(value) && value.some(item => typeof item === 'string' && item.trim())))) continue;
    const key = `${library.ownerId}:${source.id}:${section}:${row.id}`, id = await stableCareerId(key), factId = await stableCareerId(`${key}:fact`);
    const data = row as unknown as Record<string, unknown>, title = String(data.projectName || data.companyName || data.schoolName || data.skillName || data.name || data.language || source.title);
    entries.push(entryInputSchema.parse({ ...blankCareerEntry(), id, title, kind: sectionKind(section), rawText: source.originalText,
      groupId: source.id, migrationKey: key, doNotClaim: source.doNotClaim, status: source.confirmed ? 'confirmed' : 'draft',
      facts: [parseCareerFact({ id: factId, section, data: { ...row, id: factId }, sourceTitle: source.title, doNotClaim: source.doNotClaim })] }));
  }
  return entries;
}
export function exportCareerBackup(workspace: CareerWorkspace, legacy?: CareerLibrary): string {
  return JSON.stringify({ format: 'resulab-career-library', version: 2, entries: workspace.entries, drafts: legacy?.drafts || [] }, null, 2);
}
export function parseCareerBackup(raw: string): { entries: CareerEntryInput[]; drafts: CareerLibrary['drafts'] } {
  if (raw.length > 20000000) throw new Error('备份超过 20 MB，请分批整理');
  const value = JSON.parse(raw);
  if (value?.format !== 'resulab-career-library' || value.version !== 2 || !Array.isArray(value.entries) || value.entries.length > 1000 || !Array.isArray(value.drafts) || value.drafts.length > 200) throw new Error('不是受支持的备份');
  const ids = new Map<string, string>(value.entries.map((e: CareerEntry) => [e.id, crypto.randomUUID()]));
  return { entries: value.entries.map((e: CareerEntry) => entryInputSchema.parse({ ...entryInput(e), id: ids.get(e.id), relatedEntryId: e.relatedEntryId ? ids.get(e.relatedEntryId) || null : null,
    status: 'draft', migrationKey: null })), drafts: value.drafts.map((d: CareerLibrary['drafts'][number]) => ({ id: crypto.randomUUID(), title: String(d.title || '恢复副本').slice(0, 120), jdText: '', createdAt: Date.now(), kind: 'editor-backup', resume: cleanLibraryResume(d.resume) })) };
}
/** Compatibility adapter for jobs: prefer confirmed v2 entries, preserve the v1 fallback. */
export async function readUnifiedLibrary(ownerId: string): Promise<CareerLibrary> {
  const legacy = await readLibrary(ownerId);
  let workspace = await readCareerWorkspace(ownerId);
  if (ownerId !== 'local-guest') {
    const { data } = await supabase.auth.getSession();
    if (data.session?.user.id !== ownerId) throw new Error('账号已变化，请重新打开工作台');
    workspace = await refreshCareerWorkspace(ownerId, data.session.access_token);
  }
  if (!workspace.entries.length) return legacy;
  let selected: Set<string> | undefined;
  if (typeof localStorage !== 'undefined') {
    const raw = localStorage.getItem(`resulab.career-selection:${ownerId}`);
    if (raw) {
      let stored: unknown;
      try { stored = JSON.parse(raw); } catch { throw new Error('本次选材状态无法读取，请回经历库重新选择'); }
      const parsed = selectionSchema.safeParse((stored as { selection?: unknown })?.selection);
      if (!parsed.success) throw new Error('本次选材状态无效或超过上限，请回经历库重新选择');
      selected = new Set(parsed.data.selectedIds);
      const available = new Set(workspace.entries.filter(e => e.status === 'confirmed' && !workspace.pending[e.id]).flatMap(e => entryFacts([e]).map(f => f.id)));
      if ([...selected].some(id => !available.has(id))) throw new Error('部分已选经历已归档、撤回确认或待同步，请回经历库核对选材');
    }
  }
  const sources: LibrarySource[] = workspace.entries.filter(e => e.status === 'confirmed' && !workspace.pending[e.id]).map(e => {
    const resume = createEmptyResume();
    for (const f of entryFacts([e])) if (!selected || selected.has(f.id)) (resume[f.section] as object[]).push(f.data);
    return { id: e.id, title: e.title, kind: 'paste', createdAt: e.createdAt, resume, confirmed: true, included: true, doNotClaim: e.doNotClaim, originalText: e.rawText };
  });
  return { ...legacy, sources: sources.filter(s => CAREER_SECTIONS.some(section => s.resume[section].length)) };
}
