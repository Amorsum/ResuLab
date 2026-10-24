/** No automatic retries: generate/polish requests can consume model quota. */
export async function aiRequest<T>(base: string, path: string, init: RequestInit, fallback: string): Promise<T> {
  let response: Response;
  try { response = await fetch(`${base}${path}`, init); }
  catch { throw new Error('无法连接 AI 服务，请稍后重试；如持续出现请联系管理员。'); }
  if (response.status === 401) throw new Error('登录验证失败，请重新登录后再使用 AI 功能。');
  let body: unknown;
  try { body = await response.json(); }
  catch { throw new Error(response.ok ? 'AI 服务返回了无效数据，请稍后重试。' : fallback); }
  if (!response.ok) {
    const message = body && typeof body === 'object' && 'message' in body ? body.message : undefined;
    throw new Error(typeof message === 'string' && message ? message : fallback);
  }
  return body as T;
}
