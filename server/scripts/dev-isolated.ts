// Local integration uses real authentication/model calls and an isolated local DB.
// It never claims or changes jobs in the shared Supabase Agent database.
import 'dotenv/config';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { parse } from 'dotenv';
import { resolve } from 'node:path';
import { serve } from '@hono/node-server';
import { createClient } from '@supabase/supabase-js';
import { database } from '../tests/helpers.js';
import { loadConfig, readiness } from '../src/config.js';
import { configureEnvironmentProxy } from '../src/network.js';
import { createApp } from '../src/app.js';
import { openAIProvider } from '../src/provider.js';
import { startScheduler } from '../src/engine.js';
import { authenticatedUserId, boundedAuthFetch } from '../src/auth.js';
import { localProxyEnvironment } from './local-proxy.js';

const proxyEnv = localProxyEnvironment(process.env);
configureEnvironmentProxy(proxyEnv);
if (proxyEnv !== process.env) console.log('本地后端已沿用 Windows 系统代理，仅作用于此进程。');
const apiPort = process.env.CAREER_API_PORT || '8788', webPort = process.env.CAREER_WEB_PORT || '3010';
const config = loadConfig({ ...process.env, HOST: '127.0.0.1', PORT: apiPort, NODE_ENV: 'development', ALLOWED_ORIGINS: `http://127.0.0.1:3000,http://localhost:3000,http://127.0.0.1:${webPort},http://localhost:${webPort}` });
const frontend: Record<string, string> = {};
for (const file of ['../.env', '../.env.local']) if (existsSync(file)) Object.assign(frontend, parse(await readFile(file)));
const authUrl = config.SUPABASE_URL || frontend.VITE_SUPABASE_URL;
const authKey = frontend.VITE_SUPABASE_ANON_KEY || config.SUPABASE_SERVICE_ROLE_KEY;
if (!authUrl || !authKey) throw new Error('本地登录需要 .env 中既有 Supabase 公开配置；不会访问原 Agent 服务器。');
if (config.SUPABASE_URL && frontend.VITE_SUPABASE_URL && config.SUPABASE_URL !== frontend.VITE_SUPABASE_URL) throw new Error('前后端 Supabase 项目不一致，请先核对本地配置。');
const directory = resolve('.local-agent');
const { db, store } = await database(directory, !existsSync(directory));
if (!(await db.query<{ name: string | null }>("select to_regclass('public.resumes') as name")).rows[0].name) await db.exec(await readFile('../supabase/migrations/202610240002_legacy_web.sql', 'utf8'));
if (!(await db.query<{ name: string | null }>("select to_regclass('public.career_entries') as name")).rows[0].name) await db.exec(await readFile('../supabase/migrations/202610260001_career_library.sql', 'utf8'));
await db.exec(await readFile(new URL('../migrations/project-workspace.sql', import.meta.url), 'utf8'));
const client = createClient(authUrl, authKey, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: boundedAuthFetch } });
const modelReady = readiness(config).model;
const app = createApp({ config, store, modelReady, authenticate: async token => {
  const userId = await authenticatedUserId(value => client.auth.getUser(value), token);
  await db.query('insert into auth.users(id) values($1) on conflict do nothing', [userId]);
  return userId;
} });
const scheduler = modelReady ? startScheduler(store, openAIProvider(config, store), config) : undefined;
const server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: config.PORT }, () => console.log(`本地经历库后端：http://127.0.0.1:${config.PORT}（独立 PGlite，真实登录；${modelReady ? '真实模型已配置' : '未配置模型，手动流程可用'}）`));
let stopping = false;
async function shutdown() {
  if (stopping) return; stopping = true;
  await new Promise<void>(resolve => server.close(() => resolve()));
  await scheduler?.stop(); await db.close(); process.exit(0);
}
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => { void shutdown(); });
process.on('message', message => { if (message === 'resulab-local-stop') void shutdown(); });
