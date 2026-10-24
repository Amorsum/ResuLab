const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { buildSync } = require('esbuild');
const code = buildSync({ entryPoints: [path.join(__dirname, '../workers/src/index.ts')], bundle: true, write: false, format: 'cjs', platform: 'browser', target: 'es2022' }).outputFiles[0].text;
const input = { jdText: '使用 TypeScript 开发页面并编写测试。', facts: [{ id: 's1', section: 'skills', data: { id: 's1', skillName: 'TypeScript', category: '', level: '掌握' }, sourceTitle: '合成', doNotClaim: '' }] };
const plan = { roleTitle: '前端开发', requirements: [{ id: 'r1', text: 'TypeScript', jdQuote: 'TypeScript', required: true, coverage: 'supported', gap: '' }], selected: [{ factId: 's1', requirementIds: ['r1'], reason: '真实技能' }] };
function worker(fetch) { const module = { exports: {} }; new Function('module', 'exports', 'fetch', code)(module, module.exports, fetch); return module.exports.default; }
const env = { SUPABASE_URL: 'https://fixture.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'fixture', PLATFORM_API_KEY: 'fixture' };
function request(value = input, auth = true) { return new Request('https://api.test/api/ai/job-match', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: 'Bearer fixture' } : {}) }, body: JSON.stringify(value) }); }
test('job-match requires auth, enforces bounds, validates model output and performs no writing/database usage calls', async () => {
  let calls = 0; const service = worker(async url => {
    if (url.endsWith('/auth/v1/user')) return Response.json({ id: '00000000-0000-4000-8000-000000000001' });
    if (url.endsWith('/chat/completions')) { calls++; return Response.json({ choices: [{ message: { content: JSON.stringify(plan) } }] }); }
    assert.fail('Unexpected upstream ' + url);
  });
  assert.equal((await service.fetch(request(input, false), env)).status, 401);
  assert.equal((await service.fetch(request({ ...input, jdText: 'x'.repeat(12001) }), env)).status, 400);
  const response = await service.fetch(request(), env); assert.equal(response.status, 200); assert.equal(response.headers.get('Access-Control-Allow-Origin'), '*');
  const result = await response.json(); assert.equal(result.plan.selected[0].factId, 's1'); assert.equal(result.modelCalls, 1); assert.equal(calls, 1); assert.equal('snapshot' in result, false);
});
