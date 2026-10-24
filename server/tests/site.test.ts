import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createSiteApp, legacyEnvironment } from '../src/site.js';
import { loadConfig } from '../src/config.js';

test('unified site dispatches APIs without SPA fallback, serves downloads and protects missing files', async () => {
  const root = await mkdtemp(join(tmpdir(), 'resulab-site-'));
  try {
    await mkdir(join(root, 'downloads')); await mkdir(join(root, 'assets'));
    await writeFile(join(root, 'index.html'), '<h1>Synthetic ResuLab</h1>');
    await writeFile(join(root, 'downloads', 'extension.zip'), 'PK-synthetic');
    await writeFile(join(root, 'assets', 'app.js'), '// synthetic');
    const app = createSiteApp({ staticRoot: root, agent: req => Response.json({ service: 'agent', path: new URL(req.url).pathname }), legacy: req => Response.json({ service: 'legacy', path: new URL(req.url).pathname }, { status: req.headers.has('Authorization') ? 200 : 401 }) });
    for (const url of ['/api/health', '/api/agent/runs']) {
      const response = await app.request(url); assert.equal((await response.json()).service, 'agent'); assert.equal(response.headers.get('cache-control'), 'no-store');
    }
    for (const url of ['/api/ai/job-match', '/api/ai/tailor', '/api/not-found']) { const response = await app.request(url); assert.equal(response.status, 401); assert.equal((await response.json()).service, 'legacy'); }
    assert.deepEqual(await (await app.request('/api/ai/health')).json(), { service: 'legacy', path: '/api/health' });
    const download = await app.request('/downloads/extension.zip'); assert.equal(await download.text(), 'PK-synthetic'); assert.equal(download.headers.get('content-disposition'), 'attachment');
    for (const url of ['/downloads/missing.zip', '/assets/missing.js', '/missing.json', '/.env']) assert.equal((await app.request(url)).status, 404);
    for (const url of ['/jobs', '/extension', '/builder/professional']) assert.match(await (await app.request(url)).text(), /Synthetic ResuLab/);
    assert.equal((await app.request('/assets/app.js')).headers.get('cache-control'), 'public, max-age=31536000, immutable');
    assert.equal((await app.request('/jobs', { method: 'POST' })).status, 405);
    assert.equal((await app.request('/api/ai/tailor', { method: 'POST', body: 'x'.repeat(512*1024+1) })).status, 413);
  } finally { await rm(root, { recursive: true, force: true }); }
});
test('legacy API reuses server-only model and Supabase settings', () => {
  const env = legacyEnvironment(loadConfig({ SUPABASE_URL: 'https://fixture.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-secret', MODEL_API_KEY: 'synthetic-model', MODEL_ID: 'fixture-model', MODEL_BASE_URL: 'https://provider.example/v1', MODEL_THINKING: 'disabled' }));
  assert.equal(env.PLATFORM_API_KEY, 'synthetic-model'); assert.equal(env.DEEPSEEK_MODEL, 'fixture-model'); assert.equal(env.SUPABASE_SERVICE_ROLE_KEY, 'synthetic-secret'); assert.equal(env.DEEPSEEK_THINKING, 'disabled');
});
