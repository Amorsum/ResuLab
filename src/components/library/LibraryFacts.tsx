import { useEffect, useState } from 'react';
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
export function SourceCard({ source, disabled, change }: { source: LibrarySource; disabled: boolean; change: (patch: Partial<LibrarySource>) => Promise<boolean> }) {
  const [constraint, setConstraint] = useState(source.doNotClaim);
  const [editError, setEditError] = useState('');
  const [editing, setEditing] = useState(false), [draft, setDraft] = useState(source.resume);
  useEffect(() => { setDraft(source.resume); setConstraint(source.doNotClaim); }, [source]);
  return <article className="career-source">
    <div className="career-row"><h3>{source.title}</h3><span className={`career-pill ${source.confirmed ? 'verified' : ''}`}>{source.confirmed ? '已确认' : '待核对'}</span></div>
    <p className="career-muted">{source.kind === 'editor' ? '来自简历编辑器' : '来自补充经历'} · {CAREER_SECTIONS.map(section => `${careerLabels[section]} ${source.resume[section].length}`).filter(text => !text.endsWith(' 0')).join(' / ') || '暂无结构化经历'}</p>
    <details><summary>查看事实原文</summary><FactsView resume={source.resume} />{source.originalText && <details><summary>粘贴的原始材料</summary><p className="career-text">{source.originalText}</p></details>}</details>
    <button className="career-button" disabled={disabled} onClick={() => { setDraft(structuredClone(source.resume)); setEditing(!editing); }}>{editing ? '取消补充' : '补充 / 修正这段经历'}</button>
    {editing && <fieldset disabled={disabled} className="career-proposal"><p className="career-muted">将个人行动、方法和交付物补在对应经历中；修正冲突时直接改正原文。确认后重新生成即可使用新事实，已存岗位版本保持原样。</p>{(['projects', 'workExperience', 'education'] as const).map(section => draft[section].map(item => <div key={item.id}><label className="career-label">{factTitle(section, item)} · 完整事实描述<textarea rows={5} maxLength={4000} value={item.description} onChange={event => setDraft(previous => ({ ...previous, [section]: previous[section].map(row => row.id === item.id ? { ...row, description: event.target.value } : row) }))} /></label><div className="career-diff">{(['startDate', 'endDate'] as const).map(field => <label className="career-label" key={field}>{field === 'startDate' ? '开始时间' : '结束时间'}<input type="month" value={item[field]} onChange={event => setDraft(previous => ({ ...previous, [section]: previous[section].map(row => row.id === item.id ? { ...row, [field]: event.target.value } : row) }))} /></label>)}</div></div>))}{editError && <p role="alert" className="career-error">{editError}</p>}<button className="career-button career-primary" onClick={async () => { setEditError(''); const invalid = [...draft.projects, ...draft.workExperience, ...draft.education].some(item => item.startDate && item.endDate && item.startDate > item.endDate); if (invalid) { setEditError('开始时间不能晚于结束时间，请核对日期。'); return; } if (await change({ resume: draft, confirmed: true })) setEditing(false); }}>确认补充事实并保存</button></fieldset>}
    <fieldset disabled={disabled}>
      <label className="career-check"><input type="checkbox" checked={source.confirmed} onChange={event => change({ confirmed: event.target.checked, included: event.target.checked })} />我已核对这份材料的事实</label>
      <label className="career-check"><input type="checkbox" checked={source.included} disabled={!source.confirmed || disabled} onChange={event => change({ included: event.target.checked })} />参与本次岗位选材</label>
      <label className="career-label">不要宣称的内容<textarea value={constraint} onChange={event => setConstraint(event.target.value)} rows={2} maxLength={1200} placeholder="例如：只参与实现，不能写成主导；没有做过性能优化。" /></label>
      <button className="career-button" disabled={constraint === source.doNotClaim} onClick={() => change({ doNotClaim: constraint })}>保存备注</button>
      {constraint !== source.doNotClaim && <span className="career-muted"> 保存后用于下一次生成</span>}
    </fieldset>
  </article>;
}
