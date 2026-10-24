// Local integration uses real authentication/model calls and an isolated local DB.
// It never claims or changes jobs in the shared Supabase Agent database.
import 'dotenv/config';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { serve } from '@hono/node-server';
import { createClient } from '@supabase/supabase-js';
import { database } from '../tests/helpers.js';
import { loadConfig } from '../src/config.js';
import { configureEnvironmentProxy } from '../src/network.js';
import { createApp } from '../src/app.js';
import { AgentError } from '../src/errors.js';
import { openAIProvider } from '../src/provider.js';
import { startScheduler } from '../src/engine.js';

configureEnvironmentProxy();
const config = loadConfig({ ...process.env, HOST: '127.0.0.1', PORT: '8788', NODE_ENV: 'development', ALLOWED_ORIGINS: 'http://127.0.0.1:3000,http://localhost:3000' });
if (!config.SUPABASE_URL || !config.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Configure server/.env before local integration.');
const directory = resolve('.local-agent');
const { db, store } = await database(directory, !existsSync(directory));
const client = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const app = createApp({ config, store, modelReady: Boolean(config.MODEL_API_KEY && config.MODEL_ID && config.MODEL_BASE_URL), authenticate: async token => {
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) throw new AgentError('UNAUTHENTICATED', '请重新登录后重试', 401);
  await db.query('insert into auth.users(id) values($1) on conflict do nothing', [data.user.id]);
  return data.user.id;
} });
const scheduler = startScheduler(store, openAIProvider(config, store), config);
const server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 8788 }, () => console.log('Local Agent ready on 127.0.0.1:8788 (isolated PGlite; real auth/model)'));
let stopping = false;
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, async () => {
  if (stopping) return; stopping = true;
  server.close(); await scheduler.stop(); await db.close(); process.exit(0);
});
