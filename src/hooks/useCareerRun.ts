import { useEffect, useRef, useState } from 'react';
import { careerRequest } from '../utils/careerStore';
import type { CareerRunView } from '../../shared/careerEntries';

export function useCareerRun(ownerId: string, token?: string) {
  const [run, setRun] = useState<CareerRunView | null>(null), [error, setError] = useState('');
  const [runOwner, setRunOwner] = useState('');
  const [refresh, setRefresh] = useState(0);
  const current = useRef({ ownerId, token }); current.current = { ownerId, token };
  const controller = useRef<AbortController>();
  useEffect(() => { setRun(null); setError(''); }, [ownerId, token]);
  useEffect(() => {
    const abort = new AbortController(); controller.current = abort; let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      let keepPolling = false;
      try {
        const id = localStorage.getItem(`resulab.career-run:${ownerId}`);
        if (id && token) {
          const value = await careerRequest<CareerRunView>(token, `/runs/${id}`, undefined, undefined, abort.signal);
          if (!abort.signal.aborted && current.current.ownerId === ownerId && localStorage.getItem(`resulab.career-run:${ownerId}`) === id) { setRun(value); setRunOwner(ownerId); setError(''); keepPolling = ['queued', 'running'].includes(value.status); }
        }
      } catch (err) { if (!abort.signal.aborted) setError(err instanceof Error ? err.message : '任务读取失败'); }
      if (!abort.signal.aborted && keepPolling) timer = setTimeout(poll, 2500);
    }
    void poll();
    return () => { abort.abort(); clearTimeout(timer); };
  }, [ownerId, token, refresh]);
  async function command(path: string, input: object) {
    if (!token) throw new Error('请先登录');
    const expected = ownerId, signature = JSON.stringify({ path, input }), key = `resulab.career-command:${ownerId}`;
    let idempotencyKey = crypto.randomUUID();
    const pending = JSON.parse(localStorage.getItem(key) || 'null');
    if (pending?.signature === signature) idempotencyKey = pending.idempotencyKey;
    localStorage.setItem(key, JSON.stringify({ signature, idempotencyKey }));
    const response = await careerRequest<{ runId: string }>(token, path, { ...input, idempotencyKey }, 'POST', controller.current?.signal);
    if (current.current.ownerId !== expected || current.current.token !== token) return;
    localStorage.setItem(`resulab.career-run:${ownerId}`, response.runId); localStorage.removeItem(key);
    const value = await careerRequest<CareerRunView>(token, `/runs/${response.runId}`, undefined, undefined, controller.current?.signal);
    if (current.current.ownerId === expected) { setRun(value); setRunOwner(expected); setRefresh(v => v + 1); }
  }
  async function restore(id: string) {
    if (!token) return;
    const expected = ownerId, value = await careerRequest<CareerRunView>(token, `/runs/${id}`, undefined, undefined, controller.current?.signal);
    if (current.current.ownerId === expected) { localStorage.setItem(`resulab.career-run:${ownerId}`, id); setRun(value); setRunOwner(expected); setRefresh(v => v + 1); }
  }
  return { run: runOwner === ownerId ? run : null, error, command, restore };
}
