import type { ResumeDocumentRecord } from './resumeDocuments';
import { cleanLibraryResume } from './careerLibrary';
import type { ResumeData } from '../types/resume';
export interface DocumentBackupRow { resume: ResumeData; archived: boolean; history: ResumeDocumentRecord['history'] }
export function exportDocumentBackup(records: ResumeDocumentRecord[]) {
  const text = JSON.stringify({ format: 'resulab-documents', version: 1, documents: records.map(({ resume, archived, history }) => ({ resume, archived, history })) });
  if (text.length > 20000000) throw new Error('备份超过 20 MB，请先减少历史记录或头像体积'); return text;
}
export function parseDocumentBackup(text: string): DocumentBackupRow[] {
  if (text.length > 20000000) throw new Error('备份超过 20 MB');
  const input = JSON.parse(text);
  if (input?.format !== 'resulab-documents' || input.version !== 1 || !Array.isArray(input.documents) || input.documents.length > 200) throw new Error('不是支持的简历文档备份');
  const documents = input.documents as DocumentBackupRow[], ids = new Map<string, string>();
  for (const row of documents) { const clean = cleanLibraryResume(row.resume); if (clean.documentMeta) { if (ids.has(clean.documentMeta.id)) throw new Error('备份含有重复的简历身份'); ids.set(clean.documentMeta.id, crypto.randomUUID()); } }
  const restore = (value: unknown, documentId?: string) => {
    const resume = cleanLibraryResume(value); delete resume._cloudId; delete resume._cloudUpdatedAt;
    if (resume.careerOrigins) resume.careerOrigins = Object.fromEntries(Object.entries(resume.careerOrigins).map(([key, origin]) => [key, { ...origin, unverified: true }]));
    const meta = resume.documentMeta;
    const baseId = meta?.baseId ? ids.get(meta.baseId) : undefined;
    resume.documentMeta = { id: documentId || (meta ? ids.get(meta.id) : undefined) || crypto.randomUUID(), title: meta?.title || '恢复的简历', kind: meta?.kind === 'job' && !baseId ? 'unclassified' : meta?.kind || 'unclassified', ...(baseId ? { baseId, targetJob: meta?.targetJob } : {}) };
    return resume;
  };
  return documents.map(row => {
    const resume = restore(row.resume);
    if (row.history !== undefined && (!Array.isArray(row.history) || row.history.length > 30)) throw new Error('历史记录格式不正确');
    return { resume, archived: row.archived === true, history: (row.history || []).map(item => { if (!item || typeof item.title !== 'string' || !Number.isFinite(item.createdAt)) throw new Error('历史记录格式不正确'); return { id: crypto.randomUUID(), title: item.title.slice(0, 120), createdAt: item.createdAt, resume: restore(item.resume, resume.documentMeta!.id) }; }) };
  });
}
