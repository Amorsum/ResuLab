import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AppHeader from '../components/layout/AppHeader';
import { ReadableCareerFields } from '../components/library/CareerApplicationPreview';
import { useCloudResumes } from '../hooks/useCloudResumes';
import { useAuth } from '../hooks/useAuth';
import { useResume } from '../hooks/useResume';
import { createEmptyResume } from '../constants/defaultResume';
import { identifyResume, forkResume, persistResumeDocument, readResumeDocuments, mutateResumeDocument, type ResumeDocumentRecord } from '../utils/resumeDocuments';
import { readLibrary, cleanLibraryResume, type LibraryDraft } from '../utils/careerLibrary';
import { stableCareerId, careerRequest } from '../utils/careerStore';
import type { CloudResumeMeta, ResumeData } from '../types/resume';
import { resumeDocumentMetaSchema } from '../../shared/resumeDocument';
import './project-workspace.css';
import { exportDocumentBackup, parseDocumentBackup, type DocumentBackupRow } from '../utils/resumeDocumentBackup';

export default function ResumeDocumentsPage() {
  const { user, session } = useAuth(), owner = user?.id || 'local-guest';
  const { resume, loadResume, persistCurrent, acceptDocumentRevision, setDocumentMeta, saveCurrentCopy } = useResume();
  const { listResumes, fetchCloudResume, saveResume } = useCloudResumes(), navigate = useNavigate();
  const [records, setRecords] = useState<ResumeDocumentRecord[]>([]), [cloud, setCloud] = useState<CloudResumeMeta[]>([]), [backups, setBackups] = useState<LibraryDraft[]>([]), [backend, setBackend] = useState<{ id: string; title: string; updatedAt: string; documentMeta?: ResumeData['documentMeta'] }[]>([]);
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false), [archived, setArchived] = useState(false), [query, setQuery] = useState('');
  const [comparison, setComparison] = useState<{ local?: ResumeData; remote: ResumeData } | null>(null);
  const [importPreview, setImportPreview] = useState<DocumentBackupRow[] | null>(null);
  const scope = useRef(owner); scope.current = owner; const lock = useRef(false);
  const localBackend = import.meta.env.DEV && import.meta.env.VITE_CAREER_STORAGE === 'local';
  async function refresh(save = false) {
    const expected = owner;
    if (save) await persistCurrent();
    const legacy = await readLibrary(owner);
    for (const draft of legacy.drafts.filter(d => d.kind !== 'editor-backup')) {
      const id = draft.resume.documentMeta?.id || await stableCareerId(`resume-document:${owner}:${draft.id}`);
      if ((await readResumeDocuments(owner)).some(r => r.id === id)) continue;
      const next = cleanLibraryResume(draft.resume); if (!next.documentMeta) next.documentMeta = { id, title: draft.title, kind: 'unclassified' };
      await persistResumeDocument(owner, next, 0);
    }
    const rows = await readResumeDocuments(owner); if (scope.current !== expected) return; setRecords(rows); setBackups(legacy.drafts.filter(d => d.kind === 'editor-backup'));
    if (user) {
      try { const list = await listResumes(); if (scope.current === expected) setCloud(list); } catch { if (scope.current === expected) setNotice('云端列表暂不可用，本机简历仍可使用。'); }
      if (localBackend && session) try { const list = await careerRequest<typeof backend>(session.access_token, '/versions'); if (scope.current === expected) setBackend(list); } catch { if (scope.current === expected) setNotice('本地后端岗位版本暂时无法读取，本机副本仍保留。'); }
    }
  }
  useEffect(() => { setRecords([]); setCloud([]); setBackend([]); setComparison(null); void refresh(true).catch(e => { if (scope.current === owner) setError(e.message); }); }, [owner]);
  async function action(work: () => Promise<void>) { if (lock.current) return; lock.current = true; setBusy(true); setError(''); const expected = owner; try { await work(); if (scope.current === expected) await refresh(); } catch (e) { if (scope.current === expected) setError(e instanceof Error ? e.message : '操作失败'); } finally { lock.current = false; if (scope.current === expected) setBusy(false); } }
  async function open(next: ResumeData) { await loadResume(next); if (scope.current === owner) navigate('/builder'); }
  async function mutate(row: ResumeDocumentRecord, edit: (row: ResumeDocumentRecord) => ResumeDocumentRecord) {
    const next = await mutateResumeDocument(owner, row.id, row.revision, old => { if (!old) throw new Error('简历已变化，请刷新'); return edit(old); });
    if (scope.current !== owner) return;
    acceptDocumentRevision(next.id, next.revision); if (resume.documentMeta?.id === next.id) setDocumentMeta(next.resume.documentMeta!);
  }
  const visible = records.filter(r => r.archived === archived && (!query || (r.resume.documentMeta!.title + (r.resume.documentMeta!.targetJob || '')).toLowerCase().includes(query.toLowerCase())));
  const bases = records.filter(r => r.resume.documentMeta?.kind === 'base');
  const remoteOnly = cloud.filter(c => !records.some(r => r.resume._cloudId === c.id));
  const external = [
    ...remoteOnly.map(r => ({ source: 'cloud' as const, id: r.id, title: r.title, updatedAt: r.updated_at, documentMeta: r.documentMeta })),
    ...backend.filter(r => !records.some(local => local.id === r.documentMeta?.id || local.id === r.id)).map(r => { const meta = resumeDocumentMetaSchema.safeParse(r.documentMeta); return { ...r, source: 'backend' as const, documentMeta: meta.success ? meta.data : undefined }; }),
  ];
  const externalVisible = archived ? [] : external.filter(r => !query || r.title.toLowerCase().includes(query.toLowerCase()));
  const rootIds = [...new Set([...visible.map(r => r.resume.documentMeta?.baseId || r.id), ...externalVisible.map(r => r.documentMeta?.baseId || r.documentMeta?.id || r.id)])];
  const titles = new Map([...records.map(r => [r.id, r.resume.documentMeta!.title] as const), ...external.map(r => [r.documentMeta?.id || r.id, r.title] as const)]);
  const externalCard = (r: typeof external[number]) => <article className="career-row career-source" key={`${r.source}:${r.id}`}><div><h3>{r.title}</h3><p className="career-muted">{r.documentMeta?.kind === 'base' ? '基础简历' : r.documentMeta?.kind === 'job' ? '岗位副本' : '未分类'} · {r.source === 'cloud' ? '保存在云端，尚未在本机打开' : '保存在本地后端，仅此电脑'} · {new Date(r.updatedAt).toLocaleString('zh-CN')}</p></div><button className="career-button" disabled={busy} onClick={() => void action(async () => { if (r.source === 'cloud') { const remote = await fetchCloudResume(r.id); if (scope.current === owner) setComparison({ remote }); } else { const value = await careerRequest<{ resume: unknown }>(session!.access_token, `/versions/${r.id}`); const next = cleanLibraryResume(value.resume); if (!next.documentMeta) next.documentMeta = { id: r.id, title: r.title, kind: 'unclassified' }; await open(next); } })}>核对并打开</button></article>;
  const card = (row: ResumeDocumentRecord) => <article className="career-source" key={row.id}>
    <div className="career-row"><div><h3>{row.resume.documentMeta!.title}</h3><p className="career-muted">{row.resume.documentMeta!.kind === 'base' ? '基础简历' : row.resume.documentMeta!.kind === 'job' ? '岗位副本' : '未分类'} · {row.resume._cloudId ? '本机已保存 · 已关联云端（手动同步）' : '本机已保存'} · {new Date(row.updatedAt).toLocaleString('zh-CN')}</p></div><button className="career-button career-primary" disabled={busy} onClick={() => void action(() => open(row.resume))}>打开编辑</button></div>
    <details><summary>名称与归组</summary><label className="career-label">名称<input aria-label={`名称：${row.id}`} maxLength={120} defaultValue={row.resume.documentMeta!.title} onBlur={e => { const title = e.target.value.trim(); if (title && title !== row.resume.documentMeta!.title) void action(() => mutate(row, r => ({ ...r, resume: { ...r.resume, documentMeta: { ...r.resume.documentMeta!, title } } }))); }} /></label>
    <label className="career-label">归组<select value={row.resume.documentMeta!.kind === 'job' ? row.resume.documentMeta!.baseId || 'unclassified' : row.resume.documentMeta!.kind} disabled={busy} onChange={e => { const value = e.target.value; void action(() => mutate(row, r => ({ ...r, resume: { ...r.resume, documentMeta: { ...r.resume.documentMeta!, kind: value === 'base' ? 'base' : value === 'unclassified' ? 'unclassified' : 'job', baseId: value === 'base' || value === 'unclassified' ? undefined : value } } }))); }}><option value="unclassified">未分类</option><option value="base">基础简历</option>{row.resume.documentMeta!.baseId && !bases.some(r => r.id === row.resume.documentMeta!.baseId) && <option value={row.resume.documentMeta!.baseId}>基础简历暂未在本机打开</option>}{bases.filter(r => r.id !== row.id).map(r => <option key={r.id} value={r.id}>岗位副本 → {r.resume.documentMeta!.title}</option>)}</select></label></details>
    <div className="career-actions"><button className="career-button" disabled={busy} onClick={() => void action(async () => { const next = forkResume(row.resume, row.resume.documentMeta!.title + ' · 副本', row.resume.documentMeta!.kind === 'base' ? 'job' : row.resume.documentMeta!.kind); await persistResumeDocument(owner, next, 0); setNotice('已创建独立副本，原简历保持原样。'); })}>复制</button><button className="career-button" disabled={busy} onClick={() => void action(() => mutate(row, r => ({ ...r, archived: !r.archived })))}>{archived ? '恢复' : '归档'}</button>{user && row.resume._cloudId && <button className="career-button" disabled={busy} onClick={() => void action(async () => { const remote = await fetchCloudResume(row.resume._cloudId!); if (scope.current === owner) setComparison({ local: row.resume, remote }); })}>对照云端</button>}</div>
    <details><summary>历史记录（{row.history.length}）</summary>{!row.history.length && <p>切换或恢复前会保留检查点，普通保存不会不断增加历史。</p>}{row.history.map(item => <div className="career-row" key={item.id}><span>{item.title} · {new Date(item.createdAt).toLocaleString('zh-CN')}</span><button className="career-button" disabled={busy} onClick={() => void action(async () => { await loadResume({ ...item.resume, documentMeta: row.resume.documentMeta, _cloudId: row.resume._cloudId, _cloudUpdatedAt: row.resume._cloudUpdatedAt }); setNotice('恢复前已保存当前稿，已打开历史内容。'); navigate('/builder'); })}>恢复并打开</button></div>)}</details>
  </article>;
  return <div className="career-page"><AppHeader /><main className="career-container"><div className="career-heading"><div><h1>我的简历</h1><p>基础简历和岗位副本集中管理。本机自动保存，云端手动同步。</p></div><button className="career-button career-primary" disabled={busy} onClick={() => void action(async () => { const next = identifyResume(createEmptyResume(), 'base'); next.documentMeta!.title = '新的基础简历'; await open(next); })}>新建基础简历</button></div>
    <div className="career-actions"><Link className="career-button" to="/builder">继续编辑当前稿</Link><button className="career-button" disabled={busy} onClick={() => void action(async () => { await saveCurrentCopy((resume.documentMeta?.title || '当前稿') + ' · 保留副本'); setNotice('当前稿已独立保存。'); })}>另存当前稿副本</button><button className="career-button" disabled={busy} onClick={() => void action(() => refresh(true))}>刷新列表</button>{user ? <button className="career-button" disabled={busy} onClick={() => void action(async () => { await saveResume(); setNotice('当前稿已手动同步到云端。'); })}>当前稿同步云端</button> : <Link to="/login?redirect=/my-resumes">登录后可同步云端</Link>}</div>
    {error && <p role="alert" className="career-error">{error}</p>}{notice && <p role="status" className="career-notice">{notice}</p>}
    <div className="career-actions"><button className="career-button" disabled={busy} onClick={() => void action(async () => { await persistCurrent(); const text = exportDocumentBackup(await readResumeDocuments(owner)); const url = URL.createObjectURL(new Blob([text], { type: 'application/json' })); const link = document.createElement('a'); link.href = url; link.download = 'ResuLab-简历文档备份.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); })}>导出简历备份</button><label className="career-label">导入简历备份<input type="file" accept=".json,application/json" disabled={busy} onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) void action(async () => { if (file.size > 20000000) throw new Error('备份超过 20 MB'); const preview = parseDocumentBackup(await file.text()); if (scope.current === owner) setImportPreview(preview); }); }} /></label></div>
    {importPreview && <section className="career-panel"><h2>备份导入预览</h2><p>将恢复 {importPreview.length} 份独立简历，保留基础/岗位归组及历史；不会覆盖现有简历，也不会自动关联云端。</p><ul>{importPreview.map(row => <li key={row.resume.documentMeta!.id}>{row.resume.documentMeta!.title}</li>)}</ul><div className="career-actions"><button className="career-button career-primary" disabled={busy} onClick={() => void action(async () => { for (const row of importPreview) { if (scope.current !== owner) return; const id = row.resume.documentMeta!.id; if ((await readResumeDocuments(owner)).some(r => r.id === id)) continue; await mutateResumeDocument(owner, id, 0, () => ({ ownerId: owner, id, revision: 0, resume: row.resume, archived: row.archived, history: row.history, updatedAt: Date.now() })); } setImportPreview(null); setNotice('备份已恢复为独立简历。'); })}>确认导入</button><button className="career-button" onClick={() => setImportPreview(null)}>取消</button></div></section>}
    <label className="career-label">搜索简历<input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="名称或岗位" /></label><label className="career-check"><input type="checkbox" checked={archived} onChange={e => setArchived(e.target.checked)} />查看已归档</label>
    {!rootIds.length && <p className="career-empty">没有符合条件的简历。可新建基础简历或调整搜索条件。</p>}
    {rootIds.map(root => <section className="career-panel" key={root}><h2>{titles.get(root) || '基础简历尚未在本机打开'}</h2>{visible.filter(r => (r.resume.documentMeta!.baseId || r.id) === root).sort((a, b) => Number(a.id !== root) - Number(b.id !== root)).map(card)}{externalVisible.filter(r => (r.documentMeta?.baseId || r.documentMeta?.id || r.id) === root).map(externalCard)}</section>)}
    {backups.length > 0 && <details className="career-panel"><summary>旧版自动备份（{backups.length}）</summary>{backups.map(b => <article className="career-row" key={b.id}><span>{b.title}</span><button className="career-button" disabled={busy} onClick={() => void action(() => open(forkResume(b.resume, b.title, 'unclassified')))}>恢复为独立副本</button></article>)}</details>}
    {comparison && <section className="career-panel" aria-label="云端内容对照"><h2>核对云端内容</h2><div className="project-comparison">{[comparison.local, comparison.remote].map((value, i) => <div key={i}><h3>{i === 0 ? '本机内容' : '云端内容'}</h3>{value ? <><ReadableCareerFields value={value.personalInfo} />{[...value.education, ...value.workExperience, ...value.projects, ...value.skills, ...value.certificates, ...value.languages].map(item => <ReadableCareerFields key={item.id} value={item} />)}<p>{value.selfEvaluation}</p></> : <p>此份简历尚未在本机打开。</p>}</div>)}</div><div className="career-actions"><button className="career-button career-primary" disabled={busy} onClick={() => void action(() => open(comparison.remote))}>保存当前稿并打开云端</button>{comparison.local && <button className="career-button" disabled={busy} onClick={() => void action(async () => { await persistResumeDocument(owner, forkResume(comparison.local!, comparison.local!.documentMeta!.title + ' · 冲突副本', 'unclassified'), 0); setNotice('本机内容已另存独立副本，可继续打开云端核对。'); })}>本机内容另存副本</button>}<button className="career-button" onClick={() => setComparison(null)}>关闭对照</button></div></section>}
  </main></div>;
}
