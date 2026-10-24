const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const code = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, '../workers/src/index.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function worker(fetch) {
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, fetch, Request, Response, Headers, URL });
  return module.exports.default;
}
const env = { SUPABASE_URL: 'https://database.example.test', SUPABASE_SERVICE_ROLE_KEY: 'test-server-key', PLATFORM_API_KEY: 'test-model-key' };
const request = (pathname, options = {}) => new Request(`https://api.example.test${pathname}`, {
  ...options, headers: { Origin: 'https://resulab.amorsum.top', ...options.headers },
});
function cors(response, status) {
  assert.equal(response.status, status);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), '*');
  assert.match(response.headers.get('Access-Control-Allow-Headers'), /Authorization/);
}
function authenticatedFetch({ usage = [], databaseError = false } = {}) {
  return async (input, init) => {
    const url = new URL(input);
    if (url.pathname === '/auth/v1/user') return Response.json({ id: 'test-user' });
    if (databaseError) throw new Error('database temporarily unavailable');
    if (url.pathname === '/rest/v1/memberships') return Response.json([{ tier: 'free', status: 'active' }]);
    if (url.pathname === '/rest/v1/ai_usage_logs') return Response.json(usage);
    if (url.pathname === '/v1/chat/completions') return Response.json({ choices: [{ message: { content: '保留原有事实的合成润色结果' } }] });
    throw new Error(`Unexpected test request: ${url.pathname}`);
  };
}

test('preflight permits the production bearer request without calling upstream', async () => {
  const w = worker(() => assert.fail('preflight must not authenticate'));
  const response = await w.fetch(request('/api/ai/generate', { method: 'OPTIONS' }), env);
  cors(response, 204);
  assert.match(response.headers.get('Access-Control-Allow-Methods'), /POST/);
  assert.equal(await response.text(), '');
});

test('missing authentication stays a readable 401 on every protected endpoint', async () => {
  const w = worker(() => assert.fail('missing bearer must not call upstream'));
  for (const [method, route] of [['GET', '/api/membership/status'], ['POST', '/api/ai/generate'], ['POST', '/api/ai/polish'], ['POST', '/api/ai/interview/start'], ['POST', '/api/ai/interview/respond']]) {
    const response = await w.fetch(request(route, { method }), env);
    cors(response, 401);
    assert.deepEqual(await response.json(), { error: 'UNAUTHORIZED', message: '请先登录' });
    assert.match(response.headers.get('Content-Type'), /application\/json/);
  }
});

test('rejected Supabase token exposes the original error without accepting the request', async () => {
  let calls = 0;
  const w = worker(async () => { calls++; return new Response(null, { status: 401 }); });
  const response = await w.fetch(request('/api/membership/status', { headers: { Authorization: 'Bearer invalid-test-token' } }), env);
  cors(response, 401);
  assert.equal((await response.json()).message, '登录已过期');
  assert.equal(calls, 1);
});

test('usage limit stays a readable 429 and never calls the model', async () => {
  const response = await worker(authenticatedFetch({ usage: [{ id: '1' }, { id: '2' }, { id: '3' }] })).fetch(request('/api/ai/generate', {
    method: 'POST', headers: { Authorization: 'Bearer valid-test-token' }, body: JSON.stringify({ rawText: '用于测试的足够长的合成经历文本，不发送任何个人信息。' }),
  }), env);
  cors(response, 429);
  assert.equal((await response.json()).error, 'USAGE_LIMIT_REACHED');
});

test('unexpected upstream failure stays a readable 500', async () => {
  const response = await worker(authenticatedFetch({ databaseError: true })).fetch(request('/api/membership/status', { headers: { Authorization: 'Bearer valid-test-token' } }), env);
  cors(response, 500);
  assert.equal((await response.json()).error, 'INTERNAL_ERROR');
});

test('successful authenticated polish preserves its response and CORS', async () => {
  const response = await worker(authenticatedFetch()).fetch(request('/api/ai/polish', {
    method: 'POST', headers: { Authorization: 'Bearer valid-test-token' }, body: JSON.stringify({ fieldLabel: '项目描述', currentValue: '合成经历' }),
  }), env);
  cors(response, 200);
  assert.deepEqual(await response.json(), { polished: '保留原有事实的合成润色结果' });
});

test('health and unknown route preserve their status and payload', async () => {
  const w = worker(() => assert.fail('public routes must not authenticate'));
  const health = await w.fetch(request('/api/health'), env);
  cors(health, 200);
  assert.equal((await health.json()).status, 'ok');
  const missing = await w.fetch(request('/not-found'), env);
  cors(missing, 404);
  assert.equal((await missing.json()).error, 'NOT_FOUND');
});
