import { useEffect, useRef, useState } from 'react';
import { ENTRY_KINDS, type CareerEntryInput } from '../../../shared/careerEntries';
import { careerLabels } from './LibraryFacts';
import { entryLabels, factsFromDetails } from '../../utils/careerEntryForm';
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
  const [full, setFull] = useState(Boolean(initial?.facts.length)), [error, setError] = useState(''), [storageError, setStorageError] = useState('');
  const [reading, setReading] = useState(false), [fileNotice, setFileNotice] = useState('');
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
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
  return <dialog ref={dialog} className="career-editor-dialog" aria-labelledby="career-editor-title" onCancel={event => { event.preventDefault(); if (!busy) cancel(); }}>
    <section className="career-editor" aria-label="经历录入">
    <div className="career-row career-editor-heading"><div><p className="career-editor-kicker">经历库</p><h3 ref={heading} id="career-editor-title" tabIndex={-1}>{initial ? `编辑与核对 · ${initial.title}` : projectMode ? '添加项目经历' : '记录新经历'}</h3></div><button className="career-button" disabled={busy} onClick={cancel}>关闭</button></div>
    <div className="career-editor-body">
    <p className="career-muted">{projectMode ? '上传项目介绍或直接填写，实习中参与的项目也可以添加。确认后才能用于岗位选材。' : '原始材料可以先存草稿。整理并核对事实后，才用于岗位选材。'}</p>
    {initial && draft?.input && baseRevision !== expectedRevision && <p className="career-error" role="alert">这份本机编辑草稿基于较早的经历版本。保存时会检查版本冲突，请先核对内容。</p>}
    <fieldset disabled={busy}>
      {projectMode && <label className="career-label">上传项目经历文档（PDF、Word、TXT、Markdown）<input type="file" accept=".pdf,.docx,.txt,.md" disabled={reading} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (!file) return; if ((value.rawText.trim() || value.facts.length) && !window.confirm('读取新文档会替换当前原始记录和已整理的事实，继续吗？')) return; setReading(true); setError(''); void readResumeFile(file, new AbortController().signal, setFileNotice).then(result => { if (result.text.length > 20000) throw new Error('文档文字超过 20000 字，请精简后重新上传。'); patch({ title: value.title || result.name.replace(/\.[^.]+$/, '').slice(0, 120), kind: 'project', rawText: result.text, facts: [] }); setFileNotice(result.warning || '文档已在本机读取，请核对内容。'); }).catch(err => setError(err instanceof Error ? err.message : '文件读取失败')).finally(() => setReading(false)); }} />{fileNotice && <span role="status">{fileNotice}</span>}</label>}
      <label className="career-label">{projectMode ? '项目名称' : '名称'}<input maxLength={120} value={value.title} onChange={e => patch({ title: e.target.value })} /></label>
      {!projectMode && <label className="career-label">类型<select value={value.kind} onChange={e => patch({ kind: e.target.value as CareerEntryInput['kind'] })}>{ENTRY_KINDS.map(k => <option key={k} value={k}>{entryLabels[k]}</option>)}</select></label>}
      <label className="career-label">原始记录<textarea rows={4} maxLength={20000} value={value.rawText} onChange={e => patch({ rawText: e.target.value })} placeholder="记下你做过的事，结果不完整也可以先保存。" /></label>
      {projectMode && <div className="career-source project-quick-fields"><label className="career-label">公司 / 团队（可选）<input maxLength={200} value={value.details.organization} onChange={e => detail('organization', e.target.value)} placeholder="实习项目可填写公司名称" /></label><label className="career-label">你的角色（可选）<input maxLength={200} value={value.details.role} onChange={e => detail('role', e.target.value)} /></label><div className="project-dates"><label className="career-label">开始时间<input type="month" value={value.details.startDate} onChange={e => detail('startDate', e.target.value)} /></label><label className="career-label">结束时间<input type="month" value={value.details.endDate} onChange={e => detail('endDate', e.target.value)} /></label></div></div>}
      <div className="career-actions"><button className="career-button" onClick={() => setFull(!full)}>{full ? '收起完整填写' : '完整填写'}</button>
        <button className="career-button" disabled={!value.title.trim() || !value.rawText.trim()} onClick={() => void action(async () => {
          const result = await extract(value, baseRevision); if (alive.current) { setBaseRevision(result.revision); if (result.error) { setError(result.error); return; } const facts = projectMode ? result.facts.filter(f => f.section === 'projects') : result.facts; if (!facts.length) { setError('原文已保存，但未提取到项目经历；请补充项目内容或手动整理。'); return; } patch({ facts }); }
        })}>保存原文并用 AI 提取</button></div>
      {full && <div className="career-source">
        {(['organization', 'role', 'startDate', 'endDate', 'action', 'method', 'outcome', 'award', 'awardLevel', 'url'] as const).map(name => <label className="career-label" key={name}>{({ organization: '组织 / 学校 / 颁发方', role: '实际角色 / 专业', startDate: '开始时间', endDate: '结束时间（可留空）', action: '个人具体行动', method: '使用的方法或工具', outcome: '交付物与已知成果', award: '奖项名称（可选）', awardLevel: '奖项级别（可选）', url: '成果链接（可选）' })[name]}
          {['action', 'method', 'outcome'].includes(name) ? <textarea rows={2} maxLength={name === 'action' ? 4000 : 2000} value={value.details[name]} onChange={e => detail(name, e.target.value)} /> : <input type={name.endsWith('Date') ? 'month' : name === 'url' ? 'url' : 'text'} maxLength={name === 'url' ? 2000 : 200} value={value.details[name]} onChange={e => detail(name, e.target.value)} />}</label>)}
        <button className="career-button" disabled={!value.title.trim()} onClick={() => void action(async () => patch({ facts: factsFromDetails(value) }))}>将完整填写整理为事实</button>
      </div>}
      <label className="career-label">事实限制<textarea rows={2} maxLength={1200} value={value.doNotClaim} onChange={e => patch({ doNotClaim: e.target.value })} placeholder="例如：仅参与页面开发，不能写成主导整个项目。" /></label>
      {!!value.facts.length && <div className="career-source"><h4>核对结构化事实</h4>{projectMode && <p className="career-muted">修改原始记录不会自动改写已整理的项目内容；请在下方同步修改，或重新整理事实。</p>}<p className="career-muted">检查名称、日期与个人贡献；技能程度必须由你确认。取消的事实不会用于选材。</p>
        {value.facts.map((fact, index) => <article className="career-fact" key={fact.id}><div className="career-row"><strong>{careerLabels[fact.section]}</strong><button className="career-button" onClick={() => patch({ facts: value.facts.filter((_, i) => i !== index) })}>移除此事实</button></div>
          {Object.entries(fact.data).filter(([field]) => field !== 'id').map(([field, content]) => <label className="career-label" key={field}>{careerLabels[field] || field}
            {typeof content === 'boolean' ? <input type="checkbox" checked={content} onChange={e => updateFact(index, field, e.target.checked)} /> : field === 'level' && fact.section === 'skills' ? <select value={String(content)} onChange={e => updateFact(index, field, e.target.value)}><option value="">请选择实际程度</option>{['了解', '掌握', '熟练', '精通'].map(v => <option key={v}>{v}</option>)}</select> : <textarea rows={field === 'description' ? 3 : 1} maxLength={4000} value={Array.isArray(content) ? content.join('\n') : String(content)} onChange={e => updateFact(index, field, Array.isArray(content) ? e.target.value.split('\n').filter(Boolean) : e.target.value)} />}</label>)}
        </article>)}
      </div>}
      {(error || storageError) && <p className="career-error" role="alert">{error || storageError}</p>}
      <p className="career-muted">编辑内容自动暂存在本机，关闭后可继续编辑；“保存草稿”后将成为经历条目，登录后{import.meta.env.DEV && import.meta.env.VITE_CAREER_STORAGE === 'local' ? '同步到本地后端' : '上传云端'}。</p>
      {projectMode && !value.facts.length && <p className="career-muted">直接确认会将原始记录作为项目描述（最多 4000 字）；较长材料可先整理事实或保存草稿。</p>}
      <div className="career-actions career-editor-footer"><button className="career-button" disabled={!value.title.trim() || busy} onClick={() => void action(async () => { await save({ ...value, status: 'draft' }, false, baseRevision); localStorage.removeItem(key); })}>保存草稿</button>
        <button className="career-button career-primary" disabled={!value.title.trim() || (!value.facts.length && (!projectMode || !value.rawText.trim() || value.rawText.length > 4000)) || value.facts.some(f => f.section === 'skills' && !('level' in f.data && f.data.level)) || busy || reading} onClick={() => void action(async () => { const facts = value.facts.length ? value.facts : factsFromDetails({ ...value, kind: 'project', details: { ...value.details, role: [value.details.organization, value.details.role].filter(Boolean).join(' · '), action: value.rawText } }); await save({ ...value, facts, status: 'confirmed' }, true, baseRevision); localStorage.removeItem(key); })}>我已核对事实，确认保存</button></div>
    </fieldset>
    </div></section>
  </dialog>;
}
