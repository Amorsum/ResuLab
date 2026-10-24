import { useState } from 'react';
import type { ResumeData } from '../../types/resume';
import type { LibrarySource } from '../../utils/careerLibrary';
import { CAREER_SECTIONS, type CareerSection } from '../../../shared/career';

export const careerLabels: Record<string, string> = {
  education: '教育', workExperience: '工作', projects: '项目', skills: '技能', certificates: '证书', languages: '语言',
  schoolName: '学校', degree: '学历', major: '专业', startDate: '开始', endDate: '结束', isCurrent: '至今', gpa: '绩点', description: '描述',
  companyName: '公司', position: '职位', city: '城市', highlights: '亮点', projectName: '项目名称', role: '职责', techStack: '技术', url: '链接',
  skillName: '技能', level: '程度', category: '类别', name: '名称', issuer: '颁发方', date: '日期', language: '语言', score: '成绩',
};
export function factTitle(section: CareerSection, item: object): string {
  const row = item as Record<string, unknown>;
  return String(row.companyName || row.projectName || row.schoolName || row.skillName || row.name || row.language || careerLabels[section]);
}
export function FactsView({ resume }: { resume: ResumeData }) {
  return <div className="career-facts">{CAREER_SECTIONS.map(section => resume[section].length > 0 && <section key={section}>
    <h4>{careerLabels[section]} · {resume[section].length}</h4>
    {resume[section].map(item => <article className="career-fact" key={item.id}><strong>{factTitle(section, item)}</strong>
      <dl>{Object.entries(item).filter(([key, value]) => key !== 'id' && value !== '' && value !== false && (!Array.isArray(value) || value.length > 0)).map(([key, value]) =>
        <div key={key}><dt>{careerLabels[key] || key}</dt><dd>{Array.isArray(value) ? value.join('；') : typeof value === 'boolean' ? '是' : String(value)}</dd></div>)}</dl>
    </article>)}
  </section>)}</div>;
}
export function SourceCard({ source, disabled, change }: { source: LibrarySource; disabled: boolean; change: (patch: Partial<LibrarySource>) => void }) {
  const [constraint, setConstraint] = useState(source.doNotClaim);
  return <article className="career-source">
    <div className="career-row"><h3>{source.title}</h3><span className={`career-pill ${source.confirmed ? 'verified' : ''}`}>{source.confirmed ? '已确认' : '待核对'}</span></div>
    <p className="career-muted">{source.kind === 'editor' ? '来自简历编辑器' : '来自补充经历'} · {CAREER_SECTIONS.map(section => `${careerLabels[section]} ${source.resume[section].length}`).filter(text => !text.endsWith(' 0')).join(' / ') || '暂无结构化经历'}</p>
    <details><summary>查看事实原文</summary><FactsView resume={source.resume} />{source.originalText && <details><summary>粘贴的原始材料</summary><p className="career-text">{source.originalText}</p></details>}</details>
    <fieldset disabled={disabled}>
      <label className="career-check"><input type="checkbox" checked={source.confirmed} onChange={event => change({ confirmed: event.target.checked, included: event.target.checked })} />我已核对这份材料的事实</label>
      <label className="career-check"><input type="checkbox" checked={source.included} disabled={!source.confirmed || disabled} onChange={event => change({ included: event.target.checked })} />参与本次岗位选材</label>
      <label className="career-label">不要宣称的内容<textarea value={constraint} onChange={event => setConstraint(event.target.value)} rows={2} maxLength={1200} placeholder="例如：只参与实现，不能写成主导；没有做过性能优化。" /></label>
      <button className="career-button" disabled={constraint === source.doNotClaim} onClick={() => change({ doNotClaim: constraint })}>保存备注</button>
      {constraint !== source.doNotClaim && <span className="career-muted"> 保存后用于下一次生成</span>}
    </fieldset>
  </article>;
}
