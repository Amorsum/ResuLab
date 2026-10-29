import { AgentError } from './errors.js';

interface AuthLookupResult {
  data: { user: { id: string } | null };
  error: { name?: string; status?: number; code?: string } | null;
}

/** Network failures are not proof that the user's session expired. Never echo provider errors. */
export async function authenticatedUserId(lookup: (token: string) => Promise<AuthLookupResult>, token: string): Promise<string> {
  let result: AuthLookupResult;
  try { result = await lookup(token); }
  catch { throw new AgentError('AUTH_UNAVAILABLE', '暂时无法连接登录验证服务，请检查网络或代理后重试；不需要因此退出登录', 503, true); }
  const { data, error } = result;
  if (error || !data.user?.id) {
    const unavailable = error && (error.name === 'AuthRetryableFetchError' || error.status === 0 ||
      error.status === 429 || Boolean(error.status && error.status >= 500));
    if (unavailable) throw new AgentError('AUTH_UNAVAILABLE', '暂时无法连接登录验证服务，请检查网络或代理后重试；不需要因此退出登录', 503, true);
    throw new AgentError('UNAUTHENTICATED', '登录已失效，请重新登录后同步；本机经历仍保留', 401);
  }
  return data.user.id;
}

export const boundedAuthFetch: typeof fetch = (input, init) => fetch(input, { ...init, signal: AbortSignal.any([
  AbortSignal.timeout(10000), ...(init?.signal ? [init.signal] : []),
]) });
