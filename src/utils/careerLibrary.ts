import type { ResumeData, SkillLevel } from '../types/resume';
import { createEmptyResume, generateId } from '../constants/defaultResume';
import { CAREER_SECTIONS, parseCareerFact, parseCareerInput, type CareerFact, type CareerInput, type CareerResult } from '../../shared/career';

export interface LibrarySource {
  id: string; title: string; kind: 'editor' | 'paste'; createdAt: number;
  resume: ResumeData; confirmed: boolean; included: boolean; doNotClaim: string; originalText: string;
}
export interface LibraryDraft {
  id: string; title: string; jdText: string; createdAt: number; kind: 'tailored' | 'editor-backup' | 'saved';
  resume: ResumeData; result?: CareerResult;
}
export interface CareerLibrary {
  ownerId: string; version: 1; revision: number; updatedAt: number; sources: LibrarySource[]; drafts: LibraryDraft[];
}
export const emptyLibrary = (ownerId: string): CareerLibrary => ({ ownerId, version: 1, revision: 0, updatedAt: Date.now(), sources: [], drafts: [] });
export const libraryOwner = (userId?: string) => userId || 'local-guest';

/** Deselecting a rewrite restores the source, while keeping role-specific selection/order. */
export function reviewedCareerResume(draft: LibraryDraft, selected: string[], summary: boolean): ResumeData {
  const next = structuredClone(draft.resume);
  if (!draft.result) return next;
  for (const edit of draft.result.edits) {
    for (const section of CAREER_SECTIONS) {
      const row = next[section].find(item => item.id === edit.factId);
      if (row) Object.assign(row, { [edit.field]: structuredClone(selected.includes(`${edit.factId}:${edit.field}`) ? edit.after : edit.before) });
    }
  }
  next.selfEvaluation = summary ? draft.result.snapshot.selfEvaluation : '';
  return next;
}

export type LibrarySkillReview = Record<string, { include: boolean; level: SkillLevel | '' }>;
/** Extraction cannot establish proficiency; retained skills require a separate human choice. */
export function approveLibrarySkills(resume: ResumeData, review: LibrarySkillReview): ResumeData {
  const skills = resume.skills.flatMap(skill => {
    const choice = review[skill.id];
    if (choice?.include === false) return [];
    if (!choice || !['了解', '掌握', '熟练', '精通'].includes(choice.level)) throw new Error('请先确认保留技能的实际程度；不确定时可取消独立技能条目，项目中使用过该工具的事实仍会保留。');
    return [{ ...skill, level: choice.level as SkillLevel }];
  });
  return { ...resume, skills };
}

