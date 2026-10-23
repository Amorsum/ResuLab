import type { ArraySectionName, ResumeData } from '../types/resume';
import { createEmptyResume, generateId } from '../constants/defaultResume';

export const IMPORT_SECTIONS: ArraySectionName[] = ['education', 'workExperience', 'projects', 'skills', 'certificates', 'languages', 'socialLinks'];
export const IMPORT_LABELS: Record<string, string> = {
  personalInfo: '基本信息', jobIntention: '求职意向', selfEvaluation: '自我评价',
  education: '教育背景', workExperience: '工作经历', projects: '项目经历',
  skills: '技能', certificates: '证书', languages: '语言', socialLinks: '社交链接',
};
const defaults = {
  education: { schoolName: '', degree: '本科', major: '', startDate: '', endDate: '', isCurrent: false, gpa: '', description: '' },
  workExperience: { companyName: '', position: '', startDate: '', endDate: '', isCurrent: false, city: '', description: '', highlights: [] as string[] },
  projects: { projectName: '', role: '', startDate: '', endDate: '', isCurrent: false, description: '', techStack: [] as string[], url: '' },
  skills: { skillName: '', level: '熟练', category: '' },
  certificates: { name: '', issuer: '', date: '' },
  languages: { language: '', level: '良好', score: '' },
  socialLinks: { platform: '', url: '' },
};
const enums: Record<string, string[]> = {
  'personalInfo.gender': ['男', '女'], 'jobIntention.jobType': ['全职', '兼职', '实习'],
  'education.degree': ['高中', '中专', '大专', '本科', '学士', '硕士', '博士', 'MBA', 'EMBA'],
  'skills.level': ['精通', '熟练', '掌握', '了解'], 'languages.level': ['母语', '精通', '熟练', '良好', '一般'],
};
const record = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
function sanitize(source: unknown, schema: object, section: string): Record<string, unknown> {
  const input = record(source);
  const safe: Record<string, unknown> = {};
  for (const [key, fallback] of Object.entries(schema)) {
    if (key === 'avatar') continue;
    const value = input[key];
    if (typeof fallback === 'string' && typeof value === 'string' && value.trim()) {
      if (!enums[`${section}.${key}`] || enums[`${section}.${key}`].includes(value.trim())) safe[key] = value.trim();
    } else if (typeof fallback === 'boolean' && typeof value === 'boolean') safe[key] = value;
    else if (Array.isArray(fallback) && Array.isArray(value)) safe[key] = value.filter((v): v is string => typeof v === 'string').map(v => v.trim()).filter(Boolean);
  }
  return safe;
}
// Compare canonical content, ignoring model/application IDs and object key order.
function signature(value: object): string {
  return JSON.stringify(Object.entries(value).filter(([k]) => k !== 'id').sort(([a], [b]) => a.localeCompare(b)));
}
export function importRevision(resume: ResumeData): string {
  const { lastModified: _time, ...content } = resume;
  return JSON.stringify(content);
}
export interface AIImportPlan {
  baseRevision: string;
  personalInfo: Partial<ResumeData['personalInfo']>;
  jobIntention: Partial<ResumeData['jobIntention']>;
  selfEvaluation?: string;
  items: Pick<ResumeData, ArraySectionName>;
  skipped: number;
}
export function prepareAIImport(raw: unknown, resume: ResumeData): AIImportPlan {
  const input = record(raw);
  if (!Object.keys(input).length) throw new Error('AI 返回的数据无效，请重新生成');
  const empty = createEmptyResume();
  const plan: AIImportPlan = {
    baseRevision: importRevision(resume), personalInfo: sanitize(input.personalInfo, empty.personalInfo, 'personalInfo'),
    jobIntention: sanitize(input.jobIntention, empty.jobIntention, 'jobIntention'),
    items: { education: [], workExperience: [], projects: [], skills: [], certificates: [], languages: [], socialLinks: [] }, skipped: 0,
  };
  for (const section of IMPORT_SECTIONS) {
    const seen = new Set(resume[section].map(item => signature(item)));
    const values = Array.isArray(input[section]) ? input[section] as unknown[] : [];
    for (const value of values) {
      const safe = sanitize(value, defaults[section], section);
      if (!Object.values(safe).some(v => typeof v === 'string' ? v.length > 0 : Array.isArray(v) && v.length > 0)) { plan.skipped++; continue; }
      const item = { ...defaults[section], ...safe, id: generateId() };
      const key = signature(item);
      if (seen.has(key)) { plan.skipped++; continue; }
      seen.add(key);
      // Every field has been validated against the section's own schema above.
      (plan.items[section] as Array<typeof item>).push(item);
    }
  }
  if (typeof input.selfEvaluation === 'string' && input.selfEvaluation.trim()) plan.selfEvaluation = input.selfEvaluation.trim();
  for (const key of Object.keys(plan.personalInfo) as Array<keyof ResumeData['personalInfo']>) {
    if (plan.personalInfo[key] === resume.personalInfo[key]) delete plan.personalInfo[key];
  }
  for (const key of Object.keys(plan.jobIntention) as Array<keyof ResumeData['jobIntention']>) {
    if (plan.jobIntention[key] === resume.jobIntention[key]) delete plan.jobIntention[key];
  }
  if (plan.selfEvaluation === resume.selfEvaluation) delete plan.selfEvaluation;
  return plan;
}
export function hasImportChanges(plan: AIImportPlan): boolean {
  return Boolean(Object.keys(plan.personalInfo).length || Object.keys(plan.jobIntention).length || plan.selfEvaluation || IMPORT_SECTIONS.some(s => plan.items[s].length));
}
export function applyAIImport(state: ResumeData, plan: AIImportPlan): ResumeData {
  if (importRevision(state) !== plan.baseRevision || !hasImportChanges(plan)) return state;
  const next = { ...state, lastModified: Date.now(), personalInfo: { ...state.personalInfo, ...plan.personalInfo }, jobIntention: { ...state.jobIntention, ...plan.jobIntention } };
  for (const section of IMPORT_SECTIONS) {
    // Keep existing entries and append the already validated batch atomically.
    Object.assign(next, { [section]: [...state[section], ...plan.items[section]] });
  }
  if (plan.selfEvaluation) next.selfEvaluation = plan.selfEvaluation;
  return next;
}
