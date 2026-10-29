import type { ResumeData } from '../../types/resume';
import type { CareerApplicationPlan } from '../../../shared/careerEntries';
const labels: Record<string, string> = { projectName: '项目', companyName: '单位', schoolName: '学校', role: '角色', position: '职位', description: '经历描述', highlights: '贡献', techStack: '技术', startDate: '开始', endDate: '结束', url: '链接', skillName: '技能', level: '程度', name: '名称', issuer: '颁发单位', major: '专业', degree: '学历', language: '语言', score: '成绩', gpa: 'GPA', city: '城市' };
export function ReadableCareerFields({ value }: { value: unknown }) {
  if (!value || typeof value !== 'object') return <p>没有对应内容</p>;
  return <dl className="readable-fields">{Object.entries(value).filter(([k, v]) => !['id', 'isCurrent'].includes(k) && v !== '' && v !== false && v != null && !(Array.isArray(v) && !v.length)).map(([k, v]) => <div key={k}><dt>{labels[k] || k}</dt><dd>{Array.isArray(v) ? v.join('；') : String(v)}</dd></div>)}</dl>;
}
export function CareerApplicationPreview({ plan, resume, change }: { plan: CareerApplicationPlan; resume: ResumeData; change: (plan: CareerApplicationPlan) => void }) {
  return <div>{plan.rows.map((row, index) => <article className="career-fact" key={row.fact.id}>
    <ReadableCareerFields value={row.fact.data} />
    <label className="career-label">应用方式<select value={row.action} onChange={e => change({ ...plan, rows: plan.rows.map((r, i) => i === index ? { ...r, action: e.target.value as typeof r.action, targetId: r.targetId || resume[r.fact.section][0]?.id } : r) })}><option value="append">追加为新条目</option><option value="skip">跳过</option><option value="replace" disabled={!resume[row.fact.section].length}>替换指定条目</option></select></label>
    {row.action === 'replace' && <><label className="career-label">替换目标<select value={row.targetId} onChange={e => change({ ...plan, rows: plan.rows.map((r, i) => i === index ? { ...r, targetId: e.target.value } : r) })}>{resume[row.fact.section].map(item => <option key={item.id} value={item.id}>{String(Object.entries(item).find(([k]) => ['projectName', 'companyName', 'schoolName', 'name', 'skillName', 'language'].includes(k))?.[1] || '未命名条目')}</option>)}</select></label><details><summary>对照替换前内容</summary><ReadableCareerFields value={resume[row.fact.section].find(item => item.id === row.targetId)} /></details></>}
  </article>)}</div>;
}
