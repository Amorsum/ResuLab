import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AppHeader from '../components/layout/AppHeader';
import { CareerEntryEditor } from '../components/library/CareerEntryEditor';
import { CareerModelStatus } from '../components/library/CareerModelStatus';
import { careerLabels, factTitle } from '../components/library/LibraryFacts';
import { useAuth } from '../hooks/useAuth';
import { useResume } from '../hooks/useResume';
import { useAI } from '../hooks/useAI';
import { useCareerRun } from '../hooks/useCareerRun';
import { CAREER_SECTIONS, parseCareerFact, type CareerFact } from '../../shared/career';
import { entryFacts, entryInputSchema, selectionFacts, type CareerEntryInput, type CareerEntry, type CareerSelectionPlan, type CareerApplicationPlan } from '../../shared/careerEntries';
import { careerRequest, readCareerWorkspace, refreshCareerWorkspace, saveCareerEntry, syncCareerWorkspace, emptyCareerWorkspace, blankCareerEntry, entryInput, splitLegacyLibrary, exportCareerBackup, parseCareerBackup, stableCareerId, mutateCareerWorkspace, type CareerWorkspace } from '../utils/careerStore';
import { readLibrary, updateLibrary, libraryOwner, parseLibraryBackup, cleanLibraryResume, type LibraryDraft, type CareerLibrary } from '../utils/careerLibrary';
import { createEmptyResume } from '../constants/defaultResume';
import { prepareAIImport, applyAIImport } from '../utils/aiImport';
import { applyCareerApplication, prepareCareerApplication, careerVersion } from '../utils/careerApplication';
import { entryLabels } from '../utils/careerEntryForm';
import { verifyCareerResult } from '../../shared/careerComposer';
import { jobTarget } from '../../shared/targetJob';
import { supabase } from '../lib/supabase';
import './career-library.css';
import { ReadableCareerFields } from '../components/library/CareerApplicationPreview';
import type { ProjectSession } from '../../shared/project';
const localBackend = import.meta.env.DEV && import.meta.env.VITE_CAREER_STORAGE === 'local';

