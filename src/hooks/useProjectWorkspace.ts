import { useEffect, useRef, useState } from 'react';
import { careerRequest, CareerApiError } from '../utils/careerStore';
import type { ProjectMaterial, ProjectSession } from '../../shared/project';

type Edit = Partial<Pick<ProjectSession, 'answers' | 'understandingCorrection' | 'selectedPaths' | 'draft' | 'step'>>;
export function useProjectWorkspace(ownerId: string, token?: string, requestedSessionId?: string) {
  const [session, setSession] = useState<ProjectSession | null>(null), [material, setMaterial] = useState<ProjectMaterial | null>(null), [sessions, setSessions] = useState<ProjectSession[]>([]);
  const [unattached, setUnattached] = useState<Pick<ProjectMaterial, 'id' | 'name' | 'source' | 'createdAt'>[]>([]);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [saveState, setSaveState] = useState('已保存');
  const scope = useRef({ ownerId, token }); scope.current = { ownerId, token };
  const live = useRef<ProjectSession | null>(null), pending = useRef<Edit>({}), working = useRef<Promise<void> | null>(null), timer = useRef<ReturnType<typeof setTimeout>>();
  const operation = useRef<{ edit: Edit; expectedRevision: number; idempotencyKey: string } | null>(null), actionLock = useRef(false);
  const importController = useRef<AbortController | null>(null), [reading, setReading] = useState(false);
  const abort = useRef(new AbortController());
  const active = (owner: string, auth = token) => scope.current.ownerId === owner && scope.current.token === auth && !abort.current.signal.aborted;
  const request = <T,>(path: string, body?: unknown, method?: string) => careerRequest<T>(token!, `/projects${path}`, body, method, abort.current.signal);
  const key = (s: ProjectSession) => `resulab.project-edit:${ownerId}:${s.id}`;
  function present(s: ProjectSession) { live.current = s; setSession(s); }
  async function list() { if (!token) return; const owner = ownerId; const [value, orphans] = await Promise.all([request<ProjectSession[]>('/sessions'), request<Pick<ProjectMaterial, 'id' | 'name' | 'source' | 'createdAt'>[]>('/materials/unattached')]); if (active(owner)) { setSessions(value); setUnattached(orphans); } }
  async function load(id: string) {
    if (!token) return;
    const owner = ownerId, s = await request<ProjectSession>(`/sessions/${id}`), m = await request<ProjectMaterial>(`/materials/${s.materialId}`);
    if (!active(owner)) return;
    const stored = JSON.parse(localStorage.getItem(key(s)) || 'null') as { revision: number; edit: Edit; operation?: typeof operation.current } | null;
    pending.current = stored?.edit || {};
    operation.current = stored?.operation || null;
    if (stored && stored.revision !== s.revision) { setError('服务端已有更新。本机未提交内容已保留，请比较后另存或重新核对。'); setSaveState('本机草稿待核对'); }
    else { setError(''); setSaveState(stored ? '本机修改待保存' : '已保存'); }
    present({ ...s, ...operation.current?.edit, ...pending.current, revision: stored && !stored.operation ? stored.revision : s.revision }); setMaterial(m); localStorage.setItem(`resulab.project-current:${ownerId}`, id);
    if (stored && (stored.revision === s.revision || stored.operation)) queueMicrotask(() => { if (active(owner) && live.current?.id === id) void flush().catch(() => {}); });
  }
  async function flush() {
    if (working.current) return working.current;
    const owner = ownerId, auth = token;
    const work = async () => {
      while (live.current && (operation.current || Object.keys(pending.current).length) && auth) {
        const s = live.current;
        if (!operation.current) { operation.current = { edit: pending.current, expectedRevision: s.revision, idempotencyKey: crypto.randomUUID() }; pending.current = {}; }
        const op = operation.current;
        localStorage.setItem(key(s), JSON.stringify({ revision: s.revision, edit: pending.current, operation: op })); setSaveState('正在保存…');
        try {
          const result = await request<ProjectSession>(`/sessions/${s.id}`, { ...op.edit, expectedRevision: op.expectedRevision, idempotencyKey: op.idempotencyKey }, 'PATCH');
          if (!active(owner, auth) || live.current?.id !== s.id) return;
          operation.current = null;
          present({ ...result, ...pending.current });
          if (Object.keys(pending.current).length) localStorage.setItem(key(s), JSON.stringify({ revision: result.revision, edit: pending.current })); else localStorage.removeItem(key(s));
          setSaveState('已保存');
        } catch (e) { if (active(owner, auth)) { if (e instanceof CareerApiError && e.status === 400) { pending.current = { ...op.edit, ...pending.current }; operation.current = null; } localStorage.setItem(key(s), JSON.stringify({ revision: s.revision, edit: pending.current, operation: operation.current })); setSaveState('本机已保留，服务端保存失败'); setError(e instanceof Error ? e.message : '保存失败'); } throw e; }
      }
    };
    working.current = work();
    try { await working.current; } finally { working.current = null; }
  }
  function edit(value: Edit) {
    if (!live.current) return;
    pending.current = { ...pending.current, ...value }; present({ ...live.current, ...value });
    try { localStorage.setItem(key(live.current!), JSON.stringify({ revision: live.current!.revision, edit: pending.current, operation: operation.current })); setSaveState('本机草稿已保留'); }
    catch { setError('本机草稿存储失败，请保持页面打开并重试保存'); }
    clearTimeout(timer.current); timer.current = setTimeout(() => { void flush().catch(() => {}); }, 600);
  }
  useEffect(() => {
    abort.current = new AbortController(); live.current = null; pending.current = {}; operation.current = null; working.current = null; setSession(null); setMaterial(null); setSessions([]); setUnattached([]); setError('');
    if (token) { const selected = requestedSessionId || localStorage.getItem(`resulab.project-current:${ownerId}`); void list().then(async () => {
      const pendingKey = `resulab.project-import:${ownerId}`, queued = JSON.parse(localStorage.getItem(pendingKey) || 'null');
      if (queued && !queued.cancelled) {
        const m = queued.materialId ? await request<ProjectMaterial>(`/materials/${queued.materialId}`) : await request<ProjectMaterial | null>(`/operations/${queued.key}`);
        if (m && active(ownerId)) { const s = await request<ProjectSession>('/sessions', { materialId: m.id, sessionId: queued.sessionId, idempotencyKey: queued.sessionKey }); if (active(ownerId)) { localStorage.removeItem(pendingKey); await load(s.id); await list(); } return; }
      }
      if (selected) await load(selected);
    }).catch(e => { if (active(ownerId)) setError(e.message); }); }
    return () => { abort.current.abort(); clearTimeout(timer.current); };
  }, [ownerId, token, requestedSessionId]);
  useEffect(() => {
    if (!token || !session || !['queued', 'running'].includes(session.status)) return;
    const owner = ownerId, id = session.id, control = new AbortController(); let next: ReturnType<typeof setTimeout>;
    const poll = async () => { try { const s = await request<ProjectSession>(`/sessions/${id}`); if (!control.signal.aborted && active(owner) && live.current?.id === id) { present(s); if (['queued', 'running'].includes(s.status)) next = setTimeout(poll, 1500); else void list(); } } catch (e) { if (!control.signal.aborted && active(owner)) setError(e instanceof Error ? e.message : '任务读取失败，请刷新任务'); } };
    next = setTimeout(poll, 1000); return () => { control.abort(); clearTimeout(next); };
  }, [session?.id, session?.status, ownerId, token]);
  async function act<T>(work: () => Promise<T>) {
    if (actionLock.current) throw new Error('请等待当前操作完成');
    const owner = ownerId; actionLock.current = true; setBusy(true); setError('');
    try { return await work(); } catch (e) { if (active(owner)) setError(e instanceof Error ? e.message : '操作失败'); throw e; } finally { actionLock.current = false; if (active(owner)) setBusy(false); }
  }
  async function importMaterial(file?: File, url?: string) {
    return act(async () => {
      await flush(); const owner = ownerId;
      const storageKey = `resulab.project-import:${owner}`, signature = file ? `${file.name}:${file.size}:${file.lastModified}` : String(url), previous = JSON.parse(localStorage.getItem(storageKey) || 'null');
      const op = previous?.signature === signature ? previous : { signature, key: crypto.randomUUID(), sessionId: crypto.randomUUID(), sessionKey: crypto.randomUUID() };
      op.cancelled = false;
      localStorage.setItem(storageKey, JSON.stringify(op));
      const control = new AbortController(); importController.current = control; setReading(true);
      let m: ProjectMaterial;
      try {
      if (op.materialId) m = await request<ProjectMaterial>(`/materials/${op.materialId}`);
      else if (file) {
        const base = (import.meta.env.VITE_AGENT_API_BASE || 'http://localhost:8788').replace(/\/$/, '');
        const response = await fetch(`${base}/api/career/projects/materials/upload?name=${encodeURIComponent(file.name)}`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/zip', 'Idempotency-Key': op.key }, body: file, signal: AbortSignal.any([abort.current.signal, control.signal, AbortSignal.timeout(60000)]) });
        const body = await response.json(); if (!response.ok) throw new Error(body.error?.message || '项目读取失败'); m = body;
      } else m = await careerRequest<ProjectMaterial>(token!, '/projects/materials/repository', { url, idempotencyKey: op.key }, 'POST', AbortSignal.any([abort.current.signal, control.signal]));
      if (!active(owner) || control.signal.aborted) return;
      op.materialId = m.id; localStorage.setItem(storageKey, JSON.stringify(op));
      const s = await request<ProjectSession>('/sessions', { materialId: m.id, sessionId: op.sessionId, idempotencyKey: op.sessionKey });
      if (!active(owner) || control.signal.aborted) return; pending.current = {}; operation.current = null; present(s); setMaterial(m); localStorage.setItem(`resulab.project-current:${ownerId}`, s.id); localStorage.removeItem(storageKey); await list();
      } finally { if (active(owner)) setReading(false); importController.current = null; }
    });
  }
  async function command<T = unknown>(action: string, data: object = {}, method = 'POST'): Promise<T> {
    return act(async () => {
      await flush(); const s = live.current; if (!s) throw new Error('请先提供项目材料'); const owner = ownerId;
      const opKey = `resulab.project-command:${owner}`, signature = JSON.stringify({ sessionId: s.id, action, data, revision: s.revision });
      const saved = JSON.parse(localStorage.getItem(opKey) || 'null');
      const idempotencyKey = saved?.signature === signature ? saved.idempotencyKey : crypto.randomUUID(); localStorage.setItem(opKey, JSON.stringify({ signature, idempotencyKey }));
      const result = await request<T>(`/sessions/${s.id}${action ? '/' + action : ''}`, { ...data, expectedRevision: s.revision, idempotencyKey }, method);
      if (active(owner)) { await load(s.id); await list(); localStorage.removeItem(opKey); } return result;
    });
  }
  async function removeMaterial() {
    return act(async () => { const s = live.current; if (!s) return; pending.current = {}; localStorage.removeItem(key(s)); await request(`/materials/${s.materialId}/delete`, { expectedRevision: s.revision, idempotencyKey: crypto.randomUUID() }); await load(s.id); await list(); });
  }
  async function resumeMaterial(id: string) { return act(async () => { await flush(); const storageKey = `resulab.project-resume:${ownerId}:${id}`, saved = JSON.parse(localStorage.getItem(storageKey) || 'null') || { sessionId: crypto.randomUUID(), idempotencyKey: crypto.randomUUID() }; localStorage.setItem(storageKey, JSON.stringify(saved)); const s = await request<ProjectSession>('/sessions', { materialId: id, ...saved }); await load(s.id); await list(); localStorage.removeItem(storageKey); }); }
  async function removeUnattached(id: string) { return act(async () => { await request(`/materials/${id}/delete`, { expectedRevision: 1, idempotencyKey: crypto.randomUUID() }); await list(); }); }
  async function saveLocalCopy() {
    return act(async () => {
      await working.current?.catch(() => {}); const s = live.current; if (!s) return;
      const body = { ...operation.current?.edit, ...pending.current, expectedRevision: s.revision }, storageKey = `resulab.project-copy:${ownerId}`;
      const signature = JSON.stringify({ session: s.id, body }), previous = JSON.parse(localStorage.getItem(storageKey) || 'null');
      const op = previous?.signature === signature ? previous : { signature, sessionId: crypto.randomUUID(), idempotencyKey: crypto.randomUUID() }; localStorage.setItem(storageKey, JSON.stringify(op));
      const copied = await request<ProjectSession>(`/sessions/${s.id}/copy`, { ...body, sessionId: op.sessionId, idempotencyKey: op.idempotencyKey });
      if (!active(ownerId)) return; pending.current = {}; operation.current = null; localStorage.removeItem(key(s)); localStorage.removeItem(storageKey); await load(copied.id); await list();
    });
  }
  const cancelImport = () => { const storageKey = `resulab.project-import:${ownerId}`; const op = JSON.parse(localStorage.getItem(storageKey) || 'null'); if (op) localStorage.setItem(storageKey, JSON.stringify({ ...op, cancelled: true })); importController.current?.abort(); };
  return { session, material, sessions, unattached, error, busy, reading, cancelImport, saveState, edit, flush, load, command, importMaterial, removeMaterial, resumeMaterial, removeUnattached, saveLocalCopy, refresh: async () => { if (live.current) await load(live.current.id); else await list(); } };
}
