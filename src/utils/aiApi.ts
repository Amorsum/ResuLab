/** No automatic retries: generate/polish requests can start another model request. */
export async function aiRequest<T>(base: string, path: string, init: RequestInit, fallback: string): Promise<T> {
  let response: Response;
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (init.signal?.aborted) controller.abort();
  init.signal?.addEventListener('abort', abort, { once: true });
  let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 240000);
  try {
    try { response = await fetch(`${base}${path}`, { ...init, signal: controller.signal }); }
    catch {
      if (timedOut) throw new Error('AI 响应超过 4 分钟，已停止等待。经历仍保留；服务端可能仍在执行，重试会重新调用模型。');
      if (init.signal?.aborted) throw new Error('已取消等待');
      throw new Error('无法连接 AI 服务，请稍后重试；如持续出现请联系管理员。');
    }
    if (response.status === 401) throw new Error('登录验证失败，请重新登录后再使用 AI 功能。');
    let body: unknown;
    try { body = await response.json(); }
    catch {
      if (timedOut) throw new Error('AI 响应超过 4 分钟，已停止等待。经历仍保留；重试会重新调用模型。');
      if (init.signal?.aborted) throw new Error('已取消等待');
      throw new Error(response.ok ? 'AI 服务返回了无效数据，请稍后重试。' : fallback);
    }
    if (!response.ok) {
      const message = body && typeof body === 'object' && 'message' in body ? body.message : undefined;
      throw new Error(typeof message === 'string' && message ? message : fallback);
    }
    return body as T;
  } finally { clearTimeout(timeout); init.signal?.removeEventListener('abort', abort); }
}
