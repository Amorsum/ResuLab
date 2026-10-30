import { Link } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { ENTRY_KINDS, type CareerEntryInput } from '../../../shared/careerEntries';
import { careerLabels } from './LibraryFacts';
import { entryLabels, factsFromDetails, replaceProjectFacts } from '../../utils/careerEntryForm';
import { blankCareerEntry } from '../../utils/careerStore';
import type { CareerFact } from '../../../shared/career';
import { readResumeFile } from '../../utils/resumeFile';

export function CareerEntryEditor({ ownerId, initial, expectedRevision, draftScope, busy, save, extract, cancel, projectMode = false }: {
  projectMode?: boolean; ownerId: string; initial: CareerEntryInput | null; expectedRevision: number; draftScope: string; busy: boolean;
  save: (input: CareerEntryInput, confirm: boolean, expectedRevision: number) => Promise<void>;
  extract: (input: CareerEntryInput, expectedRevision: number) => Promise<{ facts: CareerFact[]; revision: number; error?: string }>; cancel: () => void;
}) {
  const key = `resulab.career-entry-draft:${ownerId}${initial ? `:${initial.id}` : ''}${draftScope ? `:${draftScope}` : ''}`;
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const [draft] = useState(() => {
    try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; }
  });
  const [value, setValue] = useState<CareerEntryInput>(() => {
    return draft?.input || (!initial && draft) || initial || blankCareerEntry();
  });
  const [baseRevision, setBaseRevision] = useState(() => draft?.input ? draft.expectedRevision ?? 0 : initial ? expectedRevision : 0);
  const [inputMode, setInputMode] = useState<'manual' | 'file' | 'repository'>(initial ? 'manual' : 'manual');
  const [full, setFull] = useState(Boolean(initial?.facts.length)), [error, setError] = useState(''), [storageError, setStorageError] = useState('');
  const [reading, setReading] = useState(false), [fileNotice, setFileNotice] = useState('');
  const [descriptionPreview, setDescriptionPreview] = useState<string | null>(null);
  const fileController = useRef<AbortController | null>(null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; fileController.current?.abort(); }; }, []);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    element.showModal();
    heading.current?.focus();
    return () => { if (element.open) element.close(); };
  }, []);
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify({ input: value, expectedRevision: baseRevision })); setStorageError(''); } catch { setStorageError('填写草稿未能写入本机，请复制内容或立即导出备份。'); } }, [key, value, baseRevision]);
  const patch = (update: Partial<CareerEntryInput>) => setValue(v => ({ ...v, ...update, status: 'draft' }));
  const detail = (name: keyof CareerEntryInput['details'], text: string) => patch({ details: { ...value.details, [name]: text } });
  async function action(fn: () => Promise<void>) {
    setError(''); try { await fn(); } catch (err) { if (alive.current) setError(err instanceof Error ? err.message : '操作失败'); }
  }
  function updateFact(index: number, field: string, content: unknown) {
    patch({ facts: value.facts.map((f, i) => i === index ? { ...f, data: { ...f.data, [field]: content } } as CareerFact : f) });
  }
  const projectFacts = value.facts.map((fact, index) => ({ fact, index })).filter(({ fact }) => fact.section === 'projects' && 'projectName' in fact.data);
  const simpleProjectEdit = projectMode && projectFacts.length > 0;
  function updateProjectName(index: number, oldName: string, name: string) {
    patch({ ...(projectFacts.length === 1 && value.title === oldName ? { title: name } : {}), facts: value.facts.map((fact, i) => i === index ? { ...fact, data: { ...fact.data, projectName: name } } as CareerFact : fact) });
  }
  return <dialog ref={dialog} className="career-editor-dialog" aria-labelledby="career-editor-title" onCancel={event => { event.preventDefault(); if (!busy) cancel(); }}>
    <section className="career-editor" aria-label="经历录入">
    <div className="career-row career-editor-heading"><div><p className="career-editor-kicker">经历库</p><h3 ref={heading} id="career-editor-title" tabIndex={-1}>{initial ? `编辑与核对 · ${initial.title}` : projectMode ? '添加项目经历' : '记录新经历'}</h3></div><button className="career-button" disabled={busy} onClick={cancel}>关闭</button></div>
    <div className="career-editor-body">
    <p className="career-muted">{simpleProjectEdit ? '直接修改用于简历的项目内容；确认保存后，新内容可用于岗位选材。' : projectMode ? '上传项目介绍或直接填写，实习中参与的项目也可以添加。确认后才能用于岗位选材。' : '原始材料可以先存草稿。整理并核对事实后，才用于岗位选材。'}</p>
    {initial && draft?.input && baseRevision !== expectedRevision && <p className="career-error" role="alert">这份本机编辑草稿基于较早的经历版本。保存时会检查版本冲突，请先核对内容。</p>}
    <fieldset disabled={busy || reading}>
      {projectMode && !initial && <><div className="career-actions" aria-label="项目录入方式">{([['manual', '手动填写'], ['file', '上传文件'], ['repository', '仓库链接']] as const).map(([mode, label]) => <button type="button" className={`career-button ${inputMode === mode ? 'career-primary' : ''}`} aria-pressed={inputMode === mode} key={mode} onClick={() => setInputMode(mode)}>{label}</button>)}</div>{inputMode === 'repository' && <p className="career-source">提供公开仓库链接，读取材料后核对个人贡献。<Link className="career-button" to="/library/project">进入仓库读取与核对</Link></p>}{inputMode === 'file' && <p className="career-muted">下方上传项目文档，先核对读取内容，再选择直接保存或 AI 整理。源码压缩包请使用 <Link to="/library/project">ZIP 上传与核对</Link>。</p>}</>}
      <div hidden={projectMode && !initial && inputMode === 'repository'}>
      {simpleProjectEdit && <section className="project-simple-editor" aria-label="用于简历的项目内容">
        {projectFacts.map(({ fact, index }) => {
          if (!('projectName' in fact.data)) return null;
          const project = fact.data;
          return <div className="project-simple-item" key={fact.id}>
            {projectFacts.length > 1 && <h4>项目 {projectFacts.findIndex(item => item.fact.id === fact.id) + 1}</h4>}
            <label className="career-label">用于简历的项目名称<input maxLength={120} value={project.projectName} onChange={e => updateProjectName(index, project.projectName, e.target.value)} /></label>
            <label className="career-label">项目描述与个人贡献<textarea rows={6} maxLength={4000} value={project.description} onChange={e => updateFact(index, 'description', e.target.value)} placeholder="写下你负责了什么、如何完成，以及可以核实的结果。" /></label>
            <label className="career-label">公司 / 个人角色<input maxLength={4000} value={project.role} onChange={e => updateFact(index, 'role', e.target.value)} placeholder="例如：某公司 · 前端实习生" /></label>
            <div className="project-dates"><label className="career-label">项目开始时间<input value={project.startDate} maxLength={20} onChange={e => updateFact(index, 'startDate', e.target.value)} placeholder="例如 2025-03" /></label><label className="career-label">项目结束时间<input value={project.endDate} disabled={project.isCurrent} maxLength={20} onChange={e => updateFact(index, 'endDate', e.target.value)} placeholder="例如 2025-08" /></label></div>
            <label className="career-check"><input type="checkbox" checked={project.isCurrent} onChange={e => updateFact(index, 'isCurrent', e.target.checked)} />项目进行中</label>
            <details><summary>技术与项目链接</summary><label className="career-label">项目技术（每行一项）<textarea rows={2} value={project.techStack.join('\n')} onChange={e => updateFact(index, 'techStack', e.target.value.split('\n'))} /></label><label className="career-label">项目链接<input value={project.url} maxLength={4000} onChange={e => updateFact(index, 'url', e.target.value)} /></label></details>
          </div>;
        })}
      </section>}
      <details className="project-source-options" open={!simpleProjectEdit}>
      <summary>{simpleProjectEdit ? '查看原始材料' : '项目内容'}</summary>
      {projectMode && (initial || inputMode === 'file') && <label className="career-label">上传项目经历文档（PDF、Word、TXT、Markdown）<input type="file" accept=".pdf,.docx,.txt,.md" disabled={reading} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (!file) return; if ((value.rawText.trim() || value.facts.length) && !window.confirm('读取新文档会替换当前原始记录和已整理的项目内容，其他类型的事实会保留。继续吗？')) return; setReading(true); setError(''); const controller = new AbortController(); fileController.current = controller; void readResumeFile(file, controller.signal, message => { if (alive.current) setFileNotice(message); }).then(result => { if (!alive.current) return; if (result.text.length > 20000) throw new Error('文档文字超过 20000 字，请精简后重新上传。'); patch({ title: value.title || result.name.replace(/\.[^.]+$/, '').slice(0, 120), kind: 'project', rawText: result.text, facts: value.facts.filter(fact => fact.section !== 'projects') }); setFileNotice(result.warning || '文档已在本机读取，请核对内容。'); }).catch(err => { if (alive.current) setError(err instanceof Error ? err.message : '文件读取失败'); }).finally(() => { if (alive.current) setReading(false); }); }} />{fileNotice && <span role="status">{fileNotice}</span>}</label>}
      <label hidden={simpleProjectEdit} className="career-label">{projectMode ? '项目名称' : '名称'}<input maxLength={120} value={value.title} onChange={e => patch({ title: e.target.value })} /></label>
      {!projectMode && <label className="career-label">类型<select value={value.kind} onChange={e => patch({ kind: e.target.value as CareerEntryInput['kind'] })}>{ENTRY_KINDS.map(k => <option key={k} value={k}>{entryLabels[k]}</option>)}</select></label>}
      <label className="career-label">{projectMode && !simpleProjectEdit ? '项目描述与个人贡献' : '原始记录'}<textarea rows={4} maxLength={20000} value={value.rawText} onChange={e => patch({ rawText: e.target.value })} placeholder="记下你做过的事，结果不完整也可以先保存。" /></label>
      {projectMode && !simpleProjectEdit && <div className="career-source project-quick-fields"><label className="career-label">公司 / 团队（可选）<input maxLength={200} value={value.details.organization} onChange={e => detail('organization', e.target.value)} placeholder="实习项目可填写公司名称" /></label><label className="career-label">你的角色（可选）<input maxLength={200} value={value.details.role} onChange={e => detail('role', e.target.value)} /></label><div className="project-dates"><label className="career-label">开始时间<input type="month" value={value.details.startDate} onChange={e => detail('startDate', e.target.value)} /></label><label className="career-label">结束时间<input type="month" value={value.details.endDate} onChange={e => detail('endDate', e.target.value)} /></label></div></div>}
      <div className="career-actions"><button hidden={projectMode} className="career-button" onClick={() => setFull(!full)}>{full ? '收起完整填写' : '完整填写'}</button>
        <button className="career-button" disabled={!value.title.trim() || !value.rawText.trim()} onClick={() => void action(async () => {
          const result = await extract(value, baseRevision); if (alive.current) { setBaseRevision(result.revision); if (result.error) { setError(result.error); return; } const facts = projectMode ? result.facts.filter(f => f.section === 'projects') : result.facts; if (!facts.length) { setError('原文已保存，但未提取到项目经历；请补充项目内容或手动整理。'); return; } patch({ facts: projectMode ? replaceProjectFacts(value.facts, facts) : facts }); }
        })}>保存原文并用 AI 提取</button></div>
      {full && !projectMode && <div className="career-source">
        {(['organization', 'role', 'startDate', 'endDate', 'action', 'method', 'outcome', 'award', 'awardLevel', 'url'] as const).map(name => <label className="career-label" key={name}>{({ organization: '组织 / 学校 / 颁发方', role: '实际角色 / 专业', startDate: '开始时间', endDate: '结束时间（可留空）', action: '个人具体行动', method: '使用的方法或工具', outcome: '交付物与已知成果', award: '奖项名称（可选）', awardLevel: '奖项级别（可选）', url: '成果链接（可选）' })[name]}
          {['action', 'method', 'outcome'].includes(name) ? <textarea rows={2} maxLength={name === 'action' ? 4000 : 2000} value={value.details[name]} onChange={e => detail(name, e.target.value)} /> : <input type={name.endsWith('Date') ? 'month' : name === 'url' ? 'url' : 'text'} maxLength={name === 'url' ? 2000 : 200} value={value.details[name]} onChange={e => detail(name, e.target.value)} />}</label>)}
        <button className="career-button" disabled={!value.title.trim()} onClick={() => void action(async () => patch({ facts: projectMode ? replaceProjectFacts(value.facts, factsFromDetails({ ...value, kind: 'project' })) : factsFromDetails(value) }))}>将完整填写整理为事实</button>
      </div>}
      <label className="career-label">哪些内容不能夸大<textarea rows={2} maxLength={1200} value={value.doNotClaim} onChange={e => patch({ doNotClaim: e.target.value })} placeholder="例如：仅参与页面开发，不能写成主导整个项目。" /></label>
      {!!value.facts.length && <details><summary>对照与替换项目描述</summary><div className="career-source"><h4>核对项目内容</h4>{projectMode && <p className="career-muted">修改原始记录不会自动改写已整理的项目内容；请在下方同步修改，或重新整理事实。</p>}<p className="career-muted">检查名称、日期与个人贡献；技能程度必须由你确认。取消的事实不会用于选材。</p>
        {value.facts.map((fact, index) => projectMode && fact.section !== 'projects' ? null : <article className="career-fact" key={fact.id}><div className="career-row"><strong>{careerLabels[fact.section]}</strong><button className="career-button" onClick={() => patch({ facts: value.facts.filter((_, i) => i !== index) })}>移除此事实</button></div>
          {projectMode && fact.section === 'projects' && <><p className="career-muted">项目描述才会用于岗位选材；可直接编辑下方描述，也可用原始记录替换。</p><button type="button" className="career-button" disabled={!value.rawText.trim() || value.rawText.length > 4000} onClick={() => setDescriptionPreview(fact.id)}>对比并使用原始记录</button>{descriptionPreview === fact.id && <section className="career-diff project-description-preview" aria-label="项目描述对比"><div><strong>当前项目描述</strong><p>{'description' in fact.data ? fact.data.description : ''}</p></div><div><strong>将替换为原始记录</strong><p>{value.rawText}</p></div><div className="career-actions"><button type="button" className="career-button career-primary" onClick={() => { updateFact(index, 'description', value.rawText); setDescriptionPreview(null); }}>确认替换项目描述</button><button type="button" className="career-button" onClick={() => setDescriptionPreview(null)}>保留当前描述</button></div></section>}</>}
          {Object.entries(fact.data).filter(([field]) => field !== 'id' && !projectMode).map(([field, content]) => <label className="career-label" key={field}>{careerLabels[field] || field}
            {typeof content === 'boolean' ? <input type="checkbox" checked={content} onChange={e => updateFact(index, field, e.target.checked)} /> : field === 'level' && fact.section === 'skills' ? <select value={String(content)} onChange={e => updateFact(index, field, e.target.value)}><option value="">请选择实际程度</option>{['了解', '掌握', '熟练', '精通'].map(v => <option key={v}>{v}</option>)}</select> : <textarea rows={field === 'description' ? 3 : 1} maxLength={4000} value={Array.isArray(content) ? content.join('\n') : String(content)} onChange={e => updateFact(index, field, Array.isArray(content) ? e.target.value.split('\n').filter(Boolean) : e.target.value)} />}</label>)}
        </article>)}
      </div></details>}
      </details>
      {(error || storageError) && <p className="career-error" role="alert">{error || storageError}</p>}
      <p className="career-muted">编辑内容自动暂存在本机，关闭后可继续编辑；“保存草稿”后将成为经历条目，登录后{import.meta.env.DEV && import.meta.env.VITE_CAREER_STORAGE === 'local' ? '同步到本地后端' : '上传云端'}。</p>
      {projectMode && !value.facts.some(fact => fact.section === 'projects') && <p className="career-muted">直接确认会将原始记录作为项目描述（最多 4000 字）；较长材料可先整理事实或保存草稿。</p>}
      <div className="career-actions career-editor-footer"><button className="career-button" disabled={!value.title.trim() || busy} onClick={() => void action(async () => { await save({ ...value, status: 'draft' }, false, baseRevision); localStorage.removeItem(key); })}>保存草稿</button>
        <button className="career-button career-primary" disabled={!value.title.trim() || (projectMode ? !value.facts.some(fact => fact.section === 'projects') && (!value.rawText.trim() || value.rawText.length > 4000) : !value.facts.length) || value.facts.some(f => f.section === 'skills' && !('level' in f.data && f.data.level)) || busy || reading} onClick={() => void action(async () => { const facts = value.facts.some(fact => fact.section === 'projects') || !projectMode && value.facts.length ? value.facts : replaceProjectFacts(value.facts, factsFromDetails({ ...value, kind: 'project', details: { ...value.details, role: [value.details.organization, value.details.role].filter(Boolean).join(' · '), action: value.rawText } })); await save({ ...value, facts, status: 'confirmed' }, true, baseRevision); localStorage.removeItem(key); })}>确认保存项目</button></div>
      </div>
    </fieldset>
    </div></section>
  </dialog>;
}
