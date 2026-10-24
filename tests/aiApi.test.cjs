const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const code = ts.transpileModule(fs.readFileSync(require('node:path').join(__dirname, '../src/utils/aiApi.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
function client(fetcher) {
  const module = { exports: {} };
  new Function('module', 'exports', 'fetch', code)(module, module.exports, fetcher);
  return module.exports.aiRequest;
}
test('AI transport preserves endpoint, user authorization, JSON body and server result', async () => {
  const payload = { rawText: '合成经历' };
  const api = client(async (url, init) => {
    assert.equal(url, 'https://api.example.invalid/api/ai/generate');
    assert.equal(init.headers.Authorization, 'Bearer user-token');
    assert.deepEqual(JSON.parse(init.body), payload);
    return new Response(JSON.stringify({ skills: [] }));
  });
  assert.deepEqual(await api('https://api.example.invalid', '/api/ai/generate', { method: 'POST', headers: { Authorization: 'Bearer user-token' }, body: JSON.stringify(payload) }, '生成失败'), { skills: [] });
});
test('network failures show an actionable message without silently retrying a billable request', async () => {
  let calls = 0;
  const api = client(async () => { calls++; throw new TypeError('Failed to fetch'); });
  await assert.rejects(api('', '', {}, '生成失败'), /无法连接 AI 服务/);
  assert.equal(calls, 1);
});
test('expired login, usage limits and dependency failures remain distinct from network errors', async () => {
  for (const [status, body, expected] of [[401, {}, /重新登录/], [429, { message: '本月次数已用完' }, /本月次数已用完/], [503, { message: '登录验证服务暂时不可用' }, /登录验证服务暂时不可用/]]) {
    const api = client(async () => new Response(JSON.stringify(body), { status }));
    await assert.rejects(api('', '', {}, '生成失败'), expected);
  }
  await assert.rejects(client(async () => new Response('<html>proxy error</html>'))('', '', {}, '生成失败'), /返回了无效数据/);
});