/** Whitelist stored/imported data; layout/contact fields never go into model input. */
export function cleanLibraryResume(value: unknown): ResumeData {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('简历数据格式不正确');
  const raw = value as Record<string, unknown>, result = createEmptyResume();
  const readStrings = (section: 'personalInfo' | 'jobIntention') => {
    const data = raw[section];
    if (!data || typeof data !== 'object' || Array.isArray(data)) return;
    for (const key of Object.keys(result[section])) {
      const content = (data as Record<string, unknown>)[key];
      if (typeof content === 'string' && content.length <= (key === 'avatar' ? 2000000 : 4000)) Object.assign(result[section], { [key]: content });
    }
  };
  readStrings('personalInfo'); readStrings('jobIntention');
  if (!['', '男', '女'].includes(result.personalInfo.gender)) result.personalInfo.gender = '';
  if (!['', '全职', '兼职', '实习'].includes(result.jobIntention.jobType)) result.jobIntention.jobType = '';
  if (['classic', 'modern', 'minimal', 'professional'].includes(String(raw.templateId))) result.templateId = raw.templateId as ResumeData['templateId'];
  if (['songti', 'yahei', 'kaiti', 'fangsong'].includes(String(raw.fontFamily))) result.fontFamily = raw.fontFamily as ResumeData['fontFamily'];
  if (typeof raw.accentColor === 'string' && /^#[0-9a-f]{6}$/i.test(raw.accentColor)) result.accentColor = raw.accentColor;
  for (const key of ['fontSize', 'lineHeight', 'pageMargin'] as const) if (typeof raw[key] === 'number' && Number.isFinite(raw[key]) && raw[key] >= 5 && raw[key] <= 40) result[key] = raw[key];
  for (const section of CAREER_SECTIONS) {
    const rows = raw[section];
    if (!Array.isArray(rows) || rows.length > 160) throw new Error('简历条目过多或格式不正确');
    const ids = new Set<string>();
    for (const [index, row] of rows.entries()) {
      if (!row || typeof row !== 'object') throw new Error('经历条目格式不正确');
      const id = (row as { id?: unknown }).id;
      if (typeof id !== 'string' || ids.has(id)) throw new Error('经历条目编号重复或无效');
      ids.add(id);
      const item = parseCareerFact({ id, section, data: row, sourceTitle: '存档', doNotClaim: '' }, `${section}[${index}]`).data;
      (result[section] as typeof item[]).push(item);
    }
  }
  if (typeof raw.selfEvaluation === 'string' && raw.selfEvaluation.length <= 4000) result.selfEvaluation = raw.selfEvaluation;
  if (Array.isArray(raw.socialLinks) && raw.socialLinks.length <= 40) for (const item of raw.socialLinks) {
    if (item && typeof item.id === 'string' && typeof item.platform === 'string' && typeof item.url === 'string' && /^https?:\/\//i.test(item.url)) result.socialLinks.push({ id: item.id, platform: item.platform, url: item.url });
  }
  return result;
}
export function newLibrarySource(resume: ResumeData, title: string, kind: LibrarySource['kind'], confirmed: boolean, originalText = ''): LibrarySource {
  if (!title.trim() || title.trim().length > 120 || originalText.length > 20000) throw new Error('请填写简短的材料名称，原始文本不超过20000字');
  return { id: generateId(), title: title.trim(), kind, createdAt: Date.now(), resume: cleanLibraryResume(resume), confirmed, included: confirmed, doNotClaim: '', originalText };
}
export function libraryFacts(library: CareerLibrary): CareerFact[] {
  const facts: CareerFact[] = [], seen = new Map<string, CareerFact>();
  for (const source of library.sources.filter((source) => source.confirmed && source.included)) for (const section of CAREER_SECTIONS) {
    for (const [index, row] of source.resume[section].entries()) {
      const { id: _id, ...data } = row;
      const name = (data as Record<string, unknown>)[{ education: 'schoolName', workExperience: 'companyName', projects: 'projectName', skills: 'skillName', certificates: 'name', languages: 'language' }[section]];
      if (typeof name !== 'string' || !name.trim()) continue;
      const signature = `${section}:` + JSON.stringify(Object.entries(data).sort(([a], [b]) => a.localeCompare(b)));
      const existing = seen.get(signature);
      if (existing) { existing.doNotClaim = [...new Set([existing.doNotClaim, source.doNotClaim].filter(Boolean))].join('\n'); continue; }
      const id = `fact-${source.id}-${section}-${index}`;
      const fact = parseCareerFact({ id, section, data: { ...data, id }, sourceTitle: source.title, doNotClaim: source.doNotClaim });
      seen.set(signature, fact); facts.push(fact);
    }
  }
  return facts;
}
export const libraryInput = (library: CareerLibrary, jdText: string): CareerInput => parseCareerInput({ jdText, facts: libraryFacts(library) });
export function resumeFromCareer(base: ResumeData, result: CareerResult): ResumeData {
  const next = cleanLibraryResume(base);
  for (const section of CAREER_SECTIONS) Object.assign(next, { [section]: structuredClone(result.snapshot[section]) });
  next.selfEvaluation = result.snapshot.selfEvaluation;
  next.jobIntention.desiredPosition = result.plan.roleTitle;
  next.lastModified = Date.now();
  delete next._cloudId;
  return next;
}

async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('resulab-career-library', 1);
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains('libraries')) request.result.createObjectStore('libraries', { keyPath: 'ownerId' }); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('无法打开经历库，请检查浏览器存储权限'));
  });
}
export async function readLibrary(ownerId: string): Promise<CareerLibrary> {
  if (!ownerId) throw new Error('请先登录');
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('libraries', 'readonly'), request = tx.objectStore('libraries').get(ownerId);
    let value: CareerLibrary;
    request.onsuccess = () => { value = request.result || emptyLibrary(ownerId); };
    tx.oncomplete = () => { db.close(); resolve(value); };
    tx.onerror = () => { db.close(); reject(new Error('读取经历库失败')); };
  });
}
export async function updateLibrary(ownerId: string, revision: number, change: (current: CareerLibrary) => CareerLibrary): Promise<CareerLibrary> {
  if (!ownerId) throw new Error('请先登录');
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('libraries', 'readwrite'), store = tx.objectStore('libraries'), get = store.get(ownerId);
    let next: CareerLibrary, failure = '保存失败，可能是浏览器存储空间不足';
    get.onsuccess = () => {
      const current: CareerLibrary = get.result || emptyLibrary(ownerId);
      if (current.revision !== revision) { failure = '经历库已在其他页面发生变化，请刷新后重试'; tx.abort(); return; }
      try {
        next = change(structuredClone(current));
        if (next.ownerId !== ownerId) throw new Error('账号不一致');
        next.revision = current.revision + 1; next.updatedAt = Date.now();
        store.put(next);
      } catch (error) { failure = error instanceof Error ? error.message : failure; tx.abort(); }
    };
    tx.oncomplete = () => { db.close(); resolve(next); };
    tx.onabort = tx.onerror = () => { db.close(); reject(new Error(failure)); };
  });
}
export function exportLibrary(library: CareerLibrary): string {
  return JSON.stringify({ format: 'resulab-career-library', version: 1, sources: library.sources, drafts: library.drafts }, null, 2);
}
export function parseLibraryBackup(raw: string): { sources: LibrarySource[]; drafts: LibraryDraft[] } {
  if (raw.length > 20000000) throw new Error('备份过大，请分批整理');
  const value = JSON.parse(raw);
  if (value?.format !== 'resulab-career-library' || value.version !== 1 || !Array.isArray(value.sources) || !Array.isArray(value.drafts) || value.sources.length > 200 || value.drafts.length > 200) throw new Error('不是受支持的经历库备份');
  const sources = value.sources.map((source: LibrarySource) => ({ ...newLibrarySource(cleanLibraryResume(source.resume), source.title, source.kind === 'paste' ? 'paste' : 'editor', false, typeof source.originalText === 'string' ? source.originalText : ''), doNotClaim: typeof source.doNotClaim === 'string' && source.doNotClaim.length <= 1200 ? source.doNotClaim : '' }));
  // Imported results are editable copies, never automatically promoted to verified facts.
  const drafts = value.drafts.map((draft: LibraryDraft): LibraryDraft => ({ id: generateId(), title: String(draft.title || '导入副本').slice(0, 120), jdText: typeof draft.jdText === 'string' ? draft.jdText.slice(0, 12000) : '', createdAt: Date.now(), kind: 'editor-backup', resume: cleanLibraryResume(draft.resume) }));
  return { sources, drafts };
}