const emptySelection = (): CareerSelectionPlan => ({ selectedIds: [], lockedIds: [], excludedIds: [] });
const errorText = (e: unknown) => e instanceof Error ? e.message : '操作失败，本机材料已保留';
export default function CareerWorkspacePage() {
  const { user, session } = useAuth(), { resume, loadResume, applyCareer, undo, canUndo } = useResume(), { extractLibraryFacts } = useAI();
  const ownerId = libraryOwner(user?.id), token = session?.access_token, navigate = useNavigate();
  const live = useRef({ ownerId, token, resume }); live.current = { ownerId, token, resume };
  const [deletedMaterials, setDeletedMaterials] = useState<string[]>([]);
  useEffect(() => { let disposed = false; setDeletedMaterials([]); if (token) void careerRequest<ProjectSession[]>(token, '/projects/sessions').then(rows => { if (!disposed) setDeletedMaterials(rows.filter(s => s.materialDeleted).map(s => s.materialId)); }).catch(() => {}); return () => { disposed = true; }; }, [ownerId, token]);
  const epoch = useRef(0), working = useRef(false);
  const editorRevision = useRef({ id: '', revision: 0 });
  const editorTrigger = useRef<HTMLButtonElement | null>(null);
  const selectionRun = useRef<string>();
  const [workspace, setWorkspace] = useState<CareerWorkspace>(() => emptyCareerWorkspace(ownerId));
  const [ready, setReady] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [editing, setEditing] = useState<CareerEntryInput | null>(null), [editorOpen, setEditorOpen] = useState(false), [editorKey, setEditorKey] = useState(0);
  const [editorDraftScope, setEditorDraftScope] = useState('');
  const [query, setQuery] = useState(''), [filter, setFilter] = useState(''), [archived, setArchived] = useState(false);
  const [recommendScope, setRecommendScope] = useState<'all' | 'filtered' | 'selected'>('all');
  const [modelReady, setModelReady] = useState<boolean | null>(null);
  const [target, setTarget] = useState({ mode: 'role' as 'role' | 'jd', text: '' }), [selection, setSelection] = useState<CareerSelectionPlan>(emptySelection);
  const [application, setApplication] = useState<CareerApplicationPlan | null>(null), [versions, setVersions] = useState<LibraryDraft[]>([]);
  const [migration, setMigration] = useState<{ source: 'resume' | 'legacy' | 'guest' | 'backup'; entries: CareerEntryInput[]; drafts: LibraryDraft[] } | null>(null);
  const migrationPreviewRef = useRef<HTMLElement | null>(null);
  const [tasks, setTasks] = useState<{ runId: string; status: string; target: { text: string }; phase: string }[]>([]);
  const [backendVersions, setBackendVersions] = useState<{ id: string; title: string; updatedAt: string }[]>([]);
  const [history, setHistory] = useState<{ id: string; entries: CareerEntry[] } | null>(null);
  const [accepted, setAccepted] = useState<string[]>([]), [summary, setSummary] = useState(false), [reviewedResult, setReviewedResult] = useState(false);
  const [supplementEntry, setSupplementEntry] = useState(''), [supplementText, setSupplementText] = useState('');
  const { run, error: runError, command, restore } = useCareerRun(ownerId, token);
  const active = workspace.ownerId === ownerId && ready;
  const lock = busy || !active;
  const data = active ? workspace : emptyCareerWorkspace(ownerId);
  const projectEntries = data.entries.filter(e => e.kind === 'project' || e.facts.some(f => f.section === 'projects'));
  const confirmed = projectEntries.filter(e => e.status === 'confirmed' && e.facts.some(f => f.section === 'projects'));
  const facts = entryFacts(confirmed).filter(f => f.section === 'projects');
  const selectionFactsSafe = () => { const selected = selectionFacts(confirmed, selection); if (selected.some(f => f.section !== 'projects')) throw new Error('当前选材包含旧的非项目经历，请清空后重新选择项目。'); return selected; };
  const [step, setStep] = useState<'projects' | 'target'>(() => window.location.hash === '#target' ? 'target' : 'projects');
  useEffect(() => { const sync = () => { if (window.location.hash === '#target') setStep('target'); }; window.addEventListener('hashchange', sync); return () => window.removeEventListener('hashchange', sync); }, []);
  async function reloadVersions() { const value = await readLibrary(ownerId); if (live.current.ownerId === ownerId) setVersions(value.drafts); }
  useEffect(() => {
    const current = ++epoch.current; working.current = false; setReady(false); setBusy(false); setError(''); setNotice(''); setApplication(null); setMigration(null); setEditorOpen(false); setEditing(null); setTasks([]); setVersions([]); setBackendVersions([]); setHistory(null); setSelection(emptySelection()); setTarget({ mode: 'role', text: '' });
    setQuery(''); setFilter(''); setArchived(false); setSupplementEntry(''); setSupplementText('');
    selectionRun.current = undefined;
    try { const saved = JSON.parse(localStorage.getItem(`resulab.career-selection:${ownerId}`) || 'null'); if (saved) { setSelection(saved.selection); setTarget(saved.target); selectionRun.current = saved.runId; } } catch { /* invalid session data is ignored */ }
    void readCareerWorkspace(ownerId).then(value => { if (epoch.current === current) { setWorkspace(value); setReady(true); } }).catch(e => { if (epoch.current === current) setError(errorText(e)); });
    void reloadVersions();
    if (token) {
      void refreshCareerWorkspace(ownerId, token).then(value => { if (epoch.current === current) { setWorkspace(value); setReady(true); } }).catch(e => { if (epoch.current === current) setError(errorText(e)); });
      void careerRequest<typeof tasks>(token, '/runs').then(value => { if (epoch.current === current) setTasks(value); }).catch(() => {});
      void careerRequest<typeof backendVersions>(token, '/versions').then(value => { if (epoch.current === current) setBackendVersions(value); }).catch(() => {});
    }
    return () => { ++epoch.current; };
  }, [ownerId, token]);
  useEffect(() => {
    if (!active) return;
    try { localStorage.setItem(`resulab.career-selection:${ownerId}`, JSON.stringify({ selection, target, runId: selectionRun.current })); }
    catch { setError('岗位与选材草稿无法写入本机，请先备份'); }
  }, [selection, target, ownerId, active]);
  useEffect(() => {
    if (!migration || !migrationPreviewRef.current) return;
    migrationPreviewRef.current.focus({ preventScroll: true });
    migrationPreviewRef.current.scrollIntoView({ block: 'nearest', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }, [migration]);
  useEffect(() => {
    setReviewedResult(false); setApplication(null); setAccepted([]); setSummary(false);
    if (!run || run.context.phase !== 'review' || !run.context.result) return;
    let stopped = false;
    const context = run.context, input = { jdText: jobTarget(context.target.text, context.target.mode).text, facts: entryFacts(context.entries) };
    void verifyCareerResult(context.result, input, true).then(() => {
      if (!stopped) { setReviewedResult(true); setAccepted(context.result!.edits.map(e => `${e.factId}:${e.field}`)); }
    }).catch(e => { if (!stopped) setError(`结果未通过来源核对：${errorText(e)}`); });
    return () => { stopped = true; };
  }, [run?.runId, run?.context.phase]);
  useEffect(() => {
    if (run?.context.phase === 'selection') {
      let next = run.context.selection;
      try { const saved = JSON.parse(localStorage.getItem(`resulab.career-selection:${ownerId}`) || 'null'); if (saved?.runId === run.runId) { selectionFacts(run.context.entries, saved.selection); next = saved.selection; } } catch { /* fall back to the persisted recommendation */ }
      selectionRun.current = run.runId; setSelection(next); setTarget(run.context.target); setStep('target');
    }
  }, [run?.runId, run?.context.phase]);
  async function action(work: () => Promise<void>) {
    if (working.current || !active) return;
    working.current = true; setBusy(true); setError(''); setNotice(''); const current = epoch.current;
    try { await work(); } catch (e) { if (epoch.current === current) setError(errorText(e)); }
    finally { if (epoch.current === current) { working.current = false; setBusy(false); } }
  }
  const validOwner = () => { if (live.current.ownerId !== ownerId || live.current.token !== token) throw new Error('账号已变化，操作已停止'); };
  function openEditor(input: CareerEntryInput | null, trigger: HTMLButtonElement, draftScope = '') {
    editorTrigger.current = trigger;
    editorRevision.current = { id: input?.id || '', revision: input ? data.entries.find(e => e.id === input.id)?.revision || 0 : 0 };
    setEditing(input); setEditorDraftScope(draftScope); setEditorKey(k => k + 1); setEditorOpen(true);
  }
  function restoreEditorFocus() {
    const trigger = editorTrigger.current;
    requestAnimationFrame(() => { if (trigger?.isConnected && !trigger.disabled) trigger.focus(); });
  }
  async function save(input: CareerEntryInput, confirm: boolean, expectedRevision?: number) {
    const previous = data.entries.find(e => e.id === input.id);
    const expected = expectedRevision ?? (editorOpen && editorRevision.current.id === input.id ? editorRevision.current.revision : previous?.revision || 0);
    const value = await saveCareerEntry(ownerId, input, expected, confirm, token);
    validOwner(); setWorkspace(value); setEditorOpen(false);
    setNotice(value.pending[input.id] ? '已保存到本机，等待同步；可点击同步重试。' : token ? localBackend ? '已保存到本地后端。' : '已保存到云端。' : '已保存到本机访客经历库。');
  }
  async function extract(input: CareerEntryInput, expectedRevision: number) {
    if (!token) throw new Error('AI 提取需要登录，也可以使用完整填写手动整理');
    setBusy(true);
    try {
      const current = data.entries.find(e => e.id === input.id);
      const expected = expectedRevision;
      const local = await saveCareerEntry(ownerId, { ...input, status: 'draft' }, expected, false, token);
      editorRevision.current = { id: input.id, revision: local.entries.find(e => e.id === input.id)?.revision || 0 };
      validOwner(); setWorkspace(local);
      let result: Awaited<ReturnType<typeof extractLibraryFacts>>;
      try { result = await extractLibraryFacts(input.rawText); validOwner(); } catch (error) { validOwner(); return { facts: input.facts, revision: editorRevision.current.revision, error: `原文已保存，AI 提取未完成：${errorText(error)}` }; }
      const extracted = applyAIImport(createEmptyResume(), prepareAIImport(result, createEmptyResume()));
      const output: CareerFact[] = [];
      for (const section of CAREER_SECTIONS) for (const [index, row] of extracted[section].entries()) {
        const id = await stableCareerId(`${input.id}:${section}:${index}`);
        output.push(parseCareerFact({ id, section, data: { ...row, ...(section === 'skills' ? { level: '' } : {}), id }, sourceTitle: input.title, doNotClaim: input.doNotClaim }));
      }
      return { facts: output, revision: editorRevision.current.revision };
    } finally { if (live.current.ownerId === ownerId) setBusy(false); }
  }
  async function previewMigration(kind: 'legacy' | 'guest' | 'resume') {
    if (kind === 'resume') {
      const source: CareerLibrary = { ownerId, version: 1, revision: 0, updatedAt: Date.now(), sources: [{ id: 'current-editor', title: '当前简历', kind: 'editor', createdAt: Date.now(), resume: cleanLibraryResume(resume), confirmed: false, included: false, originalText: '', doNotClaim: '' }], drafts: [] };
      const entries = await splitLegacyLibrary(source); validOwner();
      setMigration({ source: kind, entries, drafts: [] });
    } else {
      const source = await readLibrary(kind === 'guest' ? 'local-guest' : ownerId), entries = await splitLegacyLibrary(source);
      if (kind === 'guest') {
        const guest = await readCareerWorkspace('local-guest');
        for (const e of guest.entries) entries.push({ ...entryInput(e), id: await stableCareerId(`${ownerId}:guest:${e.id}`), migrationKey: `guest:${e.id}`, relatedEntryId: e.relatedEntryId ? await stableCareerId(`${ownerId}:guest:${e.relatedEntryId}`) : null });
      }
      validOwner(); setMigration({ source: kind, entries, drafts: source.drafts });
    }
  }
  async function importMigration() {
    if (!migration || !migration.entries.length && !migration.drafts.length) return;
    const existing = await readCareerWorkspace(ownerId);
    const created = new Set<string>();
    for (const input of migration.entries) {
      validOwner(); if (existing.entries.some(e => e.id === input.id || (input.migrationKey && e.migrationKey === input.migrationKey))) continue;
      await saveCareerEntry(ownerId, { ...input, relatedEntryId: null }, 0, input.status === 'confirmed', token); created.add(input.id);
    }
    // Link only after both endpoints exist, including cyclic links in a restored backup.
    for (const input of migration.entries.filter(e => e.relatedEntryId && created.has(e.id))) {
      validOwner(); const w = await readCareerWorkspace(ownerId), entry = w.entries.find(e => e.id === input.id);
      if (entry) await saveCareerEntry(ownerId, { ...entryInput(entry), relatedEntryId: input.relatedEntryId }, entry.revision, input.status === 'confirmed', token);
    }
    for (const draft of migration.drafts) {
      validOwner(); const id = await stableCareerId(`${ownerId}:version:${draft.id}`);
      if (token && !localBackend) {
        const { error } = await supabase.from('resumes').upsert({ id, user_id: ownerId, title: draft.title, data: cleanLibraryResume(draft.resume) }, { onConflict: 'id', ignoreDuplicates: true });
        if (error) throw new Error('经历已保留，但岗位副本上传失败；可重试本次导入');
      } else if (token) {
        await careerRequest(token, '/versions/import', { idempotencyKey: id, title: draft.title, resume: cleanLibraryResume(draft.resume) });
      } else await saveLocalDraft({ ...draft, id });
    }
    validOwner(); setWorkspace(await readCareerWorkspace(ownerId)); setMigration(null); await reloadVersions();
    if (token) { const list = await careerRequest<typeof backendVersions>(token, '/versions'); validOwner(); setBackendVersions(list); }
    setNotice('导入完成。旧库保留不变，待确认材料仍需核对。');
  }
  async function saveLocalDraft(draft: LibraryDraft) {
    const library = await readLibrary(ownerId);
    await updateLibrary(ownerId, library.revision, current => ({ ...current, drafts: current.drafts.some(d => d.id === draft.id) ? current.drafts : [draft, ...current.drafts] }));
  }
  function changeSelection(id: string, kind: 'selected' | 'locked' | 'excluded', checked: boolean) {
    setApplication(null);
    setSelection(previous => {
      const next = structuredClone(previous), key = `${kind}Ids` as keyof CareerSelectionPlan;
      next[key] = checked ? [...new Set([...next[key], id])] : next[key].filter(v => v !== id);
      if (kind === 'locked' && checked) { next.selectedIds = [...new Set([...next.selectedIds, id])]; next.excludedIds = next.excludedIds.filter(v => v !== id); }
      if (kind === 'excluded' && checked) { next.selectedIds = next.selectedIds.filter(v => v !== id); next.lockedIds = next.lockedIds.filter(v => v !== id); }
      if (kind === 'selected' && checked) next.excludedIds = next.excludedIds.filter(v => v !== id);
      if (kind === 'selected' && !checked) next.lockedIds = next.lockedIds.filter(v => v !== id);
      return next;
    });
  }
  async function recommend() {
    if (modelReady !== true) throw new Error('Agent 后端模型尚未就绪，请查看“模型配置说明”，配置后刷新模型状态');
    if (!token) throw new Error('Agent 推荐需要登录，手动选材无需登录');
    if (!target.text.trim()) throw new Error('请填写岗位名称或 JD');
    const scoped = confirmed.filter(e => !data.pending[e.id] && (recommendScope === 'all' ||
      recommendScope === 'filtered' && (!filter || e.kind === filter) && (!query || JSON.stringify(e).toLocaleLowerCase().includes(query.toLocaleLowerCase())) ||
      recommendScope === 'selected' && e.facts.some(f => selection.selectedIds.includes(`${e.id}:${f.id}`)) ||
      e.facts.some(f => selection.lockedIds.includes(`${e.id}:${f.id}`))));
    const entries = scoped;
    if (!entries.length) throw new Error('请先确认并上传至少一条经历');
    const allFacts = entryFacts(entries);
    const allowed = new Set(allFacts.filter(f => f.section === 'projects').map(f => f.id));
    if (allFacts.length > 160) throw new Error('候选事实超过 160 条，请使用左侧搜索 / 分类筛选，或改为仅分析已勾选经历。');
    const scopedSelection = { selectedIds: selection.selectedIds.filter(id => allowed.has(id)), lockedIds: selection.lockedIds.filter(id => allowed.has(id)), excludedIds: [...new Set([...selection.excludedIds.filter(id => allowed.has(id)), ...allFacts.filter(f => f.section !== 'projects').map(f => f.id)])] };
    selectionFacts(entries, scopedSelection);
    await command('/runs', { target, entries: entries.map(e => ({ id: e.id, revision: e.revision })), selection: scopedSelection });
  }
  function material(useResult: boolean) {
    if (!useResult) { if (!target.text.trim()) throw new Error('请先填写岗位名称或 JD'); return { entries: confirmed, facts: selectionFactsSafe(), title: target.mode === 'role' ? target.text.trim() : live.current.resume.jobIntention.desiredPosition || '岗位简历', desiredPosition: target.mode === 'role' ? target.text.trim() : undefined, summary: '' }; }
    if (!run?.context.result || !reviewedResult) throw new Error('请等待结果完成来源核对');
    const result = run.context.result;
    if (selectionFacts(run.context.entries, run.context.selection).some(f => f.section !== 'projects')) throw new Error('该历史任务包含非项目经历，请重新选择项目并开始新的推荐。');
    const chosen = selectionFacts(run.context.entries, run.context.selection).map(f => structuredClone(f));
    for (const edit of result.edits) if (accepted.includes(`${edit.factId}:${edit.field}`)) {
      const fact = chosen.find(f => f.id === edit.factId); if (fact) Object.assign(fact.data, { [edit.field]: structuredClone(edit.after) });
    }
    return { entries: run.context.entries, facts: chosen, title: result.plan.roleTitle, desiredPosition: result.plan.roleTitle, summary: summary ? result.snapshot.selfEvaluation : '' };
  }
  const [usingResult, setUsingResult] = useState(false);
  async function checkSources(entries: CareerEntry[], chosen: CareerFact[]) {
    const ids = new Set(chosen.map(f => f.id.split(':')[0]));
    const sources = entries.filter(e => ids.has(e.id));
    if (!chosen.length) throw new Error('请至少选择一条经历');
    const local = await readCareerWorkspace(ownerId);
    if (sources.some(e => !local.entries.some(x => x.id === e.id && x.revision === e.revision && x.status === 'confirmed'))) throw new Error('经历已变化，请重新选择并核对');
    if (token) {
      if (sources.some(e => local.pending[e.id])) throw new Error('所选经历尚未同步，请先完成上传');
      await careerRequest(token, '/validate-sources', sources.map(e => ({ id: e.id, revision: e.revision })));
    }
    validOwner(); return sources;
  }
  async function prepare(useResult: boolean) {
    const m = material(useResult); await checkSources(m.entries, m.facts); validOwner();
    const plan = prepareCareerApplication(live.current.resume, m.entries, m.facts, m.desiredPosition);
    if (m.summary) plan.summary = m.summary;
    setUsingResult(useResult); setApplication(plan);
  }
  async function apply() {
    if (!application) return;
    const m = material(usingResult); await checkSources(m.entries, m.facts); validOwner();
    if (application.rows.some(row => !m.entries.some(e => e.id === row.origin.entryId && e.revision === row.origin.revision && e.status === 'confirmed')))
      throw new Error('应用预览引用的经历版本已变化，请重新预览');
    const base = live.current.resume;
    applyCareerApplication(base, application); // validate before creating the backup
    await saveLocalDraft({ id: crypto.randomUUID(), title: '经历填入前备份', jdText: '', createdAt: Date.now(), kind: 'editor-backup', resume: structuredClone(base) });
    validOwner(); if (JSON.stringify(live.current.resume) !== application.base) throw new Error('简历已变化，请重新生成应用预览');
    applyCareer(application); setApplication(null); setNotice('已整批填入当前简历，可撤销本次应用。'); await reloadVersions();
  }
  async function createVersion(useResult: boolean) {
    const m = material(useResult), sources = await checkSources(m.entries, m.facts), base = live.current.resume;
    const next = careerVersion(base, m.entries, m.facts, m.title, m.summary), id = crypto.randomUUID();
    if (!m.desiredPosition) next.jobIntention.desiredPosition = base.jobIntention.desiredPosition;
    await saveLocalDraft({ id, title: m.title, jdText: target.text, createdAt: Date.now(), kind: 'saved', resume: next });
    let cloudId: string | undefined;
    if (token) {
      const signature = JSON.stringify({ sources: sources.map(e => [e.id, e.revision]), next: { ...next, lastModified: 0 } }), storageKey = `resulab.career-version:${ownerId}`;
      const pending = JSON.parse(localStorage.getItem(storageKey) || 'null');
      const key = pending?.signature === signature ? pending.key : crypto.randomUUID(); localStorage.setItem(storageKey, JSON.stringify({ signature, key }));
      const savedResume = pending?.signature === signature ? pending.resume : next;
      localStorage.setItem(storageKey, JSON.stringify({ signature, key, resume: savedResume }));
      cloudId = (await careerRequest<{ id: string }>(token, '/versions', { idempotencyKey: key, title: m.title, entries: sources.map(e => ({ id: e.id, revision: e.revision })), selectedIds: m.facts.map(f => f.id), resume: savedResume })).id;
      localStorage.removeItem(storageKey);
    }
    validOwner();
    if (live.current.resume !== base) throw new Error('岗位版本已保存，当前简历有新修改；请从版本列表打开，避免覆盖');
    await saveLocalDraft({ id: crypto.randomUUID(), title: '切换岗位版本前备份', jdText: '', createdAt: Date.now(), kind: 'editor-backup', resume: structuredClone(base) });
    validOwner(); await loadResume({ ...next, ...(cloudId && !localBackend ? { _cloudId: cloudId } : {}) }); navigate(`/builder/${next.templateId}`);
  }
  async function openDraft(draft: LibraryDraft) {
    const base = live.current.resume;
    await saveLocalDraft({ id: crypto.randomUUID(), title: '打开版本前备份', jdText: '', createdAt: Date.now(), kind: 'editor-backup', resume: structuredClone(base) });
    validOwner(); if (live.current.resume !== base) throw new Error('当前简历已变化，请重新打开版本');
    await loadResume(structuredClone(draft.resume)); navigate(`/builder/${draft.resume.templateId}`);
  }
  async function backup() {
    const library = await readLibrary(ownerId), raw = exportCareerBackup(await readCareerWorkspace(ownerId), library);
    const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' })), a = document.createElement('a');
    a.href = url; a.download = `ResuLab-经历库-v2-${new Date().toLocaleDateString('sv-SE')}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function restoreBackup(file: File) {
    if (file.size > 20000000) throw new Error('备份超过 20 MB');
    const raw = await file.text(), version = JSON.parse(raw).version;
    if (version === 2) { const backup = parseCareerBackup(raw); validOwner(); setMigration({ source: 'backup', ...backup }); }
    else { const old = parseLibraryBackup(raw), entries = await splitLegacyLibrary({ ownerId, version: 1, revision: 0, updatedAt: Date.now(), ...old }); validOwner(); setMigration({ source: 'backup', entries, drafts: old.drafts }); }
  }
  if (!active) return <div className="career-page"><AppHeader /><main className="career-container"><h1>经历工作台</h1><p role="status">正在读取当前账号的经历…</p>{error && <p role="alert" className="career-error">{error}</p>}</main></div>;
  const displayed = projectEntries.filter(e => (archived ? e.status === 'archived' : e.status !== 'archived') && (!filter || e.kind === filter) && (!query || JSON.stringify(e).toLocaleLowerCase().includes(query.toLocaleLowerCase())));
  const candidateFacts = (run?.context.phase === 'selection' ? entryFacts(run.context.entries) : facts).filter(f => f.section === 'projects');
  const selectedOrdered = selection.selectedIds.map(id => candidateFacts.find(f => f.id === id)).filter((f): f is CareerFact => Boolean(f));
  const importPreview = migration && <section ref={migrationPreviewRef} className="career-proposal career-import-preview" role="region" aria-labelledby="career-import-preview-title" tabIndex={-1}>
    <h3 id="career-import-preview-title">{migration.source === 'resume' ? '当前简历拆分预览' : '导入预览'}</h3>
    {!migration.entries.length && !migration.drafts.length ? <>
      <p role="status">{migration.source === 'resume' ? '当前简历暂无可导入的经历。' : '没有可导入的经历或岗位副本。'}</p>
      <p className="career-muted">{migration.source === 'resume' ? '这里只读取当前浏览器、当前地址的简历编辑器。请先填写或打开包含教育、工作、项目、技能、证书或语言条目的简历；姓名和联系方式不会拆成经历。' : '请检查所选材料或备份是否包含实际条目。'}</p>
      <div className="career-actions">{migration.source === 'resume' && <Link className="career-button career-primary" to="/builder">前往编辑 / 导入简历</Link>}<button className="career-button" disabled={lock} onClick={() => setMigration(null)}>关闭预览</button></div>
    </> : <>
      <p role="status">找到 {migration.entries.length} 段经历、{migration.drafts.length} 份岗位副本。确认后才会保存到经历库。</p>
      <p className="career-muted">{migration.source === 'resume' ? '拆分出的经历将保存为待核对草稿，当前简历保持原样。' : '同一旧条目重复迁移会跳过；外部备份恢复的事实需重新核对。原始库与备份保持不变。'}</p>
      {migration.entries.map((e, i) => <p key={`${e.id}:${i}`}>{e.title} · {e.status === 'confirmed' ? '保留原确认状态' : '待核对'}</p>)}
      <div className="career-actions"><button className="career-button career-primary" disabled={lock} onClick={() => void action(importMigration)}>确认导入</button><button className="career-button" disabled={lock} onClick={() => setMigration(null)}>取消</button></div>
    </>}
  </section>;
  return <div className="career-page"><AppHeader /><main className="career-container">
    <div className="career-heading project-library-heading"><div><span className="career-eyebrow">项目经历库</span><h1>把项目经历写进对的简历</h1><p>先添加项目，再选择目标岗位。课程、个人作品和实习中参与的项目都可以。</p></div><span className="career-project-count">{confirmed.length} 个已确认项目</span></div>
    <nav className="project-library-steps" aria-label="使用流程"><button aria-current={step === 'projects' ? 'step' : undefined} onClick={() => setStep('projects')}><span>01</span> 项目经历</button><button aria-current={step === 'target' ? 'step' : undefined} onClick={() => setStep('target')}><span>02</span> 选择岗位与项目</button><Link to="/my-resumes"><span>03</span> 我的简历</Link></nav>
    <div className="career-storage"><p>{token ? `${localBackend ? '本地后端经历库 · 数据仅在本机' : '云端经历库'} · ${Object.keys(data.pending).length} 条待上传` : '本机访客经历库 · 登录后可导入账号'}</p><div className="career-actions">{token ? <button className="career-button" disabled={lock} onClick={() => void action(async () => { const w = await syncCareerWorkspace(ownerId, token); validOwner(); setWorkspace(w); setNotice(Object.keys(w.pending).length ? '部分条目仍待上传，请检查冲突或网络状态。' : localBackend ? '经历已同步到本地后端。' : '经历已同步到云端。'); })}>同步 / 重试上传</button> : <Link to="/login?redirect=/library">登录使用账号经历库和 Agent</Link>}<button className="career-button" disabled={lock} onClick={() => void action(backup)}>导出备份</button></div></div>
    {(error || runError) && <p role="alert" className="career-error">{error || runError}</p>}{notice && <p role="status" className="career-notice">{notice}</p>}
      {editorOpen && <CareerEntryEditor projectMode key={`${ownerId}:${editorKey}`} ownerId={ownerId} initial={editing} draftScope={editorDraftScope} expectedRevision={editorRevision.current.revision} busy={lock} save={async (v, confirm, expected) => { if (working.current) throw new Error('正在保存，请稍候'); working.current = true; setBusy(true); let saved = false; try { await save(v, confirm, expected); saved = true; } finally { if (live.current.ownerId === ownerId) { working.current = false; setBusy(false); if (saved) restoreEditorFocus(); } } }} extract={extract} cancel={() => { setEditorOpen(false); restoreEditorFocus(); }} />}
    <div className="project-library-body"><section className="career-panel project-library-panel" id="materials" hidden={step !== 'projects'}><div className="project-section-heading"><div><h2>我的项目经历</h2><p className="career-muted">项目材料保留在这里，需要时再选入不同岗位的简历。</p></div><button className="career-button career-primary" disabled={lock} onClick={e => openEditor(null, e.currentTarget)}>添加项目经历</button></div>
      <div className="project-import-options"><div><strong>已有项目介绍？</strong><p>上传 PDF、Word 或文字文档，也可以手动填写。</p><button className="career-button" disabled={lock} onClick={e => openEditor(null, e.currentTarget)}>上传文档 / 手动填写</button></div><div><strong>有项目源码？</strong><p>通过公开仓库链接或 ZIP 整理项目，补充你的个人贡献。</p><Link className="career-button" to="/library/project">上传 ZIP / 读取仓库</Link></div></div><details><summary>从已有简历导入</summary><button className="career-button" disabled={lock} onClick={() => void action(() => previewMigration('resume'))}>从当前简历拆分导入</button><p className="career-muted">导入后只在此处展示项目，其他经历保留在简历和原有数据中。</p></details>
      {migration?.source === 'resume' && importPreview}

      <div className="career-source"><label className="career-label">搜索经历<input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="名称、工具、成果或原始记录" /></label><label className="career-check"><input type="checkbox" checked={archived} onChange={e => setArchived(e.target.checked)} />查看已归档经历</label></div>
      {!ready ? <p>正在读取经历…</p> : !displayed.length ? <p className="career-empty">还没有符合条件的项目。添加个人、课程或实习项目，整理后就可以用于岗位简历。</p> : displayed.map(entry => <article className="career-source" key={entry.id}>
        <div className="career-row"><h3>{entry.title}</h3><span className={`career-pill ${entry.status === 'confirmed' ? 'verified' : ''}`}>{data.pending[entry.id] ? '待上传' : entry.status === 'confirmed' ? '已确认' : entry.status === 'archived' ? '已归档' : '草稿 · 待核对'}</span></div><p className="career-muted">{entryLabels[entry.kind]} · 版本 {entry.revision} · {entry.facts.length} 条事实</p>{Boolean(entry.projectEvidence?.length) && <p className="career-muted">{entry.projectEvidence!.some(e => deletedMaterials.includes(e.materialId)) ? "来源材料已删除，已确认文案仍保留。" : "保留项目文件证据。"}<Link to={`/library/project?session=${encodeURIComponent(entry.groupId)}`}>查看项目工作区</Link></p>}
        <details><summary>查看事实与原始材料</summary><p className="career-text">{entry.rawText || '通过结构化表单录入'}</p>{entry.facts.map(f => <div className="career-fact" key={f.id}><strong>{factTitle(f.section, f.data)}</strong><p className="career-text">{Object.entries(f.data).filter(([k, v]) => k !== 'id' && v !== '' && v !== false).map(([k, v]) => `${careerLabels[k] || k}：${Array.isArray(v) ? v.join('；') : String(v)}`).join('\n')}</p></div>)}{entry.doNotClaim && <p className="career-text">事实限制：{entry.doNotClaim}</p>}</details>
        <div className="career-actions"><button className="career-button" disabled={lock} onClick={e => openEditor(entryInput(entry), e.currentTarget)}>编辑 / 核对</button><button className="career-button" disabled={lock} onClick={() => void action(() => save({ ...entryInput(entry), status: entry.status === 'archived' ? 'draft' : 'archived' }, false))}>{entry.status === 'archived' ? '恢复为草稿' : '归档'}</button>{token && !data.pending[entry.id] && <button className="career-button" disabled={lock} onClick={() => void action(async () => { const entries = await careerRequest<CareerEntry[]>(token, `/entries/${entry.id}/revisions`); validOwner(); setHistory({ id: entry.id, entries }); })}>查看事实版本</button>}</div>
        {history?.id === entry.id && <details open><summary>不可变事实版本</summary>{history.entries.map(e => <div className="career-fact" key={e.revision}><strong>版本 {e.revision} · {e.status}</strong><p className="career-text">{e.rawText}</p>{e.facts.map(f => <p className="career-text" key={f.id}>{Object.entries(f.data).filter(([k]) => k !== 'id').map(([k, v]) => `${careerLabels[k] || k}：${Array.isArray(v) ? v.join('；') : v}`).join('\n')}</p>)}</div>)}</details>}
        {data.pending[entry.id]?.error && <p role="alert" className="career-error">{data.pending[entry.id].error}</p>}
        {data.pending[entry.id]?.error && <p className="career-error" role="alert">{data.pending[entry.id].conflict ? '版本冲突：请比较云端版本后处理。' : '上传未完成：请检查网络或登录状态后点击同步重试。'}本机内容仍保留。</p>}
        {data.pending[entry.id]?.conflict && <details><summary>比较云端版本与本机内容</summary><div>{data.remote.find(e => e.id === entry.id)?.facts.map(f => <ReadableCareerFields key={f.id} value={f.data} />)}</div><p className="career-muted">上方保留本机内容。请检查差异，再决定是否用本机内容建立新版本。</p><button className="career-button" disabled={lock} onClick={() => void action(async () => {
          const remote = data.remote.find(e => e.id === entry.id); if (!remote) throw new Error('请先同步读取云端版本');
          const next = await mutateCareerWorkspace(ownerId, w => { w.pending[entry.id] = { ...w.pending[entry.id], expectedRevision: remote.revision, conflict: false, error: undefined, confirm: false, input: { ...w.pending[entry.id].input, status: 'draft' } }; return w; }); validOwner(); setWorkspace(next); setNotice('已按云端版本更新提交基准；本机内容将作为待核对草稿上传，请点击同步。');
        })}>已核对，使用本机内容另存新版本</button></details>}
      </article>)}
    <div className="project-next"><button className="career-button career-primary" onClick={() => setStep('target')}>下一步：选择岗位与项目 →</button></div></section><section className="career-panel project-library-panel" id="target" hidden={step !== 'target'}><div className="project-section-heading"><div><h2>为目标岗位选择项目</h2><p className="career-muted">填写岗位名称或 JD，然后自己选择项目，或让 Agent 推荐。</p></div><button className="career-button" onClick={() => setStep('projects')}>返回项目库</button></div>
      <fieldset disabled={lock || Boolean(run && ['queued', 'running'].includes(run.status))}><label className="career-label">岗位输入方式<select value={target.mode} onChange={e => { setTarget(v => ({ ...v, mode: e.target.value as 'role' | 'jd' })); setApplication(null); }}><option value="role">岗位名称 · 通用岗位参考</option><option value="jd">完整 JD · 具体招聘要求</option></select></label><label className="career-label">{target.mode === 'role' ? '目标岗位名称' : '招聘 JD'}<textarea rows={target.mode === 'jd' ? 5 : 2} maxLength={12000} value={target.text} onChange={e => { setTarget(v => ({ ...v, text: e.target.value })); setApplication(null); }} /></label>
      {target.mode === 'role' && <p className="career-muted">岗位名称用于通用选材，不代表具体公司的招聘要求。</p>}
      <p className="career-muted">手动勾选项目后可直接填入；也可以让 Agent 按岗位推荐，再由你确认。</p><details><summary>Agent 选材设置</summary><label className="career-label">Agent 候选范围<select value={recommendScope} onChange={e => setRecommendScope(e.target.value as typeof recommendScope)}><option value="all">全部已确认项目</option><option value="filtered">按项目库搜索结果</option><option value="selected">仅分析已勾选项目</option></select></label>
      <CareerModelStatus local={localBackend} onReadyChange={setModelReady} /></details><div className="career-actions"><button className="career-button" disabled={!facts.length || modelReady !== true} onClick={() => void action(recommend)}>Agent 推荐项目</button><button className="career-button" onClick={() => { setSelection(emptySelection()); setApplication(null); }}>清空本次选择</button></div>
      {!candidateFacts.length && <p className="career-empty">还没有可选的项目。请先添加项目并确认内容。</p>}{candidateFacts.map(f => <article key={f.id} className="career-fact project-choice"><label className="career-check"><input type="checkbox" checked={selection.selectedIds.includes(f.id)} onChange={e => changeSelection(f.id, 'selected', e.target.checked)} />{factTitle(f.section, f.data)}</label><div className="career-actions"><label className="career-check"><input type="checkbox" checked={selection.lockedIds.includes(f.id)} onChange={e => changeSelection(f.id, 'locked', e.target.checked)} />锁定保留</label><label className="career-check"><input type="checkbox" checked={selection.excludedIds.includes(f.id)} onChange={e => changeSelection(f.id, 'excluded', e.target.checked)} />本次排除</label></div></article>)}
      {!!selectedOrdered.length && <div className="career-source"><h3>入选顺序</h3>{selectedOrdered.map((f, i) => <div className="career-row" key={f.id}><span>{i + 1}. {factTitle(f.section, f.data)}</span><div className="career-actions">{([-1, 1] as const).map(direction => <button className="career-button" key={direction} disabled={i + direction < 0 || i + direction >= selectedOrdered.length} aria-label={`${factTitle(f.section, f.data)}${direction < 0 ? '上移' : '下移'}`} onClick={() => { setSelection(v => { const ids = [...v.selectedIds], from = ids.indexOf(f.id), to = from + direction; [ids[from], ids[to]] = [ids[to], ids[from]]; return { ...v, selectedIds: ids }; }); setApplication(null); }}>{direction < 0 ? '上移' : '下移'}</button>)}</div></div>)}</div>}
      <div className="career-actions"><button className="career-button" disabled={!selection.selectedIds.length || !target.text.trim()} onClick={() => void action(() => prepare(false))}>预览填入当前简历</button><button className="career-button" disabled={!selection.selectedIds.length || !target.text.trim()} onClick={() => void action(() => createVersion(false))}>创建岗位简历副本</button></div></fieldset>
      {run && <section className="career-result" id="review"><h3>Agent 任务 · {run.status === 'awaiting_input' ? '等待确认选材' : run.context.phase === 'review' ? '等待核对应用' : run.context.phase === 'cancelled' ? '已取消' : run.status === 'failed' ? '执行失败' : '正在处理'}</h3><p className="career-muted">{run.context.target.text.slice(0, 160)} · 已调用模型 {run.usage.calls} 次</p>
        {run.error && <p role="alert" className="career-error">{run.error.message}</p>}<button className="career-button" disabled={lock} onClick={() => void action(() => restore(run.runId))}>刷新任务状态</button>
        {['queued', 'running', 'awaiting_input'].includes(run.status) && <button className="career-button" disabled={lock} onClick={() => void action(() => command(`/runs/${run.runId}/cancel`, {}))}>取消任务</button>}
        {run.status === 'failed' && run.error?.retryable && <button className="career-button" disabled={lock} onClick={() => void action(() => command(`/runs/${run.runId}/retry`, {}))}>恢复失败任务</button>}
        {run.context.plan?.requirements.map(req => <article className="career-requirement" key={req.id}><strong>{req.text}</strong><span className="career-pill">{{ supported: '有事实支持', partial: '部分支持', missing: '缺少证据' }[req.coverage]}</span><blockquote>{req.jdQuote}</blockquote>{req.gap && <p>{req.gap}</p>}{run.context.plan!.selected.filter(s => s.requirementIds.includes(req.id)).map(s => <p key={s.factId}>{factTitle(entryFacts(run.context.entries).find(f => f.id === s.factId)!.section, entryFacts(run.context.entries).find(f => f.id === s.factId)!.data)}：{s.reason}</p>)}</article>)}
        {run.context.phase === 'selection' && run.context.questions?.map(q => <div className="career-fact" key={q.factId}><p><strong>{q.title}</strong>：{q.question}</p><button className="career-button" disabled={lock} onClick={() => setSupplementEntry(q.factId.split(':')[0])}>选择此经历进行补充</button><span className="career-muted"> 不清楚或暂不补充时可以跳过。</span></div>)}
        {run.context.phase === 'selection' && run.status === 'awaiting_input' && <><p className="career-notice">推荐已完成。请在上方增删、锁定或排序，再确认本次选材。</p><div className="career-actions"><button className="career-button" disabled={lock || !selection.selectedIds.length} onClick={() => void action(() => command(`/runs/${run.runId}/selection`, { selection, useOriginal: true }))}>确认选材，使用原文</button><button className="career-button career-primary" disabled={lock || !selection.selectedIds.length} onClick={() => void action(() => command(`/runs/${run.runId}/selection`, { selection, useOriginal: false }))}>确认选材，按岗位写作</button></div><details><summary>补充某段经历的事实（可跳过）</summary><label className="career-label">补充到哪段经历<select value={supplementEntry} onChange={e => setSupplementEntry(e.target.value)}><option value="">请选择经历</option>{run.context.entries.map(e => <option key={e.id} value={e.id}>{e.title}</option>)}</select></label><label className="career-label">实际行动、方法或交付物<textarea rows={3} maxLength={2000} value={supplementText} onChange={e => setSupplementText(e.target.value)} /></label><p className="career-muted">不清楚可以跳过。补充先进入编辑草稿，核对确认后需要重新推荐，不会自动成为事实。</p><button className="career-button" disabled={lock || !supplementEntry || !supplementText.trim()} onClick={event => { const trigger = event.currentTarget; void action(async () => {
          if (!token) return; const entry = run.context.entries.find(e => e.id === supplementEntry)!;
          const proposal = await careerRequest<{ entry: CareerEntryInput }>(token, `/runs/${run.runId}/supplements`, { entryId: entry.id, expectedRevision: entry.revision, text: supplementText }); const scope = await stableCareerId(`${run.runId}:${entry.id}:${supplementText}`); validOwner(); openEditor(proposal.entry, trigger, scope); setNotice('补充已放入编辑草稿，请核对结构化事实后确认保存，再重新推荐。');
        }); }}>将补充放入待核对草稿</button></details></>}
        {run.context.phase === 'review' && run.context.result && <><p className="career-muted">每项改写只使用对应经历的事实。取消勾选可恢复原文。</p>{run.context.result.edits.map(edit => { const id = `${edit.factId}:${edit.field}`; return <article className="career-edit" key={id}><label className="career-check"><input type="checkbox" checked={accepted.includes(id)} onChange={e => { setAccepted(v => e.target.checked ? [...v, id] : v.filter(x => x !== id)); setApplication(null); }} />采用此改写：{edit.reason}</label><div className="career-diff"><div><span>事实原文</span><p>{Array.isArray(edit.before) ? edit.before.join('\n') : edit.before}</p></div><div><span>岗位文案</span><p>{Array.isArray(edit.after) ? edit.after.join('\n') : edit.after}</p></div></div>{edit.sources.map(source => <blockquote key={source.id}>{source.quote}</blockquote>)}</article>; })}{run.context.result.snapshot.selfEvaluation && <label className="career-check"><input type="checkbox" checked={summary} onChange={e => { setSummary(e.target.checked); setApplication(null); }} />采用岗位摘要：{run.context.result.snapshot.selfEvaluation}</label>}<div className="career-actions"><button className="career-button" disabled={lock || !reviewedResult || run.context.result.needsMoreFacts} onClick={() => void action(() => prepare(true))}>核对后填入当前简历 · 预览</button><button className="career-button career-primary" disabled={lock || !reviewedResult || run.context.result.needsMoreFacts} onClick={() => void action(() => createVersion(true))}>确认并创建独立岗位版本</button></div></>}
      </section>}
      {application && <section className="career-result" aria-label="填入简历预览"><h3>填入前核对</h3><p className="career-muted">{application.desiredPosition ? `目标岗位将设为“${application.desiredPosition}”。` : '保留当前简历中的目标岗位。'}同源内容默认跳过，替换需明确选择。</p>{application.rows.map((row, i) => <article className="career-fact" key={row.fact.id}><strong>{factTitle(row.fact.section, row.fact.data)}</strong><label className="career-label">应用方式<select value={row.action} onChange={e => setApplication(p => p && ({ ...p, rows: p.rows.map((r, index) => index === i ? { ...r, action: e.target.value as typeof r.action, targetId: r.targetId || resume[r.fact.section][0]?.id } : r) }))}><option value="append">追加为新条目</option><option value="skip">跳过</option><option value="replace" disabled={!resume[row.fact.section].length}>替换指定条目</option></select></label>{row.action === 'replace' && <label className="career-label">替换目标<select value={row.targetId} onChange={e => setApplication(p => p && ({ ...p, rows: p.rows.map((r, index) => index === i ? { ...r, targetId: e.target.value } : r) }))}>{resume[row.fact.section].map(item => <option key={item.id} value={item.id}>{factTitle(row.fact.section, item)}</option>)}</select></label>}<details><summary>查看将填入的内容</summary><ReadableCareerFields value={row.fact.data} />{row.action === 'replace' && <div><p>替换前</p><ReadableCareerFields value={resume[row.fact.section].find(item => item.id === row.targetId)} /></div>}</details></article>)}<div className="career-actions"><button className="career-button career-primary" disabled={lock} onClick={() => void action(apply)}>确认整批填入</button><button className="career-button" disabled={lock} onClick={() => setApplication(null)}>取消预览</button></div></section>}
      {canUndo && <button className="career-button" disabled={lock} onClick={() => { undo(); setApplication(null); setNotice('已撤销上一批简历修改。'); }}>撤销上一批简历修改</button>}
    </section></div>
    <details id="versions" className="career-panel career-history"><summary>旧数据、任务与备份</summary><div className="career-actions"><button className="career-button" disabled={lock} onClick={() => void action(() => previewMigration('legacy'))}>预览旧经历库迁移</button>{token && <button className="career-button" disabled={lock} onClick={() => void action(() => previewMigration('guest'))}>预览导入访客材料</button>}<label className="career-label career-backup-file">恢复 JSON 备份<input aria-label="恢复 JSON 备份" type="file" accept="application/json,.json" disabled={lock} onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) void action(() => restoreBackup(file)); }} /></label><Link className="career-button" to="/my-resumes">打开云端岗位版本</Link></div>
      {migration && migration.source !== 'resume' && importPreview}
      {!!tasks.length && <details><summary>{localBackend ? '最近的本地后端 Agent 任务' : '最近的云端 Agent 任务'}</summary>{tasks.map(t => <div className="career-history-item career-row" key={t.runId}><span>{t.target.text.slice(0, 80)} · {t.status}</span><button className="career-button" disabled={lock} onClick={() => void action(() => restore(t.runId))}>恢复查看</button></div>)}</details>}
      {backendVersions.map(version => <article className="career-history-item career-row" key={version.id}><div><h3>{version.title}</h3><p className="career-muted">{localBackend ? '本地后端版本' : '云端版本'} · {new Date(version.updatedAt).toLocaleString('zh-CN')}</p></div><button className="career-button" disabled={lock} onClick={() => void action(async () => { if (!token) return; const value = await careerRequest<{ id: string; title: string; resume: unknown }>(token, `/versions/${version.id}`); validOwner(); const next = cleanLibraryResume(value.resume); await openDraft({ id: value.id, title: value.title, createdAt: Date.now(), jdText: '', kind: 'saved', resume: { ...next, ...(!localBackend ? { _cloudId: value.id } : {}) } }); })}>备份当前内容并打开版本</button></article>)}
      {versions.map(draft => <article className="career-history-item career-row" key={draft.id}><div><h3>{draft.title}</h3><p className="career-muted">本机副本 · {new Date(draft.createdAt).toLocaleString('zh-CN')}</p></div><button className="career-button" disabled={lock} onClick={() => void action(() => openDraft(draft))}>备份当前内容并打开</button></article>)}
    </details>
  </main></div>;
}
