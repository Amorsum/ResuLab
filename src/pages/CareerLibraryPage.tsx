import AppHeader from '../components/layout/AppHeader';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useResume } from '../hooks/useResume';
import { useAI } from '../hooks/useAI';
import { createEmptyResume, generateId } from '../constants/defaultResume';
import { applyAIImport, hasImportChanges, prepareAIImport, importRevision } from '../utils/aiImport';
import { emptyLibrary, readLibrary, updateLibrary, newLibrarySource, libraryFacts, libraryInput, resumeFromCareer, exportLibrary, parseLibraryBackup, cleanLibraryResume, approveLibrarySkills, type LibrarySkillReview, type CareerLibrary, type LibraryDraft } from '../utils/careerLibrary';
import { CAREER_SECTIONS, CareerValidationError } from '../../shared/career';
import { verifyCareerResult } from '../../shared/careerComposer';
import { RESUME_WRITER_VERSION } from '../../shared/resumeWritingSkill';
import type { ResumeData, SkillLevel } from '../types/resume';
import { FactsView, SourceCard, factTitle } from '../components/library/LibraryFacts';
import './career-library.css';
import { StudentExperience } from '../components/library/StudentExperience';
import { libraryOwner, reviewedCareerResume } from '../utils/careerLibrary';
import { jobTarget, ROLE_PROFILES } from '../../shared/targetJob';
import { factQuestions } from '../../shared/careerReadiness';

