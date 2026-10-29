import type { ResumeData } from '../src/types/resume.js';

export const CAREER_SECTIONS = ['education', 'workExperience', 'projects', 'skills', 'certificates', 'languages'] as const;
export type CareerSection = typeof CAREER_SECTIONS[number];
export type CareerItem = ResumeData[CareerSection][number];
/** Canonical comparison survives Postgres jsonb object-key reordering. */
export function careerStable(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(careerStable).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => JSON.stringify(key) + ':' + careerStable(item)).join(',') + '}';
  return JSON.stringify(value);
}
export interface CareerFact { id: string; section: CareerSection; data: CareerItem; sourceTitle: string; doNotClaim: string }
export interface CareerInput { jdText: string; facts: CareerFact[] }
export interface CareerRequirement { id: string; text: string; jdQuote: string; required: boolean; coverage: 'supported' | 'partial' | 'missing'; gap: string }
export interface CareerSelection { factId: string; requirementIds: string[]; reason: string }
export interface CareerPlan { roleTitle: string; requirements: CareerRequirement[]; selected: CareerSelection[] }
export interface CareerSource { id: string; factId: string; field: string; quote: string }
export interface CareerEdit { factId: string; field: 'description' | 'highlights'; before: string | string[]; after: string | string[]; reason: string; sources: CareerSource[] }
export type CareerSnapshot = Pick<ResumeData, CareerSection | 'selfEvaluation'>;
export interface CareerResult {
  id: string; inputRevision: string; skillVersion: string; createdAt: number;
  plan: CareerPlan; snapshot: CareerSnapshot; edits: CareerEdit[];
  summarySources: CareerSource[]; modelCalls: number; needsMoreFacts: boolean;
}
export const CAREER_LIMITS = { facts: 160, chars: 180000, jdChars: 12000, bytes: 524288 } as const;

const schemas: Record<CareerSection, Record<string, 'text' | 'boolean' | 'list'>> = {
  education: { schoolName: 'text', degree: 'text', major: 'text', startDate: 'text', endDate: 'text', isCurrent: 'boolean', gpa: 'text', description: 'text' },
  workExperience: { companyName: 'text', position: 'text', startDate: 'text', endDate: 'text', isCurrent: 'boolean', city: 'text', description: 'text', highlights: 'list' },
  projects: { projectName: 'text', role: 'text', startDate: 'text', endDate: 'text', isCurrent: 'boolean', description: 'text', techStack: 'list', url: 'text' },
  skills: { skillName: 'text', level: 'text', category: 'text' },
  certificates: { name: 'text', issuer: 'text', date: 'text' },
  languages: { language: 'text', level: 'text', score: 'text' },
};
const enumFields: Record<string, string[]> = {
  'education.degree': ['', '高中', '中专', '大专', '本科', '学士', '硕士', '博士', 'MBA', 'EMBA'],
  'skills.level': ['', '了解', '掌握', '熟练', '精通'], 'languages.level': ['', '母语', '精通', '熟练', '良好', '一般'],
};
export class CareerValidationError extends Error {
  constructor(public rule: string, public path: string) { super(`${rule} at ${path}`); }
}
export function careerEnsure(condition: unknown, rule: string, path: string): asserts condition {
  if (!condition) throw new CareerValidationError(rule, path);
}
export function careerObject(value: unknown, path: string, allowed: string[]): Record<string, unknown> {
  careerEnsure(value && typeof value === 'object' && !Array.isArray(value), 'object_required', path);
  const result = value as Record<string, unknown>;
  careerEnsure(Object.keys(result).every((key) => allowed.includes(key)), 'unknown_field', path);
  return result;
}
export function careerText(value: unknown, path: string, max = 4000, min = 0): string {
  careerEnsure(typeof value === 'string' && value.length <= max && value.trim().length >= min, 'invalid_text', path);
  return value;
}
export function parseCareerFact(value: unknown, path = '$.facts'): CareerFact {
  const fact = careerObject(value, path, ['id', 'section', 'data', 'sourceTitle', 'doNotClaim']);
  const id = careerText(fact.id, path + '.id', 160, 1);
  careerEnsure(CAREER_SECTIONS.includes(fact.section as CareerSection), 'invalid_section', path + '.section');
  const section = fact.section as CareerSection;
  const schema = schemas[section];
  const data = careerObject(fact.data, path + '.data', ['id', ...Object.keys(schema)]);
  careerEnsure(data.id === id, 'fact_id_mismatch', path + '.data.id');
  for (const [field, type] of Object.entries(schema)) {
    const itemPath = `${path}.data.${field}`;
    if (type === 'text') {
      careerText(data[field], itemPath);
      const values = enumFields[`${section}.${field}`];
      if (values) careerEnsure(values.includes(data[field] as string), 'invalid_enum', itemPath);
    } else if (type === 'boolean') careerEnsure(typeof data[field] === 'boolean', 'invalid_boolean', itemPath);
    else {
      careerEnsure(Array.isArray(data[field]) && data[field].length <= 40, 'invalid_list', itemPath);
      (data[field] as unknown[]).forEach((text, index) => careerText(text, `${itemPath}[${index}]`));
    }
  }
  return { id, section, data: structuredClone(data) as unknown as CareerItem, sourceTitle: careerText(fact.sourceTitle, path + '.sourceTitle', 160, 1), doNotClaim: careerText(fact.doNotClaim, path + '.doNotClaim', 1200) };
}
export function parseCareerInput(value: unknown): CareerInput {
  const input = careerObject(value, '$', ['jdText', 'facts']);
  const jdText = careerText(input.jdText, '$.jdText', CAREER_LIMITS.jdChars, 10).trim();
  careerEnsure(Array.isArray(input.facts) && input.facts.length > 0 && input.facts.length <= CAREER_LIMITS.facts, 'fact_count', '$.facts');
  careerEnsure(JSON.stringify(input).length <= CAREER_LIMITS.chars, 'library_too_large', '$.facts');
  const facts = input.facts.map((fact, index) => parseCareerFact(fact, `$.facts[${index}]`));
  careerEnsure(new Set(facts.map((fact) => fact.id)).size === facts.length, 'duplicate_fact', '$.facts');
  return { jdText, facts };
}
export function careerSources(facts: CareerFact[]): CareerSource[] {
  const sources: CareerSource[] = [];
  for (const fact of facts) for (const [field, value] of Object.entries(fact.data)) {
    if (field === 'id' || typeof value === 'boolean') continue;
    const quote = Array.isArray(value) ? value.join('\n') : value;
    if (typeof quote === 'string' && quote.trim()) sources.push({ id: `source-${sources.length + 1}`, factId: fact.id, field, quote });
  }
  return sources;
}
export async function careerRevision(input: CareerInput, canonical = false): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical ? careerStable(input) : JSON.stringify(input)));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
