const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const source = fs.readFileSync(require('node:path').join(__dirname, '../src/index.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const env = { SUPABASE_URL: 'https://expected-project.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'server-only-fixture', PLATFORM_API_KEY: 'model-only-fixture' };
const userId = '00000000-0000-4000-8000-00000000000a';
const response = (body, status = 200) => new Response(JSON.stringify(body), { status });
function worker(upstream = async () => { throw new Error('Unexpected upstream'); }) {
  const module = { exports: {} };
  new Function('module', 'exports', 'fetch', compiled)(module, module.exports, upstream);
  return module.exports.default;
}
const request = (path, options = {}) => new Request('https://api.example.invalid' + path, {
  method: 'POST', headers: { Origin: 'https://resulab.amorsum.top', 'Content-Type': 'application/json', Authorization: 'Bearer current-project-user' },
  body: JSON.stringify({ rawText: '这是一段用于接口验收的合成经历文本，不含真实个人信息。' }), ...options,
});
function cors(result) {
  assert.equal(result.headers.get('Access-Control-Allow-Origin'), '*');
  assert.match(result.headers.get('Access-Control-Allow-Headers'), /Authorization/i);
}

test('preflight, missing token and rejected token all have browser-readable CORS headers', async () => {
  const service = worker(async () => response({ message: 'invalid JWT' }, 401));
  const preflight = await service.fetch(request('/api/ai/generate', { method: 'OPTIONS', body: undefined }), env);
  assert.equal(preflight.status, 204); cors(preflight);
  for (const headers of [{ Origin: 'https://resulab.amorsum.top' }, { Authorization: 'Bearer rejected' }]) {
    const result = await service.fetch(request('/api/ai/generate', { headers }), env);
    assert.equal(result.status, 401); cors(result);
    assert.equal((await result.json()).error, 'UNAUTHORIZED');
  }
});
test('authentication uses the configured Supabase project, user bearer token and server-only apikey', async () => {
  const seen = [];
  const service = worker(async (url, init) => {
    seen.push({ url, init });
    if (url.endsWith('/auth/v1/user')) return response({ id: userId });
    if (url.includes('/memberships?')) return response([{ tier: 'free', status: 'active' }]);
    return response([]);
  });
  const result = await service.fetch(request('/api/membership/status', { method: 'GET', body: undefined }), env);
  assert.equal(result.status, 200); cors(result);
  assert.equal(seen[0].url, env.SUPABASE_URL + '/auth/v1/user');
  assert.equal(seen[0].init.headers.Authorization, 'Bearer current-project-user');
  assert.equal(seen[0].init.headers.apikey, env.SUPABASE_SERVICE_ROLE_KEY);
  assert.equal((await result.json()).usage.generate.limit, 3);
});
test('quota errors retain status, message and CORS and never reach the model', async () => {
  const service = worker(async (url) => {
    if (url.endsWith('/auth/v1/user')) return response({ id: userId });
    if (url.includes('/memberships?')) return response([{ tier: 'free', status: 'active' }]);
    if (url.includes('/ai_usage_logs?')) return response([{ id: 1 }, { id: 2 }, { id: 3 }]);
    throw new Error('Model must not be called');
  });
  const result = await service.fetch(request('/api/ai/generate'), env);
  assert.equal(result.status, 429); cors(result);
  assert.equal((await result.json()).error, 'USAGE_LIMIT_REACHED');
});
test('missing configuration and auth dependency failures are distinct from an expired login', async () => {
  const unconfigured = await worker().fetch(request('/api/ai/generate'), {});
  assert.equal(unconfigured.status, 503); cors(unconfigured);
  assert.equal((await unconfigured.json()).error, 'CONFIG_MISSING');
  for (const upstream of [async () => { throw new Error('private URL and secret'); }, async () => response({}, 500), async () => new Response('invalid JSON')]) {
    const result = await worker(upstream).fetch(request('/api/ai/generate'), env);
    assert.equal(result.status, 503); cors(result);
    assert.doesNotMatch(await result.text(), /private URL|server-only-fixture|invalid JSON/);
  }
});
test('missing membership tables are reported with CORS without exposing upstream details', async () => {
  const service = worker(async (url) => url.endsWith('/auth/v1/user') ? response({ id: userId }) : response({ code: 'PGRST205', secret: 'private upstream' }, 404));
  const result = await service.fetch(request('/api/ai/generate'), env);
  assert.equal(result.status, 503); cors(result);
  const body = await result.json();
  assert.equal(body.error, 'DATABASE_UNAVAILABLE');
  assert.doesNotMatch(JSON.stringify(body), /PGRST205|private upstream/);
});
test('authenticated generate completes both rounds, records usage and returns the existing import contract', async () => {
  let models = 0, writes = 0;
  const service = worker(async (url, init) => {
    if (url.endsWith('/auth/v1/user')) return response({ id: userId });
    if (url.includes('/memberships?')) return response([{ tier: 'free', status: 'active' }]);
    if (url.includes('/ai_usage_logs?')) return response([]);
    if (url.endsWith('/chat/completions')) {
      models++;
      return response({ choices: [{ message: { content: models === 1 ? JSON.stringify({ personalInfo: { jobTitle: '后端开发' }, skills: [{ skillName: 'TypeScript' }] }) : '具备TypeScript接口开发经历。' } }] });
    }
    if (url.endsWith('/ai_usage_logs') && init.method === 'POST') { writes++; return response([{ user_id: userId }]); }
    throw new Error('Unexpected call');
  });
  const result = await service.fetch(request('/api/ai/generate'), env);
  assert.equal(result.status, 200); cors(result);
  const body = await result.json();
  assert.equal(body.personalInfo.jobTitle, '后端开发');
  assert.equal(body.selfEvaluation, '具备TypeScript接口开发经历。');
  assert.equal(models, 2); assert.equal(writes, 1);
});
