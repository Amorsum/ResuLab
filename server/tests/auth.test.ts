import { test } from 'node:test';
import assert from 'node:assert/strict';
import { authenticatedUserId, boundedAuthFetch } from '../src/auth.js';
import { AgentError } from '../src/errors.js';
import { localProxyEnvironment } from '../scripts/local-proxy.js';
import { createApp } from '../src/app.js';
import { testConfig } from './helpers.js';

test('auth distinguishes network/reset/timeout/429/5xx from invalid sessions without leaking upstream details', async () => {
  for (const error of [
    { name: 'AuthRetryableFetchError', status: 0 }, { name: 'AuthApiError', status: 503 },
    { name: 'AuthApiError', status: 429 },
  ]) {
    await assert.rejects(authenticatedUserId(async () => ({ data: { user: null }, error }), 'synthetic'),
      (e: unknown) => e instanceof AgentError && e.status === 503 && e.code === 'AUTH_UNAVAILABLE' && e.retryable);
  }
  await assert.rejects(authenticatedUserId(async () => { throw new Error('private-url-and-token'); }, 'synthetic'),
    (e: unknown) => e instanceof AgentError && e.status === 503 && !e.message.includes('private-url-and-token'));
  await assert.rejects(authenticatedUserId(async () => ({ data: { user: null }, error: { name: 'AuthApiError', status: 401 } }), 'synthetic'),
    (e: unknown) => e instanceof AgentError && e.status === 401 && e.code === 'UNAUTHENTICATED');
  assert.equal(await authenticatedUserId(async () => ({ data: { user: { id: 'verified-owner' } }, error: null }), 'synthetic'), 'verified-owner');
});

test('career auth outage returns browser-readable 503 without touching entry storage', async () => {
  let writes = 0;
  const app = createApp({ config: testConfig(), modelReady: false, store: { rpc: async () => { writes++; throw new Error('must not run'); } },
    authenticate: token => authenticatedUserId(async () => ({ data: { user: null }, error: { name: 'AuthRetryableFetchError', status: 0 } }), token) });
  const response = await app.request('/api/career/entries', { headers: { Authorization: 'Bearer synthetic', Origin: 'http://localhost:3000' } });
  assert.equal(response.status, 503); assert.equal(writes, 0);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), 'http://localhost:3000');
  assert.equal((await response.json() as { error: { code: string } }).error.code, 'AUTH_UNAVAILABLE');
});

test('Windows development uses enabled system proxies only without overriding explicit settings', () => {
  const settings = () => ({ enabled: true, server: '127.0.0.1:7890' });
  const result = localProxyEnvironment({}, 'win32', settings);
  assert.equal(result.HTTPS_PROXY, 'http://127.0.0.1:7890/');
  assert.match(result.NO_PROXY!, /127\.0\.0\.1/);
  const protocols = localProxyEnvironment({}, 'win32', () => ({ enabled: true, server: 'http=127.0.0.1:7000;https=127.0.0.1:7001' }));
  assert.equal(protocols.HTTP_PROXY, 'http://127.0.0.1:7000/'); assert.equal(protocols.HTTPS_PROXY, 'http://127.0.0.1:7001/');
  const explicit = { HTTPS_PROXY: 'http://configured.invalid:8000', NO_PROXY: 'custom.invalid' };
  assert.equal(localProxyEnvironment(explicit, 'win32', () => { throw new Error('must not query Windows'); }), explicit);
  const original = {};
  assert.equal(localProxyEnvironment(original, 'linux', settings), original);
  assert.equal(localProxyEnvironment(original, 'win32', () => ({ enabled: false, server: '127.0.0.1:7890' })), original);
  assert.equal(localProxyEnvironment(original, 'win32', () => ({ enabled: true, server: 'socks5://127.0.0.1:7890' })), original);
});

test('bounded auth fetch combines caller cancellation with a timeout signal and preserves the bearer request', async () => {
  const original = globalThis.fetch, controller = new AbortController();
  try {
    globalThis.fetch = (async (_input, init) => {
      assert.equal(new Headers(init!.headers).get('Authorization'), 'Bearer synthetic');
      assert.ok(init!.signal); controller.abort(); assert.equal(init!.signal!.aborted, true);
      return Response.json({});
    }) as typeof fetch;
    await boundedAuthFetch('https://fixture.invalid/auth/v1/user', { headers: { Authorization: 'Bearer synthetic' }, signal: controller.signal });
  } finally { globalThis.fetch = original; }
});
