import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import AppHeader from '../components/layout/AppHeader';
import { useAuth } from '../hooks/useAuth';
import { useResume } from '../hooks/useResume';
import { useAI } from '../hooks/useAI';
import { aiRequest } from '../utils/aiApi';
import { libraryInput, libraryOwner, readLibrary, resumeFromCareer } from '../utils/careerLibrary';
import { verifyCareerResult } from '../../shared/careerComposer';
import { verifyJobMatch } from '../../shared/jobMatch';
import { careerRevision } from '../../shared/career';
import { BOSS_CAPABILITIES, MAX_PDF_BYTES, coverage, emptyJobs, filterJob, jobSchema, manifestSchema, manifestDigest, rankJobs, searchSchema, sha256, statusLabels, type BatchView, type Capabilities, type Job, type JobDraft, type JobMatch, type JobRecord, type JobsWorkspace } from '../../shared/jobs';
import { JobsBridge } from '../utils/jobsBridge';
import { clearJobs, readJobs, saveJobs } from '../utils/jobsStore';
import { renderJobPdf } from '../utils/jobPdf';
import './jobs.css';

interface SearchProgress { id: string; phase: string; jobs: Job[]; failedUrls: string[]; error: string }
const searchPhaseLabels: Record<string, string> = { open: '等待 BOSS 页面并提交搜索', list: '核对关键词并读取岗位列表', detail: '读取岗位详情', next: '检查下一页', done: '本次收集已结束', paused: '本次收集已暂停' };
const message = (error: unknown) => error instanceof Error ? error.message : '操作失败';
const safeName = (name: string) => name.replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').slice(0, 45);
const frozenRow = (row: JobRecord) => ['queued', 'communicated', 'attachment_pending', 'unknown', 'sent'].includes(row.status);
function download(blob: Blob, filename: string) { const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
function PdfPreview({ draft }: { draft: JobDraft }) {
  const [url, setUrl] = useState('');
  useEffect(() => { const value = URL.createObjectURL(draft.pdf); setUrl(value); return () => URL.revokeObjectURL(value); }, [draft.pdf]);
  return <div className="job-pdf"><a href={url} target="_blank" rel="noreferrer">在新窗口查看完整 PDF ↗</a><iframe src={url} title={draft.filename} /><button onClick={() => download(draft.pdf, draft.filename)}>下载此岗位 PDF</button></div>;
}
export default function JobsPage() {
  const { user, session } = useAuth(), { resume } = useResume(), { tailorResume } = useAI();
  const ownerId = libraryOwner(user?.id), owner = useRef(ownerId); owner.current = ownerId;
  const [workspace, setWorkspace] = useState<JobsWorkspace>(emptyJobs(ownerId)), current = useRef(workspace);
  const [ready, setReady] = useState(false), [busy, setBusy] = useState(false), working = useRef(false);
  const [notice, setNotice] = useState(''), [error, setError] = useState(''), [connected, setConnected] = useState(false);
  const [capabilities, setCapabilities] = useState<Capabilities>(BOSS_CAPABILITIES), [batch, setBatch] = useState<BatchView | null>(null);
  const [searchTask, setSearchTask] = useState<SearchProgress | null>(null), [detail, setDetail] = useState<string>('');
  const [manual, setManual] = useState({ url: '', title: '', company: '', jdText: '' });
  const [clearConfirm, setClearConfirm] = useState(false), [confirmBatch, setConfirmBatch] = useState(false);
  const bridge = useRef<JobsBridge | null>(null), controller = useRef<AbortController | null>(null), saves = useRef(Promise.resolve());
  const workspaceEpoch = useRef(0), saveFailure = useRef<Error | null>(null), polling = useRef<Promise<void> | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    const epoch = ++workspaceEpoch.current; saveFailure.current = null;
    mounted.current = true; setReady(false); setConnected(false); setBatch(null); setSearchTask(null); setError('');
    void bridge.current?.disconnect(); bridge.current = null; controller.current?.abort();
    void readJobs(ownerId).then(value => { if (owner.current === ownerId && mounted.current && workspaceEpoch.current === epoch) { current.current = value; setWorkspace(value); setReady(true); } }).catch(e => { if (workspaceEpoch.current === epoch) setError(message(e)); });
    return () => { mounted.current = false; controller.current?.abort(); void bridge.current?.disconnect(); };
  }, [ownerId]);
  function commit(change: (value: JobsWorkspace) => JobsWorkspace): Promise<void> {
    const expected = ownerId, epoch = workspaceEpoch.current;
    if (!mounted.current || owner.current !== expected || current.current.ownerId !== expected) return Promise.reject(new Error('账号或页面已变化，操作已停止'));
    let snapshot: JobsWorkspace;
    try { snapshot = change(structuredClone(current.current)); }
    catch (error) { return Promise.reject(error); }
    // Controlled inputs must update synchronously. A completed older save may update
    // persistence metadata, but must never replace text typed while it was in flight.
    current.current = snapshot; setWorkspace(snapshot);
    const work = saves.current.then(async () => {
      if (!mounted.current || owner.current !== expected || workspaceEpoch.current !== epoch) throw new Error('账号或页面已变化，操作已停止');
      if (saveFailure.current) throw saveFailure.current;
      try {
        const next = await saveJobs({ ...snapshot, revision: current.current.revision });
        if (owner.current === expected && mounted.current && workspaceEpoch.current === epoch) {
          current.current = { ...current.current, revision: next.revision, updatedAt: next.updatedAt };
          setWorkspace(current.current);
        }
      } catch (error) {
        if (workspaceEpoch.current === epoch) saveFailure.current = new Error(`${message(error)}；当前输入仍保留在页面，请复制后刷新重试。`);
        throw saveFailure.current || error;
      }
    }); saves.current = work.catch(() => {}); return work;
  }
  async function run(action: () => Promise<void>, disconnectOnError = false, background = false) {
    if (working.current || (background && polling.current)) return;
    const execute = async () => {
      try {
        if (!background) await polling.current;
        await saves.current;
        if (saveFailure.current) throw saveFailure.current;
        if (!mounted.current || owner.current !== ownerId) return;
        await action();
      } catch (e) {
        if (mounted.current && owner.current === ownerId) {
          if (disconnectOnError) { setConnected(false); void bridge.current?.disconnect(); }
          setError(message(e));
        }
      }
    };
    // Heartbeats must not disable form fields or interrupt an IME composition.
    if (background) {
      const task = execute(); polling.current = task;
      try { await task; } finally { if (polling.current === task) polling.current = null; }
    } else {
      working.current = true; setBusy(true); setError('');
      try { await execute(); } finally { working.current = false; if (mounted.current) setBusy(false); }
    }
  }
  async function syncBatch(value: BatchView | null) {
    setBatch(value); if (!value || value.ownerId !== ownerId) return;
    await commit(data => {
      if (data.batchId !== value.id) data.eventSeq = 0;
      data.batchId = value.id;
      for (const item of value.items) { const row = data.records.find(r => r.job.id === item.jobId); if (row) { row.status = item.status; row.batchId = value.id; } }
      for (const event of value.events) { const row = data.records.find(r => r.job.id === event.jobId); if (row) row.note = event.message; data.eventSeq = Math.max(data.eventSeq, event.seq); }
      return data;
    });
  }
  // Polling is bounded and only pumps durable one-step work while this paired page remains open.
  useEffect(() => {
    if (!connected) return;
    const timer = setInterval(() => {
      if (working.current || !bridge.current) return;
      void run(async () => {
        const client = bridge.current!;
        if (searchTask && !['done', 'paused'].includes(searchTask.phase)) {
          const value = await client.request<SearchProgress>('SEARCH_STATUS', null, searchTask.id); setSearchTask(value);
          await commit(data => { for (const raw of value.jobs) { const job = jobSchema.parse(raw); if (!data.records.some(row => row.job.id === job.id)) data.records.push({ job, selected: false, status: 'review' }); } return data; });
          if (value.phase === 'done') setNotice(`收集完成：${value.jobs.length} 个岗位，${value.failedUrls.length} 个详情未能读取。城市等条件在工作台本地筛选。`);
        } else if (batch?.state === 'running') await syncBatch(await client.request<BatchView>('EVENTS', { after: current.current.eventSeq }, batch.id));
        else { const value = await client.request<{ capabilities: Capabilities; batch: BatchView | null }>('STATUS'); setCapabilities(value.capabilities); if (value.batch && value.batch.state !== batch?.state) await syncBatch(value.batch); }
      }, true, true);
    }, 2500); return () => clearInterval(timer);
  }, [connected, searchTask?.id, searchTask?.phase, batch?.id, batch?.state, ownerId]);
  const lockedBatch = Boolean(batch && !['completed', 'cancelled'].includes(batch.state));
  const selected = workspace.records.filter(row => row.selected && !frozenRow(row)), preview = workspace.records.find(row => row.job.id === detail);
  const patch = (id: string, edit: Partial<JobRecord>) => commit(data => { const row = data.records.find(r => r.job.id === id); if (row) Object.assign(row, edit); return data; });
  const updateSearch = (edit: Partial<JobsWorkspace['search']>) => commit(data => ({ ...data, search: { ...data.search, ...edit } }));
  async function connect() {
    const client = new JobsBridge(ownerId); await client.connect(); bridge.current = client;
    const value = await client.request<{ capabilities: Capabilities; batch: BatchView | null }>('STATUS');
    setCapabilities(value.capabilities); setConnected(true); await syncBatch(value.batch); setNotice('扩展已连接。BOSS 登录状态由当前浏览器保管。');
  }
  async function analyze() {
    if (!session) throw new Error('请登录 ResuLab 后使用 AI 匹配');
    const library = await readLibrary(ownerId), rows = current.current.records.filter(r => !filterJob(r.job, current.current.search).excluded.length && r.job.jdText.trim() && !frozenRow(r));
    if (!rows.length) throw new Error('没有可分析的岗位，请先收集或导入 JD');
    const abort = new AbortController(); controller.current = abort;
    for (let index = 0; index < rows.length; index++) {
      if (abort.signal.aborted || owner.current !== ownerId) break;
      const row = rows[index]; setNotice(`匹配 ${index + 1}/${rows.length} · ${row.job.title}`);
      try {
        const input = libraryInput(library, row.job.jdText), revision = await careerRevision(input);
        if (row.match?.inputRevision === revision && !row.error) continue;
        const raw = await aiRequest<JobMatch>((import.meta.env.VITE_AI_API_BASE?.trim() || 'https://api.amorsum.top').replace(/\/$/, ''), '/api/ai/job-match', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify(input), signal: abort.signal }, '匹配失败');
        await patch(row.job.id, { match: await verifyJobMatch(raw, input), error: undefined, reviewed: false });
      } catch (e) { await patch(row.job.id, { error: message(e) }); }
    }
    await commit(data => { const recommended = rankJobs(data.records.filter(r => r.match && !r.error && !filterJob(r.job, data.search).excluded.length && r.status === 'review')).slice(0, 5).map(r => r.job.id); data.records.forEach(row => { row.selected = recommended.includes(row.job.id); }); return data; });
    setNotice(abort.signal.aborted ? '已停止等待，已完成的匹配保留' : '已按必需要求、整体证据覆盖排序，推荐前 5 个岗位。请核对再生成。');
  }
  async function generate() {
    if (!session) throw new Error('请登录 ResuLab 后生成岗位简历');
    const rows = current.current.records.filter(r => r.selected && !frozenRow(r));
    if (!rows.length || rows.length > 20) throw new Error('请选择 1–20 个岗位');
    const library = await readLibrary(ownerId), source = library.sources.find(s => s.confirmed && s.included);
    if (!source) throw new Error('请先在经历工作台确认并选择材料');
    const abort = new AbortController(); controller.current = abort;
    for (let index = 0; index < rows.length; index++) {
      if (abort.signal.aborted || owner.current !== ownerId) break;
      const row = rows[index]; setNotice(`生成岗位简历 ${index + 1}/${rows.length} · ${row.job.company} / ${row.job.title}`);
      try {
        if (filterJob(row.job, current.current.search).excluded.length) throw new Error('岗位不符合当前筛选范围');
        const input = libraryInput(library, row.job.jdText), result = await verifyCareerResult(await tailorResume(input, abort.signal), input);
        if (result.needsMoreFacts) throw new Error('现有事实不足以支持此岗位，请补充经历后重试');
        const snapshot = resumeFromCareer(source.resume || resume, result), snapshotHash = await sha256(JSON.stringify(snapshot));
        const pdf = await renderJobPdf(snapshot); if (pdf.size > MAX_PDF_BYTES) throw new Error('PDF 超过 8 MiB，请缩小头像或简化排版后重试');
        const hash = await sha256(pdf), filename = `${safeName(snapshot.personalInfo.fullName || '简历')}_${safeName(row.job.company)}_${safeName(row.job.title)}_${row.job.id.slice(0, 6)}_${snapshotHash.slice(0, 8)}.pdf`;
        const greeting = `您好，我希望应聘贵公司的${row.job.title}岗位。${result.snapshot.selfEvaluation || '已根据岗位要求整理了相关经历，期待与您进一步交流。'}`.slice(0, 1000);
        await patch(row.job.id, { draft: { resume: snapshot, result, inputRevision: result.inputRevision, filename, hash, pdf, greeting }, reviewed: false, error: undefined, status: 'review' });
      } catch (e) { await patch(row.job.id, { error: message(e), reviewed: false }); }
    }
    setNotice('已完成的岗位简历已保存。请逐项核对改写来源、完整 PDF 和沟通文案，再审核整批。');
  }
  async function approve() {
    const client = bridge.current; if (!client || !connected) throw new Error('请先连接扩展');
    if (!capabilities.communicate) throw new Error(capabilities.reason);
    const rows = current.current.records.filter(row => row.selected && !frozenRow(row));
    if (!rows.length || rows.length > 20 || rows.some(row => !row.draft || !row.reviewed || row.error)) throw new Error('请选择 1–20 个已生成并核对完成的岗位');
    const library = await readLibrary(ownerId);
    for (const row of rows) {
      if (row.draft!.inputRevision !== await careerRevision(libraryInput(library, row.job.jdText))) { await patch(row.job.id, { reviewed: false }); throw new Error('经历或 JD 已变化，请重新生成并核对该岗位'); }
      if (await sha256(row.draft!.pdf) !== row.draft!.hash) throw new Error('附件内容已变化，请重新生成');
    }
    const manifest = manifestSchema.parse({ id: crypto.randomUUID(), ownerId, createdAt: Date.now(), items: await Promise.all(rows.map(async row => ({ job: row.job, hash: row.draft!.hash, bytes: row.draft!.pdf.size, filename: row.draft!.filename,
      snapshotHash: await sha256(JSON.stringify(row.draft!.resume)), greeting: row.draft!.greeting, allowExistingConversation: Boolean(row.allowExistingConversation) }))) });
    await client.prepare(manifest, rows.map(row => row.draft!));
    const value = await client.request<BatchView>('APPROVE', { manifestHash: await manifestDigest(manifest) }, manifest.id);
    await syncBatch(value); setConfirmBatch(false);
  }
  async function batchAction(type: 'PAUSE' | 'RESUME' | 'CANCEL', attachments = false, batchId = batch?.id) {
    if (!bridge.current || !batchId) throw new Error('请连接扩展并选择批次');
    await syncBatch(await bridge.current.request<BatchView>(type, { attachments }, batchId));
  }
  async function exportRecords() {
    const records = workspace.records.map(({ draft, ...row }) => ({ ...row, draft: draft && { ...draft, pdf: undefined } }));
    download(new Blob([JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), search: workspace.search, records, batch }, null, 2)], { type: 'application/json' }), 'ResuLab_求职记录.json');
    setNotice('已导出岗位、匹配、简历快照及状态；PDF 请在岗位审核中单独下载。导出文件含个人资料，请妥善保存。');
  }
  async function clearLocalRecords() {
    if (connected && bridge.current) await bridge.current.request('CLEAR');
    const value = await clearJobs(ownerId); current.current = value; setWorkspace(value); setBatch(null); setSearchTask(null); setDetail(''); setClearConfirm(false);
    setNotice(connected ? '已清理当前身份的工作台与扩展记录。' : '已清理工作台记录；未连接的扩展记录仍保留，需连接后再清理。');
  }
  return <div className="jobs-page"><AppHeader />
    <main className="jobs-main"><div className="jobs-heading"><div><span className="eyebrow">YOUR NEXT OPPORTUNITY</span><h1>为每个机会，认真准备。</h1><p>搜索真实岗位，让经历与要求相遇。核对专用简历，再决定发送。</p></div><button disabled={busy || !ready} onClick={() => void run(connect)}>{connected ? '重新连接扩展' : '连接浏览器扩展'} ↗</button></div>
      <div className="jobs-capability"><b>{connected ? '扩展已连接' : '扩展未连接'}</b><span>{capabilities.reason}</span><Link to="/extension">下载扩展与安装说明 ↗</Link></div>
      {error && <div role="alert" className="jobs-error">{error}</div>}{notice && <p role="status" className="jobs-notice">{notice}</p>}
      {!user && <p className="jobs-notice">岗位可保存在本机；AI 匹配和简历生成需要 <Link to="/login">登录 ResuLab</Link>。登录后使用独立账号记录。</p>}
      <section className="jobs-panel"><div className="jobs-section-title"><span>01 / DISCOVER</span><h2>寻找岗位</h2></div><fieldset disabled={busy || !ready || lockedBatch}>
        <div className="jobs-fields"><label>岗位关键词<input value={workspace.search.keyword} onChange={e => void updateSearch({ keyword: e.target.value }).catch(e => setError(message(e)))} placeholder="例如：前端开发实习生" maxLength={120} /></label>
          <label>城市<input value={workspace.search.city} onChange={e => void updateSearch({ city: e.target.value }).catch(e => setError(message(e)))} placeholder="不限" /></label>
          <label>月薪下限（元）<input type="number" min="0" value={workspace.search.salaryMin || ''} onChange={e => void updateSearch({ salaryMin: Number(e.target.value) }).catch(e => setError(message(e)))} /></label>
          <label>月薪上限（元）<input type="number" min="0" value={workspace.search.salaryMax || ''} onChange={e => void updateSearch({ salaryMax: Number(e.target.value) }).catch(e => setError(message(e)))} /></label>
          <label>经验范围<select value={workspace.search.experience} onChange={e => void updateSearch({ experience: e.target.value }).catch(e => setError(message(e)))}>{['', '在校/应届', '经验不限', '1年以内', '1-3年', '3-5年', '5-10年', '10年以上'].map(v => <option key={v} value={v}>{v || '不限'}</option>)}</select></label>
          <label>学历要求<select value={workspace.search.education} onChange={e => void updateSearch({ education: e.target.value }).catch(e => setError(message(e)))}>{['', '学历不限', '大专', '本科', '硕士', '博士'].map(v => <option key={v} value={v}>{v || '不限'}</option>)}</select></label>
          <label>工作类型<select value={workspace.search.jobType} onChange={e => void updateSearch({ jobType: e.target.value as '实习' | '全职' | '兼职' | '' }).catch(e => setError(message(e)))}>{['', '实习', '全职', '兼职'].map(v => <option key={v} value={v}>{v || '不限'}</option>)}</select></label>
          <label>本批收集上限<input type="number" min="1" max="50" value={workspace.search.limit} onChange={e => void updateSearch({ limit: Number(e.target.value) }).catch(e => setError(message(e)))} /></label>
          <label className="jobs-wide">排除公司（逗号分隔）<input value={workspace.search.excludeCompanies.join('，')} onChange={e => void updateSearch({ excludeCompanies: e.target.value.split(/[,，]/).map(v => v.trim()) }).catch(e => setError(message(e)))} /></label></div>
        <div className="jobs-actions"><button className="jobs-primary" disabled={!connected} onClick={() => void run(async () => { const search = searchSchema.parse(current.current.search); setSearchTask(await bridge.current!.request<SearchProgress>('SEARCH', search)); setNotice('已打开 BOSS 搜索页。请完成登录；关键词在平台搜索，其余条件在工作台本地筛选。'); })}>在 BOSS 搜索并收集 ↗</button><span>收集上限包含无法读取的详情；不承诺全站完整结果。</span></div>
      </fieldset>
      {searchTask && <p role="status">{searchPhaseLabels[searchTask.phase] || '正在收集'}。已读取 {searchTask.jobs.length} 个岗位。{searchTask.error}</p>}
      <details className="jobs-import"><summary>直接导入一个 BOSS 岗位 JD</summary><fieldset disabled={busy || lockedBatch}><div className="jobs-fields">{(['url', 'title', 'company'] as const).map(key => <label key={key}>{({ url: '岗位链接', title: '岗位名称', company: '公司' })[key]}<input value={manual[key]} onChange={e => setManual({ ...manual, [key]: e.target.value })} /></label>)}</div><label>完整 JD<textarea rows={5} maxLength={12000} value={manual.jdText} onChange={e => setManual({ ...manual, jdText: e.target.value })} /></label><button onClick={() => void run(async () => {
        const url = new URL(manual.url); const id = url.pathname.match(/^\/job_detail\/([\w~-]+)\.html$/)?.[1];
        const job = jobSchema.parse({ ...manual, url: url.origin + url.pathname, id, source: 'boss', recruiter: '', recruiterKey: '', city: '', salary: '', experience: '', education: '', jobType: '', collectedAt: Date.now() });
        if (!job.jdText.trim()) throw new Error('请粘贴完整 JD');
        await commit(data => { const existing = data.records.find(row => row.job.id === job.id); if (existing) throw new Error('岗位已存在，请使用列表中的记录'); data.records.push({ job, status: 'review', selected: false }); return data; });
        setManual({ url: '', title: '', company: '', jdText: '' });
      })}>加入岗位列表</button></fieldset></details></section>
      <section className="jobs-panel"><div className="jobs-section-title"><span>02 / MATCH</span><h2>选值得投入的机会 <small>{workspace.records.length} 个岗位</small></h2></div>
        <div className="jobs-actions"><button disabled={busy || lockedBatch || !ready} onClick={() => void run(analyze)}>智能匹配与排序</button><button className="jobs-primary" disabled={busy || lockedBatch || !selected.length} onClick={() => void run(generate)}>为所选 {selected.length} 个岗位生成简历</button>{busy && <button onClick={() => controller.current?.abort()}>停止等待 AI</button>}</div>
        {!workspace.records.length && <div className="jobs-empty"><span>从一个真实岗位开始</span><p>连接扩展搜索，或粘贴岗位 JD。匹配理由会引用你已确认的经历。</p></div>}
        <div className="job-list">{rankJobs(workspace.records).map(row => { const filter = filterJob(row.job, workspace.search); return <article className={`job-card ${filter.excluded.length ? 'job-excluded' : ''}`} key={row.job.id}>
          <input aria-label={`选择 ${row.job.title}`} type="checkbox" checked={row.selected} disabled={busy || lockedBatch || frozenRow(row) || Boolean(filter.excluded.length)} onChange={e => void patch(row.job.id, { selected: e.target.checked }).catch(e => setError(message(e)))} />
          <div className="job-card-content"><div className="job-card-title"><a href={row.job.url} target="_blank" rel="noreferrer">{row.job.title} ↗</a><span className="job-status">{statusLabels[row.status]}</span></div><p>{row.job.company} · {row.job.city || '城市待确认'} · {row.job.salary || '薪资待确认'}</p>
          {row.match && <p>必需要求证据覆盖 {Math.round(coverage(row.match.plan, true) * 100)}% · 整体 {Math.round(coverage(row.match.plan) * 100)}% <small>不代表录用概率</small></p>}
          {filter.excluded.length > 0 && <p className="job-warning">已排除：{filter.excluded.join('、')}</p>}{filter.unknown.length > 0 && <p className="job-muted">{filter.unknown.join(' · ')}</p>}
          {row.error && <p className="job-warning">{row.error}</p>}{row.note && <p>{row.note}</p>}
          <div className="jobs-actions"><button onClick={() => setDetail(row.job.id)}>{row.draft ? '核对专用简历与文案' : '查看 JD 与匹配理由'}</button>{row.reviewed && <span>✓ 已核对</span>}{row.batchId && ['attachment_pending', 'unknown'].includes(row.status) && <><button disabled={busy || !connected || batch?.state === 'running'} onClick={() => void run(() => batchAction('RESUME', true, row.batchId))}>核验并继续所属批次</button><button disabled={busy || !connected || batch?.state === 'running'} onClick={() => void run(() => batchAction('CANCEL', false, row.batchId))}>取消该批次剩余任务</button></>}</div></div>
        </article>; })}</div>
      </section>
      {preview && <section className="jobs-panel job-review" id="job-review"><div className="jobs-section-title"><span>03 / REVIEW</span><h2>{preview.job.company} · {preview.job.title}</h2><button onClick={() => setDetail('')}>收起</button></div>
        <details><summary>岗位原文与来源</summary><p className="job-pre">{preview.job.jdText}</p><a href={preview.job.url} target="_blank" rel="noreferrer">打开原始岗位</a></details>
        {preview.match && <div className="job-requirements">{preview.match.plan.requirements.map(req => <div key={req.id}><b>{req.required ? '必需 · ' : ''}{req.text}</b><span>{({ supported: '有事实支持', partial: '部分支持', missing: '缺少证据' })[req.coverage]}</span><p>{req.gap}</p><blockquote>{req.jdQuote}</blockquote>{preview.match!.plan.selected.filter(s => s.requirementIds.includes(req.id)).map(s => <p key={s.factId}>{s.reason}</p>)}</div>)}</div>}
        {preview.draft && <><div className="job-review-grid"><div><h3>改写与事实来源</h3>{preview.draft.result.edits.map(edit => <details key={edit.factId + edit.field}><summary>{edit.reason}</summary><p className="job-pre">原文：{Array.isArray(edit.before) ? edit.before.join('\n') : edit.before}</p><p className="job-pre">改写：{Array.isArray(edit.after) ? edit.after.join('\n') : edit.after}</p>{edit.sources.map(source => <blockquote key={source.id}>{source.quote}</blockquote>)}</details>)}<p>{preview.draft.result.snapshot.selfEvaluation}</p>{preview.draft.result.summarySources.map(source => <blockquote key={source.id}>{source.quote}</blockquote>)}
          <fieldset disabled={busy || lockedBatch || frozenRow(preview)}><label>沟通文案<textarea aria-label="沟通文案" rows={6} maxLength={1000} value={preview.draft.greeting} onChange={e => { const greeting = e.target.value; void patch(preview.job.id, { draft: { ...preview.draft!, greeting }, reviewed: false }).catch(e => setError(message(e))); }} /></label>
          <label className="job-check"><input type="checkbox" checked={Boolean(preview.allowExistingConversation)} onChange={e => void patch(preview.job.id, { allowExistingConversation: e.target.checked, reviewed: false }).catch(e => setError(message(e)))} />我已核对已有会话／同一招聘者的多个岗位，可继续发送对应附件</label>
          <label className="job-check"><input type="checkbox" checked={Boolean(preview.reviewed)} onChange={e => void patch(preview.job.id, { reviewed: e.target.checked }).catch(e => setError(message(e)))} />已核对公司、岗位、文案、事实来源与完整 PDF</label></fieldset><p className="job-muted">{preview.draft.filename} · {(preview.draft.pdf.size / 1024).toFixed(0)} KB</p></div><PdfPreview draft={preview.draft} /></div></>}
      </section>}
      <section className="jobs-panel"><div className="jobs-section-title"><span>04 / APPLY</span><h2>审核整批，逐岗执行</h2></div><p>仅发送本次确认的岗位、沟通文案和专用 PDF。附件受限保留待办，发送结果不明则暂停整批。</p>
        {!capabilities.communicate && <p className="job-warning">当前版本尚未通过 BOSS 真实发送验收。你可以完成匹配、生成、核对和下载；自动发送暂不可用。</p>}
        <div className="jobs-actions"><button className="jobs-primary" disabled={busy || lockedBatch || !connected || !capabilities.communicate || !selected.length || selected.some(r => !r.reviewed || !r.draft || Boolean(r.error))} onClick={() => setConfirmBatch(true)}>审核本批 {selected.length} 个岗位</button>
        <button disabled={busy || !workspace.records.length} onClick={() => void run(exportRecords)}>导出求职记录</button><button disabled={busy || batch?.state === 'running'} onClick={() => setClearConfirm(true)}>清理本地记录</button></div>
        {confirmBatch && <div className="jobs-confirm"><h3>本批将发送至以下招聘者</h3><ul>{selected.map(row => <li key={row.job.id}>{row.job.company} · {row.job.title} · {row.job.recruiter || '招聘者身份待核验'} — {row.draft?.filename}</li>)}</ul><p>专用 PDF 包含你的姓名、联系方式及所选经历。修改任何内容后需重新审核。</p><button onClick={() => setConfirmBatch(false)}>返回核对</button><button disabled={busy} onClick={() => void run(approve)}>确认本批并执行</button></div>}
        {batch && <div className="jobs-progress"><h3>{({ running: '正在逐岗执行', paused: '执行已暂停', completed: '本批处理完成', cancelled: '本批已取消' })[batch.state]}</h3><p>{batch.reason}</p><div className="jobs-actions"><button disabled={busy || !connected || batch.state !== 'running'} onClick={() => void run(() => batchAction('PAUSE'))}>暂停</button><button disabled={busy || !connected || batch.state !== 'paused'} onClick={() => void run(() => batchAction('RESUME'))}>核验并继续</button><button disabled={busy || !connected || !batch.items.some(i => i.status === 'attachment_pending')} onClick={() => void run(() => batchAction('RESUME', true))}>继续附件待办</button><button disabled={busy || !connected || batch.state === 'cancelled'} onClick={() => void run(() => batchAction('CANCEL'))}>取消剩余任务</button></div></div>}
        {clearConfirm && <div className="jobs-confirm"><p>清理当前 ResuLab 身份的岗位和 PDF；连接扩展时同时清理其防重复记录。清理后无法撤销，BOSS 里的已发送消息不受影响。</p><button onClick={() => setClearConfirm(false)}>保留记录</button><button disabled={busy} onClick={() => void run(clearLocalRecords)}>{connected ? '确认清理本机与扩展记录' : '仅清理工作台记录'}</button>{!connected && <p>扩展尚未连接，其记录会保留。</p>}</div>}
      </section><footer className="jobs-footer">记录仅保存在当前浏览器 · 已确认事实用于 AI 分析 · 关闭工作台会暂停任务</footer>
    </main></div>;
}