export default function CareerLibraryPage() {
  const { user } = useAuth(), { resume, loadResume } = useResume(), { extractLibraryFacts, tailorResume } = useAI();
  const ownerId = libraryOwner(user?.id), navigate = useNavigate();
  const latest = useRef(ownerId); latest.current = ownerId;
  const [library, setLibrary] = useState<CareerLibrary>(() => emptyLibrary(ownerId));
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [saving, setSaving] = useState(false);
  const lock = useRef(false), operation = useRef<AbortController | null>(null);
  const [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [title, setTitle] = useState('我的大简历'), [confirmed, setConfirmed] = useState(false);
  const [rawText, setRawText] = useState(''), [pasteTitle, setPasteTitle] = useState('补充经历');
  const [proposal, setProposal] = useState<{ resume: ResumeData; text: string; skillReview?: LibrarySkillReview } | null>(null);
  const [jdText, setJdText] = useState(''), [profileId, setProfileId] = useState('');
  const [preview, setPreview] = useState<LibraryDraft | null>(null), [pending, setPending] = useState(false);
  const [targetMode, setTargetMode] = useState<'role' | 'jd'>('role');
  const [selectedEdits, setSelectedEdits] = useState<string[]>([]), [includeSummary, setIncludeSummary] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const [guest, setGuest] = useState<CareerLibrary | null>(null);
  useEffect(() => { let alive = true; if (user) readLibrary(libraryOwner()).then(value => { if (alive) setGuest(value); }).catch(() => {}); else setGuest(null); return () => { alive = false; }; }, [user?.id]);
  useEffect(() => {
    if (!busy) return;
    try { sessionStorage.setItem(`resulab.pending:${ownerId}`, '1'); } catch { /* leave warning remains available */ }
    const started = Date.now(); setElapsed(0);
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => { clearInterval(timer); window.removeEventListener('beforeunload', warn); };
  }, [busy, ownerId]);
  useEffect(() => {
    setSelectedEdits(preview?.result?.edits.map(edit => `${edit.factId}:${edit.field}`) || []);
    setIncludeSummary(true);
  }, [preview?.id]);
  const active = library.ownerId === ownerId, data = active ? library : emptyLibrary(ownerId);
  const locked = busy || saving || loading || !active;
  useEffect(() => {
    let stopped = false;
    setLoading(true); setBusy(false); setSaving(false); setError(''); setNotice(''); setProposal(null); setPreview(null); setPending(false); setJdText(''); setRawText(''); setProfileId('');
    try { const saved = JSON.parse(sessionStorage.getItem(`resulab.target:${ownerId}`) || '{}'); setJdText(saved.jdText || ''); setRawText(saved.rawText || ''); setTargetMode(saved.targetMode === 'jd' ? 'jd' : 'role'); } catch { /* empty session */ }
    try { if (sessionStorage.getItem(`resulab.pending:${ownerId}`)) { setNotice('上次 AI 等待已中断。原材料与目标已保留，已完成的版本可在下方打开；未完成的生成需重新发起，会重新调用模型。'); sessionStorage.removeItem(`resulab.pending:${ownerId}`); } } catch { /* session storage unavailable */ }
    lock.current = false; operation.current?.abort();
    readLibrary(ownerId).then(value => { if (!stopped && latest.current === ownerId) setLibrary(value); })
      .catch(err => { if (!stopped) setError(err.message); }).finally(() => { if (!stopped) setLoading(false); });
    return () => { stopped = true; operation.current?.abort(); };
  }, [ownerId]);
  useEffect(() => { if (loading || !active) return; try { sessionStorage.setItem(`resulab.target:${ownerId}`, JSON.stringify({ jdText, rawText, targetMode })); } catch { /* in-memory input remains */ } }, [jdText, rawText, targetMode, loading, active, ownerId]);
  async function refresh() {
    try { const value = await readLibrary(ownerId); if (latest.current === ownerId) setLibrary(value); }
    catch (err) { setError(err instanceof Error ? err.message : '读取失败'); }
  }
  async function change(update: (current: CareerLibrary) => CareerLibrary): Promise<CareerLibrary | null> {
    if (lock.current || locked) return null;
    lock.current = true; setSaving(true); setError(''); setNotice('');
    try { const next = await updateLibrary(ownerId, data.revision, update); if (latest.current !== ownerId) return null; setLibrary(next); return next; }
    catch (err) { if (latest.current === ownerId) setError(err instanceof Error ? err.message : '保存失败'); return null; }
    finally { if (latest.current === ownerId) { lock.current = false; setSaving(false); } }
  }
  async function capture() {
    try {
      const source = newLibrarySource(resume, title, 'editor', confirmed);
      if (await change(current => ({ ...current, sources: [...current.sources, source] }))) setNotice(confirmed ? '当前简历已保存为已确认材料，生成岗位副本不会修改它。' : '已保存。请展开材料核对事实，再勾选确认。');
    } catch (err) { setError(err instanceof Error ? err.message : '保存失败'); }
  }
  async function extract() {
    if (lock.current || locked) return;
    if (!user) { setError('AI 提取需要登录。也可以直接填写上方经历表单，无需调用 AI。'); return; }
    const owner = ownerId; lock.current = true; setBusy(true); setError(''); setNotice('');
    const controller = new AbortController(); operation.current = controller;
    try {
      const raw = await extractLibraryFacts(rawText, controller.signal);
      if (latest.current !== owner || controller.signal.aborted) return;
      const empty = createEmptyResume(), plan = prepareAIImport(raw, empty);
      if (!hasImportChanges(plan)) throw new Error('未提取到可用经历，请写明实际公司、项目、职责或技能');
      const proposed = applyAIImport(empty, plan);
      proposed.selfEvaluation = ''; proposed.personalInfo = createEmptyResume().personalInfo; proposed.jobIntention = createEmptyResume().jobIntention; proposed.socialLinks = [];
      const skillReview = Object.fromEntries(proposed.skills.map(skill => [skill.id, { include: true, level: '' as const }]));
      setProposal({ resume: proposed, text: rawText, skillReview });
    } catch (err) { if (latest.current === owner) setError(err instanceof Error ? err.message : '提取失败'); }
    finally { if (!controller.signal.aborted) { try { sessionStorage.removeItem(`resulab.pending:${owner}`); } catch { /* no session storage */ } } if (latest.current === owner) { lock.current = false; setBusy(false); } }
  }
  async function confirmProposal() {
    if (!proposal) return;
    try {
      const review = proposal.skillReview || Object.fromEntries(proposal.resume.skills.map(skill => [skill.id, { include: true, level: '' as const }]));
      const approved = approveLibrarySkills(proposal.resume, review);
      const source = newLibrarySource(approved, pasteTitle, 'paste', true, proposal.text);
      if (await change(current => ({ ...current, sources: [...current.sources, source] }))) { setProposal(null); setRawText(''); setNotice('补充经历已确认存入库。'); }
    } catch (err) { setError(err instanceof Error ? err.message : '保存失败'); }
  }
  async function generate() {
    if (lock.current || locked) return;
    if (!user) { setError('AI 定向写作需要登录；已保存的访客经历可先导出备份，登录后恢复。'); return; }
    const owner = ownerId, revision = data.revision;
    lock.current = true; setBusy(true); setError(''); setNotice(''); setPending(false);
    const controller = new AbortController(); operation.current = controller;
    try {
      const input = libraryInput(data, jobTarget(jdText, targetMode).text);
      const result = await verifyCareerResult(await tailorResume(input, controller.signal), input);
      if (latest.current !== owner || controller.signal.aborted) return;
      const profile = data.sources.find(source => source.id === profileId && source.confirmed) || data.sources.find(source => source.kind === 'editor' && source.confirmed);
      const nextResume = resumeFromCareer(profile?.resume || resume, result);
      const draft: LibraryDraft = { id: result.id, title: `${result.plan.roleTitle} · ${new Date().toLocaleDateString('zh-CN')}`, jdText: input.jdText, createdAt: result.createdAt, kind: 'tailored', resume: nextResume, result };
      setPreview(draft);
      if (result.needsMoreFacts) { setNotice('当前材料不足以形成相关简历，请先补充下方列出的真实经历。'); return; }
      try {
        const next = await updateLibrary(owner, revision, current => ({ ...current, drafts: [draft, ...current.drafts] }));
        if (latest.current === owner) { setLibrary(next); setNotice('岗位简历副本已保存。请核对选材、改写和缺口，再打开编辑器。'); }
      } catch { if (latest.current === owner) { setPending(true); setError('生成已完成，但库已变化或保存失败。预览仍保留，可刷新库后另存此副本。'); } }
    } catch (err) {
      if (latest.current === owner && !controller.signal.aborted) setError(err instanceof CareerValidationError ? `结果未通过事实校验（${err.rule}），未应用修改。请检查材料或重试。` : err instanceof Error ? err.message : '生成失败');
    } finally { if (!controller.signal.aborted) { try { sessionStorage.removeItem(`resulab.pending:${owner}`); } catch { /* no session storage */ } } if (latest.current === owner) { lock.current = false; setBusy(false); } }
  }
  async function savePending() {
    if (!preview) return;
    const draft = preview;
    if (await change(current => ({ ...current, drafts: current.drafts.some(item => item.id === draft.id) ? current.drafts : [draft, ...current.drafts] }))) { setPending(false); setNotice('此预览已另存副本；它使用生成当时的事实，请再次核对。'); }
  }
  async function openDraft(draft: LibraryDraft) {
    if (locked) return;
    const same = importRevision(cleanLibraryResume(resume)) === importRevision(draft.resume);
    if (!same && (CAREER_SECTIONS.some(section => resume[section].length) || resume.personalInfo.fullName || resume.selfEvaluation)) {
      const backup: LibraryDraft = { id: generateId(), title: '切换前的编辑器备份', jdText: '', createdAt: Date.now(), kind: 'editor-backup', resume: cleanLibraryResume(resume) };
      if (!await change(current => ({ ...current, drafts: [backup, ...current.drafts] }))) return;
    }
    if (latest.current !== ownerId) return;
    loadResume(structuredClone(draft.resume)); navigate(`/builder/${draft.resume.templateId}`);
  }
  async function openReviewed() {
    if (!preview) return;
    const reviewed: LibraryDraft = { ...preview, kind: 'saved', id: generateId(), title: `${preview.result?.plan.roleTitle || preview.title} · 已核对`, createdAt: Date.now(), resume: reviewedCareerResume(preview, selectedEdits, includeSummary) };
    const backup: LibraryDraft = { id: generateId(), title: '切换前的编辑器备份', jdText: '', createdAt: Date.now(), kind: 'editor-backup', resume: cleanLibraryResume(resume) };
    if (await change(current => ({ ...current, drafts: [reviewed, backup, ...current.drafts] }))) {
      loadResume(structuredClone(reviewed.resume)); navigate(`/builder/${reviewed.resume.templateId}`);
    }
  }
  async function openOriginal() {
    try {
      const next = cleanLibraryResume(resume), facts = libraryFacts(data);
      for (const section of CAREER_SECTIONS) Object.assign(next, { [section]: facts.filter(fact => fact.section === section).map(fact => structuredClone(fact.data)) });
      next.selfEvaluation = ''; delete next._cloudId;
      if (targetMode === 'role' && jdText.trim()) next.jobIntention.desiredPosition = jdText.trim();
      const draft: LibraryDraft = { id: generateId(), title: `${next.jobIntention.desiredPosition || '我的简历'} · 事实原文`, jdText, createdAt: Date.now(), kind: 'saved', resume: next };
      const backup: LibraryDraft = { id: generateId(), title: '切换前的编辑器备份', jdText: '', createdAt: Date.now(), kind: 'editor-backup', resume: cleanLibraryResume(resume) };
      if (await change(current => ({ ...current, drafts: [draft, backup, ...current.drafts] }))) { loadResume(next); navigate(`/builder/${next.templateId}`); }
    } catch (err) { setError(err instanceof Error ? err.message : '创建副本失败，请检查材料'); }
  }
  function download() {
    const url = URL.createObjectURL(new Blob([exportLibrary(data)], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `ResuLab-经历库-${new Date().toLocaleDateString('sv-SE')}.json`; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function restore(file: File) {
    try {
      if (file.size > 20000000) throw new Error('备份文件过大');
      const backup = parseLibraryBackup(await file.text());
      if (await change(current => ({ ...current, sources: [...current.sources, ...backup.sources], drafts: [...backup.drafts, ...current.drafts] }))) setNotice('备份已追加恢复。导入的材料须重新核对确认，才会参与AI选材。');
    } catch (err) { setError(err instanceof Error ? err.message : '备份无效'); }
  }
  let factCount = 0;
  try { factCount = libraryFacts(data).length; } catch { /* Validation explains malformed source data on generation. */ }
  const selectionTitle = (id: string) => {
    if (preview) for (const section of CAREER_SECTIONS) { const item = preview.resume[section].find(item => item.id === id); if (item) return factTitle(section, item); }
    return '入选材料';
  };
  const skillReview = proposal?.skillReview || Object.fromEntries((proposal?.resume.skills || []).map(skill => [skill.id, { include: true, level: '' as const }]));
  const skillsNeedReview = Boolean(proposal?.resume.skills.some(skill => skillReview[skill.id]?.include && !skillReview[skill.id]?.level));
  let questions: ReturnType<typeof factQuestions> = [];
  try { questions = factQuestions(libraryFacts(data)); } catch { /* generation reports invalid sources */ }
  return <div className="career-page">
    <AppHeader />
    <main className="career-container">
      <div className="career-heading"><div><span className="career-eyebrow">我的材料与岗位版本</span><h1>经历工作台</h1><p>整理真实经历，按岗位生成副本，再核对、编辑和导出。</p></div><span className="career-pill verified">{factCount} 条已确认事实</span></div>
      <nav className="career-steps" aria-label="求职简历流程"><a href="#materials"><b>01</b> 整理经历</a><a href="#target"><b>02</b> 确定岗位</a><a href="#review"><b>03</b> 核对与补充</a><a href="#versions"><b>04</b> 保存与导出</a></nav>
      {!user && <p className="career-notice">当前为本机访客经历库，可先整理经历、保存版本和导出。<Link to="/login?redirect=/library">登录</Link>后使用 AI，并可一键复制本机访客材料到账号。</p>}
      {user && guest && guest.sources.some(source => !data.sources.some(item => item.id === source.id)) && <div className="career-notice">这台设备上还有访客经历。<button className="career-button" disabled={locked} onClick={() => void change(current => ({ ...current, sources: [...current.sources, ...guest.sources.filter(source => !current.sources.some(item => item.id === source.id))], drafts: [...current.drafts, ...guest.drafts.filter(draft => !current.drafts.some(item => item.id === draft.id))] }))}>复制本机访客材料到此账号</button><p className="career-muted">复制保存在本机，原访客材料会保留。仅在你自己的设备上操作。</p></div>}
      <div className="career-storage"><span>本机保存 · 按当前账号隔离。清理浏览器数据前请导出备份。</span><div className="career-actions"><button className="career-button" onClick={download} disabled={locked}>导出备份</button><label className="career-button">恢复备份<input type="file" accept="application/json,.json" disabled={locked} onChange={event => { const file = event.target.files?.[0]; if (file) void restore(file); event.target.value = ''; }} hidden /></label><button className="career-button" disabled={busy || saving} onClick={() => void refresh()}>刷新库</button></div></div>
      {error && <div className="career-error" role="alert">{error}</div>}{notice && <div className="career-notice" role="status">{notice}</div>}
      {busy && <div className="career-notice" role="status">正在等待 AI 分析选材、写作与事实校验 · 已等待 {elapsed} 秒。完成后才会显示结果，原材料已保留。{operation.current && <button className="career-button" onClick={() => { operation.current?.abort(); setNotice('已停止等待；原材料保留，服务端可能仍在处理，重试会重新调用模型。'); }}>停止等待</button>}</div>}
      <div className="career-grid">
        <section className="career-panel" id="materials"><h2><span className="step-number">01</span> 整理真实经历</h2>
          <StudentExperience ownerId={ownerId} key={ownerId} disabled={locked} save={async source => { const saved = await change(current => ({ ...current, sources: [...current.sources, source] })); if (saved) setNotice('经历已保存。接下来填写目标岗位；也可以继续添加其他经历。'); return Boolean(saved); }} />
          <details><summary>已有简历？保存当前编辑器内容</summary>
          <fieldset disabled={locked}><label className="career-label">材料名称<input value={title} onChange={event => setTitle(event.target.value)} maxLength={120} /></label><label className="career-check"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />我已核对当前简历中的事实</label><button className="career-button career-primary" onClick={() => void capture()}>保存当前编辑器简历</button></fieldset>
          <p className="career-muted">还没录入？<Link to="/builder">打开编辑器填写或粘贴已有简历</Link>，回来后保存即可。</p></details>
          <details className="career-paste"><summary>粘贴补充经历</summary><fieldset disabled={locked}>
            <label className="career-label">材料名称<input value={pasteTitle} onChange={event => setPasteTitle(event.target.value)} maxLength={120} /></label>
            <label className="career-label">原始经历<textarea value={rawText} onChange={event => setRawText(event.target.value)} rows={7} maxLength={20000} placeholder="写明实际公司或项目、你的职责、采取的方法、交付物和已知结果。没有指标也可以。" /></label>
            <button className="career-button" disabled={rawText.trim().length < 20 || locked} onClick={() => void extract()}>AI 提取为待核对材料</button><p className="career-muted">提取结果需核对确认后才入库，原始材料会保留。</p>
          </fieldset></details>
          {proposal && <div className="career-proposal"><h3>核对提取结果</h3><FactsView resume={{ ...proposal.resume, skills: [] }} />
            {proposal.resume.skills.length > 0 && <section><h4>单独核对技能程度</h4><p className="career-muted">模型不能替你判断熟练程度。不确定时可不保留独立技能条目，项目中使用过工具的事实仍会保留。</p>{proposal.resume.skills.map(skill => <div className="career-skill-review" key={skill.id}><label className="career-check"><input type="checkbox" checked={skillReview[skill.id]?.include ?? true} onChange={event => setProposal({ ...proposal, skillReview: { ...skillReview, [skill.id]: { ...skillReview[skill.id], include: event.target.checked } } })} />保留技能：{skill.skillName}</label><label className="career-label">{skill.skillName} 的实际程度<select value={skillReview[skill.id]?.level || ''} disabled={!skillReview[skill.id]?.include} onChange={event => setProposal({ ...proposal, skillReview: { ...skillReview, [skill.id]: { ...skillReview[skill.id], level: event.target.value as SkillLevel | '' } } })}><option value="">请选择本人确认的程度</option>{(['了解', '掌握', '熟练', '精通'] as const).map(level => <option key={level} value={level}>{level}</option>)}</select></label></div>)}</section>}
            <div className="career-actions"><button className="career-button career-primary" disabled={locked || skillsNeedReview} onClick={() => void confirmProposal()}>确认事实并存入库</button><button className="career-button" disabled={locked} onClick={() => setProposal(null)}>放弃此次提取</button></div></div>}
          <div className="career-source-list">{loading ? <p>正在读取经历库…</p> : !data.sources.length ? <div className="career-empty">还没有经历。上方写一次课程作业、竞赛或志愿活动，就能开始；不需要正式实习。</div> : data.sources.map(source => <SourceCard key={source.id} source={source} disabled={locked} change={async patch => Boolean(await change(current => ({ ...current, sources: current.sources.map(item => item.id === source.id ? { ...item, ...patch } : item) })))} />)}</div>
        </section>
        <section className="career-panel" id="target"><h2><span className="step-number">02</span> 确定你的下一站</h2>
          <fieldset disabled={locked}><div className="target-tabs" role="group" aria-label="岗位输入方式"><button className="career-button" aria-pressed={targetMode === 'role'} onClick={() => setTargetMode('role')}>只有岗位名称</button><button className="career-button" aria-pressed={targetMode === 'jd'} onClick={() => setTargetMode('jd')}>我有招聘 JD</button></div>
            <label className="career-label">{targetMode === 'role' ? '目标岗位名称' : '招聘岗位描述'}<textarea value={jdText} onChange={event => setJdText(event.target.value)} rows={targetMode === 'role' ? 2 : 7} maxLength={targetMode === 'role' ? 120 : 12000} placeholder={targetMode === 'role' ? '例如：前端开发实习生 / 产品助理' : '粘贴岗位职责和招聘要求，越具体越容易选出合适的经历。'} /></label>
            {targetMode === 'role' && <><div className="career-actions">{ROLE_PROFILES.slice(0, 4).map(role => <button key={role.title} className="career-button" onClick={() => setJdText(role.title)}>{role.title}</button>)}</div><p className="career-muted">只有岗位名称时使用通用参考，不代表某家公司的要求。可随时切换并补充真实 JD。</p>{jdText.trim() && <details><summary>查看本次通用岗位画像</summary><p className="career-text">{jobTarget(jdText, 'role').text}</p></details>}</>}
            <label className="career-label">个人信息与模板来源<select value={profileId} onChange={event => setProfileId(event.target.value)}><option value="">沿用已确认的大简历或当前编辑器</option>{data.sources.filter(source => source.confirmed).map(source => <option key={source.id} value={source.id}>{source.title}</option>)}</select></label>
            <p className="career-muted">联系方式与头像在本地沿用，不发送给模型。只使用已确认且勾选的材料；原始经历库保持原样。</p>
            {questions.length > 0 && <div className="readiness"><h3>生成前，优先补充这些事实</h3><p className="career-muted">根据已填写字段检查，最多 3 项；展开左侧对应材料即可补充。不知道的内容可以留空，仍可继续。</p>{questions.map(question => <p key={question.factId}><strong>{question.title}</strong>：{question.question}</p>)}</div>}
            <button className="career-button career-primary" disabled={locked || !factCount || jdText.trim().length < (targetMode === 'role' ? 2 : 10)} onClick={() => void generate()}>{preview ? '用最新事实重新分析与写作' : '分析匹配并生成待核对简历'}</button>
            {!factCount && <p className="career-muted">先添加一段经历并确认真实，即可开始。</p>}
            {factCount > 0 && <p className="career-muted">也可以不使用 AI：<button className="career-button" disabled={locked} onClick={() => void openOriginal()}>用已确认原文创建可编辑副本</button>保留全部已选事实，随后自行编辑与导出。</p>}
          </fieldset>
          <details className="career-method"><summary>当前写作方法 · {RESUME_WRITER_VERSION}</summary><p>按硬性要求、实际行动与证据强度选材；用“行动、业务对象、方法、已有结果”组织条目。缺少结果不编造指标，所有数字有来源，跨项目事实不能串用。</p><p><a href="https://github.com/Hfx-J/tailored-resume-generator" target="_blank" rel="noreferrer">经历库与选材方法参考</a> · <a href="https://capd.mit.edu/resources/resumes-writing-about-your-skills/" target="_blank" rel="noreferrer">MIT 写作方法参考</a> · <a href="https://careerservices.fas.harvard.edu/resources/create-a-strong-resume/" target="_blank" rel="noreferrer">Harvard 简历指南</a></p></details>

        </section>
      </div>
          {preview?.result && <div className="career-panel career-result" id="review"><span className="career-eyebrow">REVIEW BEFORE YOU APPLY</span><h3>{preview.title}</h3>{preview.jdText.includes('以下为通用岗位参考') && <p className="career-notice">当前依据通用岗位画像分析，不代表具体公司的招聘要求。补充真实 JD 后可重新生成。</p>}<p className="career-muted">已完成选材和写作 · {preview.result.modelCalls} 次模型调用 · 内容仍需本人核对；证据覆盖不代表录用概率。</p><div className="review-grid"><aside>
            {preview.result.plan.requirements.map(req => <article className="career-requirement" key={req.id}><div className="career-row"><strong>{req.text}</strong><span className={`career-pill ${req.coverage === 'supported' ? 'verified' : ''}`}>{req.coverage === 'supported' ? '有依据' : req.coverage === 'partial' ? '部分支持' : '缺少经历'}</span></div><blockquote>{req.jdQuote}</blockquote>{preview.result!.plan.selected.filter(item => item.requirementIds.includes(req.id)).map(item => <p key={item.factId} className="career-muted">依据：{selectionTitle(item.factId)}</p>)}{req.gap && <><p>{req.gap}</p><a className="career-muted" href="#materials">有相关经历？补充事实后重新分析 ↗</a></>}</article>)}
            <details open><summary>为什么选择这些经历</summary>{preview.result.plan.selected.map(selection => <p key={selection.factId}><strong>{selectionTitle(selection.factId)}</strong> · {selection.reason}</p>)}</details>
            </aside><div><details open><summary>逐条选择改写 · 未选中会保留原文</summary>{preview.result.edits.map(edit => <article className="career-edit" key={edit.factId + edit.field}><label className="career-check"><input type="checkbox" checked={selectedEdits.includes(`${edit.factId}:${edit.field}`)} onChange={event => setSelectedEdits(previous => event.target.checked ? [...previous, `${edit.factId}:${edit.field}`] : previous.filter(key => key !== `${edit.factId}:${edit.field}`))} /><strong>{selectionTitle(edit.factId)} · {edit.field === 'highlights' ? '亮点' : '描述'}</strong></label><div className="career-diff"><div><span>原文</span><p>{Array.isArray(edit.before) ? edit.before.join('\n') : edit.before || '（空）'}</p></div><div><span>岗位表达</span><p>{Array.isArray(edit.after) ? edit.after.join('\n') : edit.after}</p></div></div><p>{edit.reason}</p>{edit.sources.map(source => <blockquote key={source.id}>{source.quote}</blockquote>)}</article>)}</details>
            {preview.result.snapshot.selfEvaluation && <div><label className="career-check"><input type="checkbox" checked={includeSummary} onChange={event => setIncludeSummary(event.target.checked)} />保留岗位摘要</label><p className="career-text">{preview.result.snapshot.selfEvaluation}</p><details><summary>摘要事实来源</summary>{preview.result.summarySources.map(source => <blockquote key={source.id}>{source.quote}</blockquote>)}</details></div>}
            {!preview.result.needsMoreFacts && <><details><summary>查看完整岗位简历内容</summary><FactsView resume={reviewedCareerResume(preview, selectedEdits, includeSummary)} /></details><div className="career-actions"><button className="career-button" onClick={() => { setSelectedEdits([]); setIncludeSummary(false); }}>撤销全部改写，保留原文</button><button className="career-button" onClick={() => { setSelectedEdits(preview.result!.edits.map(edit => `${edit.factId}:${edit.field}`)); setIncludeSummary(true); }}>重新选中全部建议</button></div><p className="career-muted">打开会切换编辑器；切换前的内容会自动保存为独立备份，不会写回事实库。</p><div className="career-actions">{pending ? <button className="career-button career-primary" disabled={locked} onClick={() => void savePending()}>将此预览另存副本</button> : <button className="career-button career-primary" disabled={locked} onClick={() => void openReviewed()}>保存所选建议并打开编辑器</button>}</div></>}
          </div></div></div>}

          <div className="career-history" id="versions"><h3>已保存的岗位简历与备份</h3>{!data.drafts.length && <p className="career-muted">每次生成或另存均为独立副本。编辑后的版本请在编辑器中选择“另存岗位版本”。</p>}{data.drafts.map(draft => <article className="career-row career-history-item" key={draft.id}><div><strong>{draft.title}</strong><p className="career-muted">{draft.kind === 'tailored' ? 'AI 待核对 / 岗位简历' : draft.kind === 'saved' ? '手动保存的版本' : '切换前备份'} · {new Date(draft.createdAt).toLocaleString('zh-CN')}</p></div><div className="career-actions">{draft.result && <button className="career-button" disabled={locked} onClick={() => { setPreview(draft); setPending(false); setTimeout(() => document.getElementById("review")?.scrollIntoView({ block: "start" }), 0); }}>核对</button>}<button className="career-button" disabled={locked} onClick={() => void openDraft(draft)}>打开</button></div></article>)}</div>
    </main>
  </div>;
}
