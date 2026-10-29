// Loopback-only, isolated synthetic acceptance. Never reads user resumes or remote DBs.
import 'dotenv/config';
import { serve } from '@hono/node-server';
import { createServer } from 'vite';
import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { database, ownerA, testConfig } from '../tests/helpers.js';
import { createApp } from '../src/app.js';
import { loadConfig, readiness } from '../src/config.js';
import { openAIProvider, type ModelProvider } from '../src/provider.js';
import { startScheduler } from '../src/engine.js';
import { AgentError } from '../src/errors.js';
import { configureEnvironmentProxy } from '../src/network.js';
import { localProxyEnvironment } from './local-proxy.js';
if (!process.argv.includes('--synthetic-only')) throw new Error('Requires --synthetic-only');
const real = process.argv.includes('--real-model');
if (real) configureEnvironmentProxy(localProxyEnvironment(process.env));
const root = resolve('..'), config = real ? loadConfig({ ...process.env, NODE_ENV: 'test', ALLOWED_ORIGINS: 'http://127.0.0.1:3206' }) : { ...testConfig(), MODEL_ID: 'synthetic-fixture', ALLOWED_ORIGINS: 'http://127.0.0.1:3206' };
if (real && !readiness(config).model) throw new Error('Real model is not configured');
const { db, store } = await database();
for (const file of ['supabase/migrations/202610240002_legacy_web.sql', 'supabase/migrations/202610260001_career_library.sql', 'server/migrations/project-workspace.sql']) await db.exec(await readFile(resolve(root, file), 'utf8'));
const jwt = `${Buffer.from('{}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: ownerA, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.${crypto.randomUUID()}`;
const user = { id: ownerA, email: 'project-fixture@example.invalid', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
const app = createApp({ config, store, modelReady: true, authenticate: async token => { if (token !== jwt) throw new AgentError('UNAUTHENTICATED', '仅接受本次合成验收会话', 401); return ownerA; } });
const fake: ModelProvider = { async generate(_run, _step, schema, instruction, data, signal, validate) {
  signal.throwIfAborted();
  const input = data as { files?: { path: string; startLine: number; text: string }[]; answers?: { role: string; actions: string }; draft?: Record<string, unknown>; field?: string };
  let value: unknown;
  if (instruction.includes('"findings"')) { const file = input.files![0], lines = file.text.split('\n'), index = Math.max(0, lines.findIndex(line => line.includes('TypeScript'))); value = { projectName: '合成团队查询项目', summary: '项目使用 TypeScript 实现查询接口，实际部署和个人贡献需要核实。', findings: [{ text: '材料描述了查询接口实现，尚不能认定个人贡献。', kind: file.path.endsWith('.md') ? 'documentation' : 'implementation', path: file.path, startLine: file.startLine + index, endLine: file.startLine + index, quote: lines[index] }], unknowns: ['部署计划尚未核实', '需要确认你负责的实现范围'] }; }
  else if (input.draft) { value = { ...input.draft, [input.field === 'summary' ? 'summary' : 'bullets']: input.field === 'summary' ? '面向课程演示的查询接口项目。' : ['使用 TypeScript 完成查询接口，并交付演示版本。'] }; }
  else value = { projectName: '合成团队查询项目', role: input.answers?.role || '', summary: '面向课程演示的团队查询项目。', bullets: [input.answers?.actions || '项目包含查询接口，个人负责部分待补充。'], techStack: ['TypeScript'] };
  const parsed = schema.parse(value); validate?.(parsed); return parsed;
} };
const scheduler = startScheduler(store, real ? openAIProvider(config, store) : fake, config);
app.get('/api/e2e/project-report', async c => c.json({ realModel: real, syntheticIdentity: true, entities: (await db.query('select kind,id,revision,payload from career_project_entities')).rows, entries: (await db.query('select payload from career_entries')).rows, calls: (await db.query('select model,status,input_tokens,output_tokens,error_code from agent_model_calls')).rows }));
const api = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 3205 });
const bootstrap = { access_token: jwt, refresh_token: 'synthetic-only', expires_at: Math.floor(Date.now() / 1000) + 3600, token_type: 'bearer', user };
const web = await createServer({ root, cacheDir: '.cache/vite-project-preview', optimizeDeps: { entries: ['index.html'] }, server: { host: '127.0.0.1', port: 3206, strictPort: true, open: false }, define: {
  'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('http://127.0.0.1:3206/supabase'), 'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify('synthetic-only'),
  'import.meta.env.VITE_AGENT_API_BASE': JSON.stringify('http://127.0.0.1:3205'), 'import.meta.env.VITE_AI_API_BASE': JSON.stringify('http://127.0.0.1:3205'), 'import.meta.env.VITE_CAREER_STORAGE': JSON.stringify('local'),
}, plugins: [{ name: 'project-isolated-fixture', configureServer(server) { server.middlewares.use((req, res, next) => { if (!req.url?.startsWith('/supabase/')) return next(); res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(req.url.includes('/auth/') ? user : [])); }); }, transformIndexHtml(html) { return html.replace('<head>', `<head><script>if(localStorage.getItem('project-fixture-instance')!==${JSON.stringify(jwt.slice(-36))}){localStorage.setItem('project-fixture-instance',${JSON.stringify(jwt.slice(-36))});localStorage.setItem('sb-127-auth-token',${JSON.stringify(JSON.stringify(bootstrap))});localStorage.setItem('resulab_onboarding_done','true');}</script>`); } }] });
await web.listen(); console.log(`Project acceptance: http://127.0.0.1:3206/library/project (${real ? 'real model' : 'simulated model'}, synthetic identity, isolated database)`); process.send?.('ready');
let stopping = false;
async function stop() { if (stopping) return; stopping = true; await web.close(); if ('closeAllConnections' in api) api.closeAllConnections(); await new Promise<void>(resolve => api.close(() => resolve())); await scheduler.stop(); await db.close(); process.exit(0); }
process.on('message', message => { if (message === 'stop') void stop(); }); for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => { void stop(); });
