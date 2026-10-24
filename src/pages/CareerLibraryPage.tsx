import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useResume } from '../hooks/useResume';
import { useAI } from '../hooks/useAI';
import { useAIContext } from '../hooks/useAIContext';
import { createEmptyResume, generateId } from '../constants/defaultResume';
import { applyAIImport, hasImportChanges, prepareAIImport, importRevision } from '../utils/aiImport';
import { emptyLibrary, readLibrary, updateLibrary, newLibrarySource, libraryFacts, libraryInput, resumeFromCareer, exportLibrary, parseLibraryBackup, cleanLibraryResume, approveLibrarySkills, type LibrarySkillReview, type CareerLibrary, type LibraryDraft } from '../utils/careerLibrary';
import { CAREER_SECTIONS, CareerValidationError } from '../../shared/career';
import { verifyCareerResult } from '../../shared/careerComposer';
import { RESUME_WRITER_VERSION } from '../../shared/resumeWritingSkill';
import type { ResumeData, SkillLevel } from '../types/resume';
import { FactsView, SourceCard, factTitle } from '../components/library/LibraryFacts';
import './career-library.css';

export default function CareerLibraryPage() {
  const { user } = useAuth(), { resume, loadResume } = useResume(), { extractLibraryFacts, tailorResume } = useAI();
  const { refreshMembership } = useAIContext();
  const ownerId = user?.id || '', navigate = useNavigate();
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
  const active = library.ownerId === ownerId, data = active ? library : emptyLibrary(ownerId);
  const locked = busy || saving || loading || !active;
  useEffect(() => {
    let stopped = false;
    setLoading(true); setBusy(false); setSaving(false); setError(''); setNotice(''); setProposal(null); setPreview(null); setPending(false); setJdText(''); setRawText(''); setProfileId('');
    lock.current = false; operation.current?.abort();
    readLibrary(ownerId).then(value => { if (!stopped && latest.current === ownerId) setLibrary(value); })
      .catch(err => { if (!stopped) setError(err.message); }).finally(() => { if (!stopped) setLoading(false); });
    return () => { stopped = true; operation.current?.abort(); };
  }, [ownerId]);
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
    const owner = ownerId; lock.current = true; setBusy(true); setError(''); setNotice('');
    try {
      const raw = await extractLibraryFacts(rawText);
      if (latest.current !== owner) return;
      void refreshMembership();
      const empty = createEmptyResume(), plan = prepareAIImport(raw, empty);
      if (!hasImportChanges(plan)) throw new Error('未提取到可用经历，请写明实际公司、项目、职责或技能');
      const proposed = applyAIImport(empty, plan);
      proposed.selfEvaluation = ''; proposed.personalInfo = createEmptyResume().personalInfo; proposed.jobIntention = createEmptyResume().jobIntention; proposed.socialLinks = [];
      const skillReview = Object.fromEntries(proposed.skills.map(skill => [skill.id, { include: true, level: '' as const }]));
      setProposal({ resume: proposed, text: rawText, skillReview });
    } catch (err) { if (latest.current === owner) setError(err instanceof Error ? err.message : '提取失败'); }
    finally { if (latest.current === owner) { lock.current = false; setBusy(false); } }
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
    const owner = ownerId, revision = data.revision;
    lock.current = true; setBusy(true); setError(''); setNotice(''); setPending(false);
    const controller = new AbortController(); operation.current = controller;
    try {
      const input = libraryInput(data, jdText);
      const result = await verifyCareerResult(await tailorResume(input, controller.signal), input);
      if (latest.current !== owner || controller.signal.aborted) return;
      void refreshMembership();
      const profile = data.sources.find(source => source.id === profileId && source.confirmed) || data.sources.find(source => source.kind === 'editor' && source.confirmed) || data.sources.find(source => source.confirmed);
      const nextResume = resumeFromCareer(profile?.resume || createEmptyResume(), result);
      const draft: LibraryDraft = { id: result.id, title: `${result.plan.roleTitle} · ${new Date().toLocaleDateString('zh-CN')}`, jdText: input.jdText, createdAt: result.createdAt, kind: 'tailored', resume: nextResume, result };
      setPreview(draft);
      if (result.needsMoreFacts) { setNotice('当前材料不足以形成相关简历，请先补充下方列出的真实经历。'); return; }
      try {
        const next = await updateLibrary(owner, revision, current => ({ ...current, drafts: [draft, ...current.drafts] }));
        if (latest.current === owner) { setLibrary(next); setNotice('岗位简历副本已保存。请核对选材、改写和缺口，再打开编辑器。'); }
      } catch { if (latest.current === owner) { setPending(true); setError('生成已完成，但库已变化或保存失败。预览仍保留，可刷新库后另存此副本。'); } }
    } catch (err) {
      if (latest.current === owner && !controller.signal.aborted) setError(err instanceof CareerValidationError ? '请确认有可用材料，且单次不超过160条、18万字；如结果校验失败请稍后重试。' : err instanceof Error ? err.message : '生成失败');
    } finally { if (latest.current === owner) { lock.current = false; setBusy(false); } }
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
  return <div className="career-page">
    <header className="career-header"><Link to="/builder">← 返回简历编辑器</Link><span>ResuLab / 我的经历库</span></header>
    <main className="career-container">
      <div className="career-heading"><div><span className="career-eyebrow">CAREER LIBRARY</span><h1>一份完整经历，写出不同岗位的简历</h1><p>保留大简历和补充材料，围绕每个JD选择事实、组织表达，保存独立副本。</p></div><span className="career-pill">{factCount} 条已确认事实可选</span></div>
      <div className="career-storage"><span>本机保存 · 按当前账号隔离。清理浏览器数据前请导出备份。</span><div className="career-actions"><button className="career-button" onClick={download} disabled={locked}>导出备份</button><label className="career-button">恢复备份<input type="file" accept="application/json,.json" disabled={locked} onChange={event => { const file = event.target.files?.[0]; if (file) void restore(file); event.target.value = ''; }} hidden /></label><button className="career-button" disabled={busy || saving} onClick={() => void refresh()}>刷新库</button></div></div>
      {error && <div className="career-error" role="alert">{error}</div>}{notice && <div className="career-notice" role="status">{notice}</div>}
      {busy && <div className="career-notice" role="status">正在分析选材或写作，请保留此页；不会自动重复提交。</div>}
      <div className="career-grid">
        <section className="career-panel"><h2>1. 积累你的完整经历</h2>
          <fieldset disabled={locked}><label className="career-label">材料名称<input value={title} onChange={event => setTitle(event.target.value)} maxLength={120} /></label><label className="career-check"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />我已核对当前简历中的事实</label><button className="career-button career-primary" onClick={() => void capture()}>保存当前编辑器简历</button></fieldset>
          <details className="career-paste"><summary>粘贴补充经历</summary><fieldset disabled={locked}>
            <label className="career-label">材料名称<input value={pasteTitle} onChange={event => setPasteTitle(event.target.value)} maxLength={120} /></label>
            <label className="career-label">原始经历<textarea value={rawText} onChange={event => setRawText(event.target.value)} rows={7} maxLength={20000} placeholder="写明实际公司或项目、你的职责、采取的方法、交付物和已知结果。没有指标也可以。" /></label>
            <button className="career-button" disabled={rawText.trim().length < 20 || locked} onClick={() => void extract()}>AI 提取为待核对材料</button><p className="career-muted">提取和定向生成各使用一次现有AI生成额度；提取结果需确认后才入库。</p>
          </fieldset></details>
          {proposal && <div className="career-proposal"><h3>核对提取结果</h3><FactsView resume={{ ...proposal.resume, skills: [] }} />
            {proposal.resume.skills.length > 0 && <section><h4>单独核对技能程度</h4><p className="career-muted">模型不能替你判断熟练程度。不确定时可不保留独立技能条目，项目中使用过工具的事实仍会保留。</p>{proposal.resume.skills.map(skill => <div className="career-skill-review" key={skill.id}><label className="career-check"><input type="checkbox" checked={skillReview[skill.id]?.include ?? true} onChange={event => setProposal({ ...proposal, skillReview: { ...skillReview, [skill.id]: { ...skillReview[skill.id], include: event.target.checked } } })} />保留技能：{skill.skillName}</label><label className="career-label">{skill.skillName} 的实际程度<select value={skillReview[skill.id]?.level || ''} disabled={!skillReview[skill.id]?.include} onChange={event => setProposal({ ...proposal, skillReview: { ...skillReview, [skill.id]: { ...skillReview[skill.id], level: event.target.value as SkillLevel | '' } } })}><option value="">请选择本人确认的程度</option>{(['了解', '掌握', '熟练', '精通'] as const).map(level => <option key={level} value={level}>{level}</option>)}</select></label></div>)}</section>}
            <div className="career-actions"><button className="career-button career-primary" disabled={locked || skillsNeedReview} onClick={() => void confirmProposal()}>确认事实并存入库</button><button className="career-button" disabled={locked} onClick={() => setProposal(null)}>放弃此次提取</button></div></div>}
          <div className="career-source-list">{loading ? <p>正在读取经历库…</p> : !data.sources.length ? <div className="career-empty">先保存一份大简历，之后可以持续补充工作、项目、技能与成果。</div> : data.sources.map(source => <SourceCard key={source.id} source={source} disabled={locked} change={patch => void change(current => ({ ...current, sources: current.sources.map(item => item.id === source.id ? { ...item, ...patch } : item) }))} />)}</div>
        </section>
        <section className="career-panel"><h2>2. 针对一个 JD 写简历</h2>
          <fieldset disabled={locked}><label className="career-label">招聘岗位描述<textarea value={jdText} onChange={event => setJdText(event.target.value)} rows={9} maxLength={12000} placeholder="粘贴完整JD。系统先选相关经历，再写岗位摘要和具体条目。" /></label>
            <label className="career-label">个人信息与模板来源<select value={profileId} onChange={event => setProfileId(event.target.value)}><option value="">自动使用已确认的大简历</option>{data.sources.filter(source => source.confirmed).map(source => <option key={source.id} value={source.id}>{source.title}</option>)}</select></label>
            <p className="career-muted">联系方式与头像在本地沿用，不发送给模型。只使用已确认且勾选的材料；原始经历库保持原样。</p>
            <button className="career-button career-primary" disabled={locked || !factCount || jdText.trim().length < 10} onClick={() => void generate()}>从经历库生成岗位简历</button>
          </fieldset>
          <details className="career-method"><summary>当前写作方法 · {RESUME_WRITER_VERSION}</summary><p>按硬性要求、实际行动与证据强度选材；用“行动、业务对象、方法、已有结果”组织条目。缺少结果不编造指标，所有数字有来源，跨项目事实不能串用。</p><p><a href="https://github.com/Hfx-J/tailored-resume-generator" target="_blank" rel="noreferrer">经历库与选材方法参考</a> · <a href="https://capd.mit.edu/resources/resumes-writing-about-your-skills/" target="_blank" rel="noreferrer">MIT 写作方法参考</a> · <a href="https://careerservices.fas.harvard.edu/resources/create-a-strong-resume/" target="_blank" rel="noreferrer">Harvard 简历指南</a></p></details>
          {preview?.result && <div className="career-result"><h3>{preview.title}</h3><p className="career-muted">已完成选材和写作 · {preview.result.modelCalls} 次模型调用 · 内容仍需本人核对</p>
            {preview.result.plan.requirements.map(req => <article className="career-requirement" key={req.id}><div className="career-row"><strong>{req.text}</strong><span className={`career-pill ${req.coverage === 'supported' ? 'verified' : ''}`}>{req.coverage === 'supported' ? '有依据' : req.coverage === 'partial' ? '部分支持' : '缺少经历'}</span></div><blockquote>{req.jdQuote}</blockquote>{req.gap && <p>{req.gap}</p>}</article>)}
            <details open><summary>为什么选择这些经历</summary>{preview.result.plan.selected.map(selection => <p key={selection.factId}><strong>{selectionTitle(selection.factId)}</strong> · {selection.reason}</p>)}</details>
            <details><summary>查看改写和来源</summary>{preview.result.edits.map(edit => <article className="career-edit" key={edit.factId + edit.field}><strong>{selectionTitle(edit.factId)} · {edit.field === 'highlights' ? '亮点' : '描述'}</strong><div className="career-diff"><div><span>原文</span><p>{Array.isArray(edit.before) ? edit.before.join('\n') : edit.before || '（空）'}</p></div><div><span>岗位表达</span><p>{Array.isArray(edit.after) ? edit.after.join('\n') : edit.after}</p></div></div><p>{edit.reason}</p>{edit.sources.map(source => <blockquote key={source.id}>{source.quote}</blockquote>)}</article>)}</details>
            {preview.result.snapshot.selfEvaluation && <div><h4>岗位摘要</h4><p className="career-text">{preview.result.snapshot.selfEvaluation}</p><details><summary>摘要事实来源</summary>{preview.result.summarySources.map(source => <blockquote key={source.id}>{source.quote}</blockquote>)}</details></div>}
            {!preview.result.needsMoreFacts && <><details><summary>查看完整岗位简历内容</summary><FactsView resume={preview.resume} /></details><p className="career-muted">打开会切换编辑器；切换前的内容会自动保存为独立备份，不会写回事实库。</p><div className="career-actions">{pending ? <button className="career-button career-primary" disabled={locked} onClick={() => void savePending()}>将此预览另存副本</button> : <button className="career-button career-primary" disabled={locked} onClick={() => void openDraft(preview)}>核对后打开副本并预览导出</button>}</div></>}
          </div>}
          <div className="career-history"><h3>已保存的岗位简历与备份</h3>{!data.drafts.length && <p className="career-muted">每次生成保存为独立副本，大简历不会被覆盖。</p>}{data.drafts.map(draft => <article className="career-row career-history-item" key={draft.id}><div><strong>{draft.title}</strong><p className="career-muted">{draft.kind === 'tailored' ? '岗位简历' : '编辑器备份'} · {new Date(draft.createdAt).toLocaleString('zh-CN')}</p></div><div className="career-actions">{draft.result && <button className="career-button" disabled={locked} onClick={() => { setPreview(draft); setPending(false); }}>核对</button>}<button className="career-button" disabled={locked} onClick={() => void openDraft(draft)}>打开</button></div></article>)}</div>
        </section>
      </div>
    </main>
  </div>;
}
