import { useState, useEffect, useRef } from 'react';
import { createEmptyResume, generateId } from '../../constants/defaultResume';
import { newLibrarySource, type LibrarySource } from '../../utils/careerLibrary';

export function StudentExperience({ disabled, save, ownerId }: { ownerId: string; disabled: boolean; save: (source: LibrarySource) => Promise<boolean> }) {
  const initial = useRef<Record<string, string>>({});
  const ready = useRef(false);
  if (!ready.current) { try { initial.current = JSON.parse(sessionStorage.getItem(`resulab.student:${ownerId}`) || '{}'); } catch { /* empty draft */ } ready.current = true; }
  const [kind, setKind] = useState(initial.current.kind || '课程项目'), [name, setName] = useState(initial.current.name || ''), [role, setRole] = useState(initial.current.role || '');
  const [action, setAction] = useState(initial.current.action || ''), [method, setMethod] = useState(initial.current.method || ''), [outcome, setOutcome] = useState(initial.current.outcome || '');
  const [start, setStart] = useState(initial.current.start || ''), [end, setEnd] = useState(initial.current.end || ''), [error, setError] = useState('');
  const dirty = Boolean(name || action || role || method || outcome || start || end);
  useEffect(() => { try { sessionStorage.setItem(`resulab.student:${ownerId}`, JSON.stringify({ kind, name, role, action, method, outcome, start, end })); } catch { /* explicit unsaved note remains */ } }, [ownerId, kind, name, role, action, method, outcome, start, end]);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError('');
    if (start && end && start > end) { setError('结束时间应晚于开始时间，请核对日期。'); return; }
    const resume = createEmptyResume();
    resume.projects.push({ id: generateId(), projectName: name.trim(), role: `${kind} · ${role.trim() || '参与者'}`, startDate: start, endDate: end, isCurrent: false,
      description: [action.trim(), method.trim() && `方法：${method.trim()}`, outcome.trim() && `交付与结果：${outcome.trim()}`].filter(Boolean).join('\n'), techStack: [], url: '' });
    try { if (await save(newLibrarySource(resume, `${kind} · ${name.trim()}`, 'paste', true, resume.projects[0].description))) { setName(''); setRole(''); setAction(''); setMethod(''); setOutcome(''); setStart(''); setEnd(''); } }
    catch (err) { setError(err instanceof Error ? err.message : '保存失败，请重试'); }
  }
  return <details className="student-entry" open><summary>没有实习也可以，从一段真实经历开始</summary>
    <p className="career-muted">课程、科研、社团都是起点。只写你做过的事，留空的结果不会被编造。</p>
    <form onSubmit={submit}><fieldset disabled={disabled}>
      <label className="career-label">经历类型<select value={kind} onChange={e => setKind(e.target.value)}>{['课程项目', '竞赛', '科研', '社团活动', '志愿服务', '个人项目'].map(item => <option key={item}>{item}</option>)}</select></label>
      <label className="career-label">项目或活动名称<input required maxLength={100} value={name} onChange={e => setName(e.target.value)} placeholder="例如：校园二手交易平台课程设计" /></label>
      <label className="career-label">你的实际角色<input maxLength={100} value={role} onChange={e => setRole(e.target.value)} placeholder="例如：负责商品列表页面的小组成员" /></label>
      <div className="career-diff"><label className="career-label">开始时间<input type="month" value={start} onChange={e => setStart(e.target.value)} /></label><label className="career-label">结束时间（可留空）<input type="month" value={end} onChange={e => setEnd(e.target.value)} /></label></div>
      <label className="career-label">你具体做了什么<textarea required minLength={8} maxLength={1800} rows={3} value={action} onChange={e => setAction(e.target.value)} placeholder="例如：参与课程小组项目，负责商品列表与筛选页面，和同学核对接口字段。" /></label>
      <label className="career-label">怎么做的（可选）<textarea maxLength={700} rows={2} value={method} onChange={e => setMethod(e.target.value)} placeholder="例如：使用 React 实现筛选交互，用浏览器开发工具排查请求问题。" /></label>
      <label className="career-label">交付物或已知结果（可选）<textarea maxLength={700} rows={2} value={outcome} onChange={e => setOutcome(e.target.value)} placeholder="例如：完成可演示页面，提交课程报告。没有可靠数字可以不写。" /></label>
      {error && <p role="alert" className="career-error">{error}</p>}
      <button className="career-button career-primary" type="submit" disabled={!name.trim() || action.trim().length < 8}>确认真实并保存经历</button>
      {dirty && <p className="career-muted">填写草稿暂存于当前会话，请确认保存后再关闭浏览器。</p>}
    </fieldset></form>
  </details>;
}
