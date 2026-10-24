const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildSync } = require('esbuild');
const path = require('node:path');
const source = buildSync({ entryPoints: [path.join(__dirname, '../workers/src/index.ts')], bundle: true, write: false, format: 'cjs', platform: 'node' }).outputFiles[0].text;
test('account deletion requires user session and exact confirmation, and only deletes the verified owner', async () => {
  const module = { exports: {} }; new Function('module', 'exports', source)(module, module.exports);
  const api = module.exports.default, oldFetch = global.fetch;
  const owner = '00000000-0000-4000-8000-000000000888', calls = [];
  global.fetch = async (url, init) => { calls.push({ url, method: init?.method }); return url.endsWith('/auth/v1/user') ? Response.json({ id: owner }) : new Response(null, { status: 204 }); };
  const env = { SUPABASE_URL: 'https://fixture.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-only' };
  const request = (body, token = 'synthetic') => api.fetch(new Request('https://resulab.amorsum.top/api/account/delete', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer '+token } : {}) }, body: JSON.stringify(body) }), env);
  try {
    assert.equal((await request({ confirmation: '确认注销' }, '')).status, 401); assert.equal(calls.length, 0);
    assert.equal((await request({ confirmation: 'no' })).status, 400);
    assert.equal((await request({ confirmation: '确认注销', userId: 'other-user' })).status, 400);
    assert.ok(calls.every(call => call.method !== 'DELETE'));
    assert.equal((await request({ confirmation: '确认注销' })).status, 200);
    assert.deepEqual(calls.filter(call => call.method === 'DELETE'), [{ url: `https://fixture.supabase.co/auth/v1/admin/users/${owner}`, method: 'DELETE' }]);
  } finally { global.fetch = oldFetch; }
});
