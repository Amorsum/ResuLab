import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { testConfig } from './helpers.js';

test('model status exposes readiness/name without credentials or provider addresses', async () => {
  const config = testConfig();
  const app = createApp({ config, modelReady: true, authenticate: async () => 'verified-owner' });
  const response = await app.request('/api/health'); const body = await response.text();
  const value = JSON.parse(body);
  assert.equal(value.model.id, config.MODEL_ID); assert.equal(value.model.configured, true);
  assert.equal(body.includes(config.MODEL_API_KEY!), false); assert.equal(body.includes(config.MODEL_BASE_URL!), false);
  const hidden = createApp({ config: { ...config, MODEL_ID: 'sk-secret-looking-value' }, modelReady: true, authenticate: async () => 'verified-owner' });
  assert.equal((await (await hidden.request('/api/health')).json() as { model: { id: string | null } }).model.id, null);
});

test('missing model explains backend configuration before creating any career task', async () => {
  const app = createApp({ config: { ...testConfig(), NODE_ENV: 'development' }, modelReady: false, authenticate: async () => 'verified-owner',
    store: { rpc: async () => { throw new Error('must not persist or call model'); } } });
  const health = await (await app.request('/api/health')).json() as { model: { configured: boolean; id: string | null } };
  assert.deepEqual(health.model, { configured: false, id: null });
  const response = await app.request('/api/career/runs', { method: 'POST', headers: { Authorization: 'Bearer synthetic', 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(response.status, 503);
  const body = await response.json() as { error: { code: string; message: string } };
  assert.equal(body.error.code, 'CONFIG_MISSING'); assert.match(body.error.message, /后端尚未配置模型服务/); assert.match(body.error.message, /模型配置说明/);
});
