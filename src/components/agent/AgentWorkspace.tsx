import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { RunView } from '../../../shared/agent';
import { useAgent } from '../../hooks/useAgent';
import { useResume } from '../../hooks/useResume';
import { useAuth } from '../../hooks/useAuth';
import { prepareAgentApplication, validateAgentChanges } from '../../utils/agentChanges';
import './agent.css';

const statuses: Record<string, string> = { queued: '排队中', running: '分析中', awaiting_input: '等待你补充', completed: '建议已生成', failed: '分析失败' };
const stepStatuses: Record<string, string> = { queued: '待执行', running: '执行中', completed: '已完成', failed: '失败' };
const tools: Record<string, string> = { extract_job_requirements: '解析岗位要求', find_resume_evidence: '查找简历证据', request_clarification: '确认事实缺口', draft_resume_changes: '起草修改建议', validate_changes: '校验建议' };
const sections: Record<string, string> = { education: '教育经历', workExperience: '工作经历', projects: '项目经历', selfEvaluation: '自我评价' };
const coverage = { supported: '有证据', needs_clarification: '表达不足，待确认', missing: '无证据' };
const text = (value: string | string[]) => Array.isArray(value) ? value.join('\n') : value;
function RunTimeline({ run }: { run: RunView }) {
  return <section className="agent-panel" aria-labelledby="agent-timeline-title">
    <h2 id="agent-timeline-title">执行轨迹</h2>
    {!run.steps.length ? <p className="agent-muted">任务已登记，等待开始分析。</p> : <ol className="agent-timeline">{run.steps.map(step => <li key={step.id}>
      <div className="agent-row"><strong>{tools[step.tool]}</strong><span>{stepStatuses[step.status]}{step.durationMs === undefined ? '' : ` · ${(step.durationMs / 1000).toFixed(1)} 秒`}</span></div>
      <p className="agent-muted">{step.summary || '正在执行…'}</p>
    </li>)}</ol>}
    <dl className="agent-usage"><div><dt>模型调用</dt><dd>{run.usage.calls} 次</dd></div><div><dt>总耗时</dt><dd>{(run.usage.elapsedMs / 1000).toFixed(1)} 秒</dd></div><div><dt>输入 / 输出 Token</dt><dd>{run.usage.inputTokens ?? '—'} / {run.usage.outputTokens ?? '—'}</dd></div><div><dt>估计费用</dt><dd>{run.usage.estimatedCost === null ? '未知' : `${run.usage.estimatedCost.toFixed(4)} ${run.usage.currency}`}</dd></div></dl>
  </section>;
}
function EvidenceList({ run }: { run: RunView }) {
  return <section className="agent-panel" aria-labelledby="agent-evidence-title"><h2 id="agent-evidence-title">岗位要求与简历证据</h2>
    {!run.requirements.length && <p className="agent-muted">解析完成后，这里会列出岗位要求及对应的原文证据。</p>}
    {run.requirements.map(requirement => {
      const evidence = run.evidence.find(item => item.requirementId === requirement.id);
      return <article className="agent-evidence" key={requirement.id}>
        <div className="agent-row"><h3>{requirement.text}</h3><span className={`agent-status ${evidence?.coverage === 'missing' ? 'agent-warning' : ''}`}>{evidence ? coverage[evidence.coverage] : '待匹配'}</span></div>
        <p className="agent-muted">岗位原文</p><blockquote>{requirement.jdQuote}</blockquote>
        {evidence?.refs.map(ref => <div key={ref.id}><p className="agent-muted">简历原文 · {sections[ref.section] ?? '简历内容'}</p><blockquote>{ref.quote}</blockquote></div>)}
        {evidence?.coverage === 'missing' && <p className="agent-muted">当前简历没有对应事实，不会将岗位要求直接写成你的技能。</p>}
      </article>;
    })}
  </section>;
}
export function AgentWorkspace({ open, onClose, onPreview }: { open: boolean; onClose: () => void; onPreview: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const inputId = useId();
  const agent = useAgent();
  const resume = useResume();
  const { user } = useAuth();
  const latestResume = useRef(resume.resume); latestResume.current = resume.resume;
  const [jd, setJd] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [applying, setApplying] = useState(false);
  const applyingRef = useRef(false);
  const [feedback, setFeedback] = useState('');
  const [applyError, setApplyError] = useState('');
  const [applied, setApplied] = useState(false);
  const [showChanges, setShowChanges] = useState(false);
  const run = agent.run;
  const userId = agent.mock ? 'development-mock' : user?.id ?? '';
  useEffect(() => {
    const el = dialog.current;
    if (open && el && !el.open) el.showModal();
    if (!open && el?.open) el.close();
  }, [open]);
  useEffect(() => {
    setSelected([]); setFeedback(''); setApplyError(''); setShowChanges(false);
    try { setApplied(Boolean(run && localStorage.getItem(`resulab.agent.applied:${userId}:${run.runId}`))); } catch { setApplied(false); }
  }, [run?.runId, userId]);
  async function apply() {
    if (!run || applied || applyingRef.current) return;
    applyingRef.current = true; setApplying(true); setApplyError('');
    const account = userId;
    try {
      const payload = await prepareAgentApplication(latestResume.current, run, selected);
      validateAgentChanges(latestResume.current, payload);
      // Account changes reset the task; no stale payload is dispatched.
      if (!dialog.current?.open || account !== accountRef.current) return;
      resume.applyAgentChanges(payload);
      try { localStorage.setItem(`resulab.agent.applied:${userId}:${run.runId}`, 'true'); } catch { /* in-memory flag remains */ }
      setApplied(true); setFeedback('已应用选中的建议。可以预览、导出，或撤销本批修改。');
    } catch (err) { setApplyError(err instanceof Error ? err.message : '建议不可应用，请重新分析。'); }
    finally { applyingRef.current = false; setApplying(false); }
  }
  const accountRef = useRef(userId); accountRef.current = userId;
  useEffect(() => { setJd(''); setFeedback(''); setApplyError(''); }, [userId]);
  const inProgress = run?.status === 'running' || run?.status === 'queued';
  const creationBlocked = agent.busy || agent.authLoading || !agent.authenticated || Boolean(agent.configError) || jd.trim().length < 10;
  return <dialog ref={dialog} className="agent-dialog" aria-labelledby="agent-title" onCancel={onClose} onClose={onClose}>
    <div className="agent-shell">
      <header className="agent-header"><div><span className="agent-brand">ResuLab</span><h1 id="agent-title">针对岗位优化</h1></div><button className="agent-button" onClick={onClose}>返回编辑器</button></header>
      {agent.mock && <p className="agent-mock" role="status">开发模拟模式 · 以下数据为合成样例，未调用模型，不能用作真实效果或费用证明。</p>}
      {/* At 1100px: 320px input rail + 24px gap + remaining result sheet. On mobile both stack. */}
      <div className="agent-grid">
        <aside className="agent-input">
          <h2>先确认岗位，再确认事实</h2><p className="agent-muted">分析当前简历，找到岗位依据，再由你决定是否修改。</p>
          <details className="agent-source" open={!run}><summary>{run ? '查看已提交的岗位描述' : '填写目标岗位描述'}</summary>
          <label htmlFor={inputId}>目标岗位描述（JD）</label>
          <textarea id={inputId} value={jd} onChange={event => setJd(event.target.value)} rows={5} maxLength={12000} disabled={agent.busy || Boolean(run)} placeholder="粘贴职责、任职要求和技能要求，至少 10 字。" />
          <p className="agent-muted">将使用当前经历、技能和自我评价快照，不发送姓名、头像、电话、邮箱和排版设置。</p>
          {run && !jd && <p className="agent-muted">这是恢复的任务。岗位描述保存在服务端，本机未缓存其原文。</p>}
          </details>
          {!agent.authenticated && !agent.authLoading && <p className="agent-notice">分析需要登录。<Link to="/login" onClick={onClose}>去登录</Link>，登录后重新打开此工作区。</p>}
          {agent.configError && <p className="agent-notice">{agent.configError}</p>}
          {!run && !agent.runId && <button className="agent-button agent-primary" disabled={creationBlocked} onClick={() => { setApplyError(''); void agent.create(jd, resume.resume); }}>{agent.busy ? '正在提交…' : '分析当前简历'}</button>}
          {(run || agent.runId) && <button className="agent-button" disabled={agent.busy || applying} onClick={() => { if (inProgress && !window.confirm('当前任务会继续在后端执行。确定离开它并开始新分析？')) return; agent.newTask(); }}>开始新分析</button>}
          {agent.mock && <div className="agent-examples"><label htmlFor={`${inputId}-example`}>体验合成状态</label><select id={`${inputId}-example`} value="" onChange={event => { if (event.target.value) void agent.loadExample(event.target.value as Parameters<typeof agent.loadExample>[0], resume.resume); }}><option value="">选择样例状态</option><option value="running">执行中</option><option value="awaiting_input">等待回答</option><option value="completed">完成并有建议</option><option value="timeout">模型超时</option><option value="missing">无证据缺口</option></select><p className="agent-muted">有工作描述时，可体验仅调整标点的安全应用；空简历展示无证据结果。执行中样例需手动切换状态。</p></div>}
          {run && <details className="agent-trace"><summary>查看执行轨迹 · {statuses[run.status]}</summary><RunTimeline run={run} /></details>}
        </aside>
        <main className="agent-sheet">
          <div className="agent-row agent-result-header"><h2>{run ? statuses[run.status] : agent.runId ? '正在恢复任务' : '让每次修改都有依据'}</h2>{agent.runId && !agent.mock && <button className="agent-button" disabled={agent.busy} onClick={agent.refresh}>刷新任务</button>}</div>
          {agent.error && <div className="agent-error" role="alert"><p>{agent.error.message}</p>{agent.error.requestId && <p>请求编号：{agent.error.requestId}</p>}<div className="agent-actions">{agent.error.status === 401 && <Link to="/login" onClick={onClose}>重新登录</Link>}{agent.canResend && <button className="agent-button" disabled={agent.busy} onClick={() => void agent.resend()}>重发同一次操作</button>}{agent.runId && <button className="agent-button" onClick={agent.refresh}>恢复查询</button>}</div></div>}
          {!run && !agent.runId && <div className="agent-empty"><h3>粘贴岗位描述开始分析</h3><p>你将看到岗位要求与简历原文的对应关系。信息不足时先补充事实，完成后逐条核对建议。</p><p>原简历保持原样，直到你确认应用。</p></div>}
          {agent.runId && !run && !agent.error && <p role="status" className="agent-muted">正在查询服务端任务记录…</p>}
          {run && <>
            <EvidenceList run={run} />
            {run.status === 'awaiting_input' && <section className="agent-panel"><h2>补充事实后继续</h2><p className="agent-muted">不确定的指标可以直接说“不清楚”，没有做过的事情也可以如实说明。</p><form onSubmit={event => { event.preventDefault(); void agent.answer(); }}>{run.questions.map(question => <div className="agent-question" key={question.id}><label htmlFor={`${inputId}-${question.id}`}>{question.question}</label><textarea id={`${inputId}-${question.id}`} value={agent.drafts[question.id] ?? question.answer ?? ''} onChange={event => agent.setDraft(question.id, event.target.value)} rows={3} maxLength={2000} disabled={agent.busy} required /><div className="agent-actions"><button type="button" className="agent-button" onClick={() => agent.setDraft(question.id, '没有做过')}>没有做过</button><button type="button" className="agent-button" onClick={() => agent.setDraft(question.id, '不清楚，无法提供可靠指标')}>不清楚</button></div></div>)}<button className="agent-button agent-primary" disabled={agent.busy}>{agent.busy ? '正在提交…' : '提交全部回答并继续'}</button></form></section>}
            {run.status === 'failed' && <section className="agent-error" role="alert"><h2>分析暂未完成</h2><p>{run.error?.code === 'MODEL_TIMEOUT' ? '模型响应超时。原简历保持原样，可手动重试。' : '执行步骤失败，请查看轨迹并重试，或联系后端核对请求。'}</p><p>错误代码：{run.error?.code ?? 'UNKNOWN'}</p>{run.error?.retryable && <button className="agent-button" disabled={agent.busy} onClick={() => void agent.retry()}>重试失败步骤</button>}</section>}
            {run.status === 'completed' && <section className="agent-panel"><h2>核对修改建议</h2><p className="agent-muted">完成分析不代表已经修改简历。勾选你认可的内容，再确认应用。</p>
              {!run.changes.length ? <p className="agent-notice">没有可应用的修改。可补充真实经历后重新分析；不会从岗位描述中补造技能。</p> : <>
                {!showChanges && <button className="agent-button" onClick={() => setShowChanges(true)}>查看 {run.changes.length} 条修改建议</button>}
                {showChanges && run.changes.map(change => <article className="agent-change" key={change.id}><label className="agent-choice"><input type="checkbox" checked={selected.includes(change.id)} disabled={applied || applying} onChange={event => setSelected(previous => event.target.checked ? [...previous, change.id] : previous.filter(id => id !== change.id))} /><strong>{sections[change.target.section]} · {change.target.field === 'highlights' ? '工作亮点' : '描述'}</strong></label><div className="agent-diff"><div><h3>原文</h3><p>{text(change.before) || '（空）'}</p></div><div><h3>建议</h3><p>{text(change.after) || '（空）'}</p></div></div><p>修改原因：{change.reason}</p><p className="agent-muted">待你确认：以下引用是否准确、建议是否符合你的实际经历。</p>{change.sources.map((source, i) => <blockquote key={i}>{source.kind === 'answer' ? '你的回答' : '简历事实'}：{source.quote}</blockquote>)}</article>)}
                {showChanges && <button className="agent-button agent-primary" disabled={!selected.length || applied || applying} onClick={() => void apply()}>{applied ? '本批建议已应用' : applying ? '正在核对…' : `确认应用 ${selected.length} 条建议`}</button>}
              </>}
            </section>}
          </>}
          {applyError && <p role="alert" className="agent-error">{applyError}</p>}
          {feedback && <p role="status" className="agent-notice">{feedback}</p>}
          <div className="agent-actions agent-footer"><button className="agent-button" onClick={onPreview}>预览并导出</button><button className="agent-button" disabled={!resume.canUndo || applying} onClick={() => { resume.undo(); setFeedback('已撤销最近一次简历修改。本批建议不会重复应用，需要时可重新分析。'); }}>撤销最近修改</button></div>
        </main>
      </div>
    </div>
  </dialog>;
}
