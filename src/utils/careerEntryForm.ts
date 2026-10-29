import { parseCareerFact, type CareerFact } from '../../shared/career';
import type { CareerEntryInput } from '../../shared/careerEntries';

export const entryLabels: Record<CareerEntryInput['kind'], string> = { project: '项目', competition: '竞赛', research: '科研', work: '工作 / 实习', campus: '校园活动', volunteer: '志愿服务', award: '奖项 / 证书', education: '教育', skill: '技能 / 语言', other: '其他成果' };
export function factsFromDetails(entry: CareerEntryInput): CareerFact[] {
  const d = entry.details, description = [d.action, d.method && `方法：${d.method}`, d.outcome && `交付与结果：${d.outcome}`].filter(Boolean).join('\n');
  const facts: CareerFact[] = [];
  const add = (id: string, section: CareerFact['section'], data: object) => facts.push(parseCareerFact({ id, section, data: { ...data, id }, sourceTitle: entry.title, doNotClaim: entry.doNotClaim }));
  if (entry.kind === 'award') add('award', 'certificates', { name: [entry.title, d.award, d.awardLevel].filter(Boolean).join(' · '), issuer: d.organization, date: d.endDate || d.startDate });
  else if (entry.kind === 'work') add('primary', 'workExperience', { companyName: d.organization || entry.title, position: d.role, startDate: d.startDate, endDate: d.endDate, isCurrent: false, city: '', description, highlights: [] });
  else if (entry.kind === 'education') add('primary', 'education', { schoolName: d.organization || entry.title, degree: '', major: d.role, startDate: d.startDate, endDate: d.endDate, isCurrent: false, gpa: '', description });
  else if (entry.kind === 'skill') {
    if (entry.facts.length) return entry.facts;
    add('primary', 'skills', { skillName: entry.title, category: d.organization, level: '' });
  }
  else {
    add('primary', 'projects', { projectName: entry.title, role: `${entryLabels[entry.kind]}${d.role ? ` · ${d.role}` : ''}`, startDate: d.startDate, endDate: d.endDate, isCurrent: false, description, techStack: [], url: d.url });
    if (d.award) add('award', 'certificates', { name: [entry.title, d.award, d.awardLevel].filter(Boolean).join(' · '), issuer: d.organization, date: d.endDate || d.startDate });
  }
  return facts;
}
