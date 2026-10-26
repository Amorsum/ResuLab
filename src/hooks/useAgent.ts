import { useEffect, useRef, useState } from 'react';
import { answerRunSchema, createRunSchema } from '../../shared/agent.schema';
import { resumeRevision, snapshotFromResume, sha256, type CreateRunInput, type RunView } from '../../shared/agent';
import { useAuth } from './useAuth';
import { AgentApiError, agentRequest } from '../utils/agentApi';
import type { ResumeData } from '../types/resume';

export const AGENT_MOCK = import.meta.env.DEV && import.meta.env.VITE_AGENT_MOCK === 'true';
const base = import.meta.env.VITE_AGENT_API_BASE?.trim();
const configError = base === undefined ? '尚未配置 Agent 服务地址，请设置 VITE_AGENT_API_BASE 并重启开发服务器。' : '';
const storage = {
  read(key: string) { try { return localStorage.getItem(key); } catch { return null; } },
  write(key: string, value: string) { try { localStorage.setItem(key, value); } catch { /* Storage may be unavailable. */ } },
  remove(key: string) { try { localStorage.removeItem(key); } catch { /* optional */ } },
};
export function useAgent() {
  const { session, loading: authLoading } = useAuth();
  const identity = AGENT_MOCK ? 'development-mock' : session?.user.id ?? '';
  const latest = useRef({ identity, token: session?.access_token });
  latest.current = { identity, token: session?.access_token };
  const [owner, setOwner] = useState(identity);
  const [runId, setRunId] = useState<string | null>(null);
  const [run, setRun] = useState<RunView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AgentApiError | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const operation = useRef<AbortController | null>(null);
  const polling = useRef<AbortController | null>(null);
  const locked = useRef(false);
  const retryOperation = useRef<null | (() => Promise<void>)>(null);
  const mockRun = useRef<RunView | null>(null);
  const active = owner === identity;
  const index = `resulab.agent.run:${identity}`;
  function failure(err: unknown) {
    return err instanceof AgentApiError ? err : new AgentApiError(err instanceof Error && err.name === 'AbortError' ? '请求已超时或取消。任务可能仍在执行，可恢复查询或重发同一次操作。' : '连接失败，请确认本机 Agent 服务已启动后重试。');
  }
  useEffect(() => {
    operation.current?.abort(); operation.current = null; polling.current?.abort(); polling.current = null; locked.current = false;
    setOwner(identity); setRun(null); setError(null); setBusy(false); setDrafts({}); retryOperation.current = null;
    const saved = identity && !AGENT_MOCK ? storage.read(index) : null;
    setRunId(saved && /^[a-f0-9-]{36}$/i.test(saved) ? saved : null);
    return () => { operation.current?.abort(); polling.current?.abort(); };
  }, [identity, index]);
  useEffect(() => {
    if (!active || !runId || !identity || AGENT_MOCK || configError) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      const controller = new AbortController(); polling.current = controller;
      const timeout = setTimeout(() => controller.abort(), 30000);
      try {
        const view = await agentRequest(base!, `/runs/${runId}`, latest.current.token ?? '', controller.signal) as RunView;
        if (view.runId !== runId) throw new AgentApiError('返回的任务标识不匹配，已停止查询。');
        if (stopped || polling.current !== controller) return;
        setRun(view); setError(null);
        if (view.status === 'queued' || view.status === 'running') timer = setTimeout(poll, 1500);
      } catch (err) {
        if (!stopped && polling.current === controller) setError(failure(err));
      } finally { clearTimeout(timeout); }
    }
    void poll();
    return () => { stopped = true; clearTimeout(timer); polling.current?.abort(); };
  }, [runId, identity, active, refresh]);
  useEffect(() => {
    if (!active || !runId) return;
    try {
      const saved = JSON.parse(sessionStorage.getItem(`resulab.agent.answers:${identity}:${runId}`) ?? '{}');
      setDrafts(Object.fromEntries(Object.entries(saved).filter(([, value]) => typeof value === 'string')) as Record<string, string>);
    } catch { setDrafts({}); }
  }, [runId, identity, active]);
  function setDraft(id: string, value: string) {
    setDrafts(previous => {
      const next = { ...previous, [id]: value };
      try { sessionStorage.setItem(`resulab.agent.answers:${identity}:${runId}`, JSON.stringify(next)); } catch { /* optional */ }
      return next;
    });
  }
  async function execute(path: string, body: unknown) {
    if (locked.current) return;
    if (!identity || !latest.current.token) { setError(new AgentApiError('请先登录后再分析。', 401)); return; }
    if (configError) { setError(new AgentApiError(configError)); return; }
    const user = identity;
    const controller = new AbortController(); operation.current = controller;
    locked.current = true; setBusy(true); setError(null);
    const timeout = setTimeout(() => controller.abort(), 30000);
    retryOperation.current = () => execute(path, body);
    try {
      const result = await agentRequest(base!, path, latest.current.token!, controller.signal, body);
      if (latest.current.identity !== user || controller.signal.aborted || operation.current !== controller) return;
      storage.write(index, result.runId); setRunId(result.runId); setRefresh(value => value + 1);
      retryOperation.current = null;
    } catch (err) {
      if (latest.current.identity !== user || operation.current !== controller) return;
      const problem = failure(err); setError(problem);
      if (problem.status === 409 && runId) setRefresh(value => value + 1);
    } finally {
      clearTimeout(timeout);
      if (latest.current.identity === user && operation.current === controller) { locked.current = false; setBusy(false); }
    }
  }
  async function create(jdText: string, resume: ResumeData) {
    if (locked.current) return;
    try {
      const resumeSnapshot = snapshotFromResume(resume);
      const revision = await resumeRevision(resume);
      const fingerprint = await sha256({ jdText: jdText.trim(), resumeSnapshot });
      if (latest.current.identity !== identity) return;
      const keyStore = `resulab.agent.create:${identity}`;
      let prior: { fingerprint?: string; key?: string } = {};
      try { prior = JSON.parse(storage.read(keyStore) ?? '{}'); } catch { /* new request */ }
      const key = prior.fingerprint === fingerprint && prior.key ? prior.key : crypto.randomUUID();
      const input: CreateRunInput = createRunSchema.parse({ jdText, resumeSnapshot, resumeRevision: revision, idempotencyKey: key });
      storage.write(keyStore, JSON.stringify({ fingerprint, key }));
      if (AGENT_MOCK) { await loadExample('awaiting_input', resume); return; }
      await execute('/runs', input);
    } catch { setError(new AgentApiError('请检查输入：岗位描述需 10—12000 字，单字段不超过 4000 字，条目 ID 不可重复。')); }
  }
  async function answer() {
    if (!run) return;
    try {
      const body = answerRunSchema.parse({ answers: run.questions.map(q => ({ questionId: q.id, answer: drafts[q.id] ?? q.answer ?? '' })), idempotencyKey: crypto.randomUUID() });
      if (AGENT_MOCK && mockRun.current) {
        const view = structuredClone(mockRun.current); view.status = 'completed';
        view.questions = view.questions.map(q => ({ ...q, answer: drafts[q.id] }));
        setRun(view); return;
      }
      await execute(`/runs/${run.runId}/answers`, body);
    } catch { setError(new AgentApiError('请回答当前所有问题；可以填写“没有做过”或“不清楚”，每题最多 2000 字。')); }
  }
  async function retry() {
    if (!run) return;
    if (AGENT_MOCK) { setRun({ ...run, status: 'completed', error: undefined }); return; }
    await execute(`/runs/${run.runId}/retry`, { idempotencyKey: crypto.randomUUID() });
  }
  async function loadExample(kind: 'running' | 'awaiting_input' | 'completed' | 'timeout' | 'missing', resume: ResumeData) {
    if (!AGENT_MOCK) return;
    const { agentExamples } = await import('../../shared/agent.examples');
    const view = structuredClone(agentExamples[kind]);
    view.runId = crypto.randomUUID(); view.resumeRevision = await resumeRevision(resume);
    const work = resume.workExperience.find(item => item.description.trim());
    // Bind a synthetic punctuation-only edit to the current resume; never invent a skill or metric.
    if (work) {
      const ref = { id: `resume:workExperience:${encodeURIComponent(work.id)}:description`, section: 'workExperience' as const, itemId: work.id, field: 'description', quote: work.description };
      view.evidence = kind === 'missing' ? view.evidence : [{ requirementId: view.requirements[0].id, coverage: 'needs_clarification', refs: [ref] }];
      const after = /。$/.test(work.description) ? work.description.slice(0, -1) : `${work.description}。`;
      const change: RunView['changes'][number] = { id: 'mock-change', target: { section: 'workExperience', itemId: work.id, field: 'description' }, before: work.description, after, reason: '合成流程样例：只调整句末标点，不新增事实。', sources: [{ kind: 'resume', refId: ref.id, quote: ref.quote }], needsConfirmation: true };
      view.changes = kind === 'completed' ? [change] : [];
      mockRun.current = { ...view, changes: [change] };
    } else { view.evidence = [{ requirementId: view.requirements[0].id, coverage: 'missing', refs: [] }]; view.changes = []; mockRun.current = view; }
    setRunId(view.runId); setRun(view); setError(null);
  }
  function newTask() {
    operation.current?.abort(); operation.current = null; locked.current = false; setBusy(false); polling.current?.abort(); polling.current = null; storage.remove(index); storage.remove(`resulab.agent.create:${identity}`);
    setRunId(null); setRun(null); setError(null); retryOperation.current = null;
  }
  return { run: active ? run : null, runId: active ? runId : null, busy: active && busy, error: active ? error : null,
    drafts: active ? drafts : {}, setDraft, create, answer, retry, loadExample, newTask, mock: AGENT_MOCK,
    configError: AGENT_MOCK ? '' : configError, authenticated: Boolean(identity), authLoading,
    refresh: () => { setError(null); setRefresh(value => value + 1); },
    resend: () => retryOperation.current?.(), canResend: active && Boolean(retryOperation.current),
  };
}
