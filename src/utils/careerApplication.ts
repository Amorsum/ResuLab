import type { ResumeData } from '../types/resume';
import { forkResume } from './resumeDocuments';
import { CAREER_SECTIONS, type CareerFact } from '../../shared/career';
import { factOrigin, type CareerEntry, type CareerApplicationPlan } from '../../shared/careerEntries';

const signature = (row: object) => JSON.stringify(Object.entries(row).filter(([key]) => key !== 'id').sort(([a], [b]) => a.localeCompare(b)));
export function prepareCareerApplication(resume: ResumeData, entries: CareerEntry[], facts: CareerFact[], desiredPosition?: string): CareerApplicationPlan {
  return { base: JSON.stringify(resume), desiredPosition, rows: facts.map(fact => {
    const origin = factOrigin(entries, fact.id);
    const same = resume[fact.section].find(row => {
      const previous = resume.careerOrigins?.[`${fact.section}:${row.id}`];
      return previous && !previous.unverified ? previous.entryId === origin.entryId && previous.factId === origin.factId : signature(row) === signature(fact.data);
    });
    return { fact: structuredClone(fact), origin, action: same ? 'skip' : 'append', targetId: same?.id };
  }) };
}
export function applyCareerApplication(resume: ResumeData, plan: CareerApplicationPlan): ResumeData {
  if (JSON.stringify(resume) !== plan.base) throw new Error('当前简历已变化，请重新核对应用计划');
  const next = structuredClone(resume), targets = new Set<string>();
  let changed = false;
  for (const row of plan.rows) {
    if (row.action === 'skip') continue;
    const section = row.fact.section, list = next[section];
    const id = row.action === 'replace' ? row.targetId : row.fact.id;
    if (!id || targets.has(`${section}:${id}`)) throw new Error('应用目标重复或无效');
    targets.add(`${section}:${id}`);
    const index = list.findIndex(item => item.id === id);
    if (row.action === 'replace' ? index < 0 : index >= 0) throw new Error('经历已存在或替换目标已变化');
    const item = { ...structuredClone(row.fact.data), id };
    if (row.action === 'replace') (list as object[])[index] = item; else (list as object[]).push(item);
    next.careerOrigins = { ...next.careerOrigins, [`${section}:${id}`]: row.origin }; changed = true;
  }
  if (plan.desiredPosition !== undefined && next.jobIntention.desiredPosition !== plan.desiredPosition) { next.jobIntention.desiredPosition = plan.desiredPosition; changed = true; }
  if (plan.summary !== undefined && next.selfEvaluation !== plan.summary) { next.selfEvaluation = plan.summary; changed = true; }
  if (!changed) return resume;
  next.lastModified = Date.now(); return next;
}
export function careerVersion(base: ResumeData, entries: CareerEntry[], facts: CareerFact[], roleTitle: string, summary = ''): ResumeData {
  const next = structuredClone(base); delete next._cloudId; delete next.careerOrigins;
  for (const section of CAREER_SECTIONS) Object.assign(next, { [section]: [] });
  const plan = prepareCareerApplication(next, entries, facts, roleTitle); plan.summary = summary;
  return forkResume(applyCareerApplication(next, plan), roleTitle);
}
