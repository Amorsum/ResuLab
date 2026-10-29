import type { ResumeData } from '../types/resume';
import { resumeDocumentMetaSchema } from '../../shared/resumeDocument';
export interface ResumeDocumentRecord { ownerId: string; id: string; revision: number; resume: ResumeData; archived: boolean; updatedAt: number; history: { id: string; title: string; createdAt: number; resume: ResumeData }[]; cloudUpdatedAt?: string; syncError?: string }
export function identifyResume(resume: ResumeData, kind: 'base' | 'job' | 'unclassified' = 'unclassified'): ResumeData {
  const parsed = resumeDocumentMetaSchema.safeParse(resume.documentMeta);
  return { ...resume, documentMeta: parsed.success ? parsed.data : { id: crypto.randomUUID(), title: resume.jobIntention.desiredPosition || (resume.personalInfo.fullName ? `${resume.personalInfo.fullName}的简历` : '未命名简历'), kind } };
}
export function forkResume(resume: ResumeData, title: string, kind: 'base' | 'job' | 'unclassified' = 'job'): ResumeData {
  const original = identifyResume(resume), next = structuredClone(original); delete next._cloudId;
  delete next._cloudUpdatedAt;
  next.documentMeta = { id: crypto.randomUUID(), title: title.trim().slice(0, 120) || '简历副本', kind, ...(kind === 'job' ? { baseId: original.documentMeta!.baseId || original.documentMeta!.id, targetJob: title.slice(0, 200) } : {}) };
  next.lastModified = Date.now(); return next;
}
function database() { return new Promise<IDBDatabase>((resolve, reject) => { const req = indexedDB.open('resulab-resume-documents', 1); req.onupgradeneeded = () => req.result.createObjectStore('documents', { keyPath: ['ownerId', 'id'] }); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(new Error('无法打开简历列表，请检查本机存储权限')); }); }
export async function readResumeDocuments(ownerId: string): Promise<ResumeDocumentRecord[]> {
  const db = await database(); return new Promise((resolve, reject) => { const tx = db.transaction('documents', 'readonly'), req = tx.objectStore('documents').getAll(); tx.oncomplete = () => { db.close(); resolve((req.result as ResumeDocumentRecord[]).filter(r => r.ownerId === ownerId).sort((a, b) => b.updatedAt - a.updatedAt)); }; tx.onerror = () => { db.close(); reject(new Error('简历列表读取失败')); }; });
}
export async function mutateResumeDocument(ownerId: string, id: string, expected: number | undefined, change: (value?: ResumeDocumentRecord) => ResumeDocumentRecord): Promise<ResumeDocumentRecord> {
  const db = await database(); return new Promise((resolve, reject) => {
    const tx = db.transaction('documents', 'readwrite'), store = tx.objectStore('documents'), req = store.get([ownerId, id]); let next: ResumeDocumentRecord, error: unknown;
    req.onsuccess = () => { try { if (expected !== undefined && (req.result?.revision || 0) !== expected) throw new Error('这份简历已在其他页面更新，当前内容仍保留，请另存副本或重新打开'); next = change(req.result); next.ownerId = ownerId; next.id = id; next.revision = (req.result?.revision || 0) + 1; store.put(next); } catch (e) { error = e; tx.abort(); } };
    tx.oncomplete = () => { db.close(); resolve(next); }; tx.onerror = tx.onabort = () => { db.close(); reject(error || new Error('本机简历保存失败，请先导出备份')); };
  });
}
const content = (resume: ResumeData) => JSON.stringify({ ...resume, lastModified: 0 });
export async function persistResumeDocument(ownerId: string, resume: ResumeData, expected?: number, checkpoint?: string) {
  const next = identifyResume(resume), id = next.documentMeta!.id, db = await database();
  return new Promise<ResumeDocumentRecord>((resolve, reject) => {
    const tx = db.transaction('documents', 'readwrite'), store = tx.objectStore('documents'), req = store.get([ownerId, id]);
    let result: ResumeDocumentRecord, error: unknown;
    req.onsuccess = () => { try {
      const old = req.result as ResumeDocumentRecord | undefined;
      if (expected !== undefined && (old?.revision || 0) !== expected) throw new Error('这份简历已在其他页面更新，请保留当前内容并另存副本');
      if (old && content(old.resume) === content(next) && (!checkpoint || old.history.some((item, index) => index === 0 && content(item.resume) === content(next)))) { result = old; return; }
      const history = old?.history || [];
      if (checkpoint && old) history.unshift({ id: crypto.randomUUID(), title: checkpoint, createdAt: Date.now(), resume: structuredClone(old.resume) });
      result = { ownerId, id, revision: (old?.revision || 0) + 1, resume: next, archived: old?.archived || false, updatedAt: Date.now(), history: history.slice(0, 30), cloudUpdatedAt: old?.cloudUpdatedAt, syncError: old?.syncError };
      store.put(result);
    } catch (e) { error = e; tx.abort(); } };
    tx.oncomplete = () => { db.close(); resolve(result); }; tx.onerror = tx.onabort = () => { db.close(); reject(error || new Error('本机简历保存失败，请先导出备份')); };
  });
}
