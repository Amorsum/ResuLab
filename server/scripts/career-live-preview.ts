// Explicit, loopback-only acceptance harness: synthetic identity/data, real model, isolated DB.
// Never run this as the normal application server or with user resumes.
import 'dotenv/config';
import { serve } from '@hono/node-server';
import { createServer } from 'vite';
import { resolve } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { database, ownerA } from '../tests/helpers.js';
import { readFile } from 'node:fs/promises';
import { loadConfig, readiness } from '../src/config.js';
import { createApp } from '../src/app.js';
import { AgentError } from '../src/errors.js';
import { openAIProvider } from '../src/provider.js';
import { startScheduler } from '../src/engine.js';
import { configureEnvironmentProxy } from '../src/network.js';
import { localProxyEnvironment } from './local-proxy.js';

if (!process.argv.includes('--synthetic-only')) throw new Error('Requires --synthetic-only: local synthetic data with real model calls');
configureEnvironmentProxy(localProxyEnvironment(process.env));
const root = resolve('..'), output = resolve(root, '.cache/career-live'); await mkdir(output, { recursive: true });
const config = loadConfig({ ...process.env, NODE_ENV: 'test', HOST: '127.0.0.1', PORT: '3197', ALLOWED_ORIGINS: 'http://127.0.0.1:3198' });
if (!readiness(config).model) throw new Error('Configure the local model before real acceptance');
const { db, store } = await database();
for (const file of ['202610240002_legacy_web.sql', '202610260001_career_library.sql']) await db.exec(await readFile(resolve(root, 'supabase/migrations', file), 'utf8'));
const user = { id: ownerA, email: 'synthetic-career@example.invalid', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
const jwt = `${Buffer.from('{}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: ownerA, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.${crypto.randomUUID()}`;
const app = createApp({ config, store, modelReady: true, authenticate: async token => {
  if (token !== jwt) throw new AgentError('UNAUTHENTICATED', 'This isolated fixture accepts only its synthetic session', 401);
  return ownerA;
} });
app.get('/api/e2e/report', async c => {
  const runs = (await db.query('select id,status,stage,career_context,run_view from agent_runs order by created_at')).rows;
  const entries = (await db.query('select id,revision,payload from career_entries')).rows;
  const versions = (await db.query('select id,title,data from resumes')).rows;
  const calls = (await db.query('select run_id,step_id,model,status,input_tokens,output_tokens,error_code from agent_model_calls order by started_at')).rows;
  const report = { at: new Date().toISOString(), syntheticOnly: true, realModel: true, realDatabase: true, realAuth: false, model: config.MODEL_ID, runs, entries, versions, calls };
  await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2));
  return c.json(report);
});
const scheduler = startScheduler(store, openAIProvider(config, store), config);
const api = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 3197 });
const bootstrap = { access_token: jwt, refresh_token: 'synthetic-only', expires_at: Math.floor(Date.now() / 1000) + 3600, token_type: 'bearer', user };
const resume = { templateId: 'classic', accentColor: '#2563eb', fontFamily: 'yahei', fontSize: 14, lineHeight: 22, pageMargin: 15, lastModified: Date.now(),
  personalInfo: { fullName: '合成验收候选人', gender: '', birthYear: '', birthMonth: '', phone: '', email: '', city: '', avatar: '', jobTitle: '', yearsOfExperience: '' },
  jobIntention: { desiredPosition: '', desiredCity: '', expectedSalary: '', jobType: '', availableDate: '' }, education: [], workExperience: [], projects: [], skills: [], certificates: [], languages: [], selfEvaluation: '', socialLinks: [] };
const web = await createServer({ root, cacheDir: '.cache/vite-career-live', server: { host: '127.0.0.1', port: 3198, strictPort: true, open: false }, define: {
  'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('http://127.0.0.1:3198/supabase'), 'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify('synthetic-only'),
  'import.meta.env.VITE_AGENT_API_BASE': JSON.stringify('http://127.0.0.1:3197'), 'import.meta.env.VITE_AI_API_BASE': JSON.stringify('http://127.0.0.1:3197'),
  'import.meta.env.VITE_CAREER_STORAGE': JSON.stringify('local'),
}, plugins: [{ name: 'synthetic-career-live-fixture', configureServer(server) {
  server.middlewares.use((req, res, next) => {
    if (!req.url?.startsWith('/supabase/')) return next();
    res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(req.url.includes('/auth/') ? user : []));
  });
}, transformIndexHtml(html) {
  const init = `if(localStorage.getItem('resulab.career-live-instance')!==${JSON.stringify(jwt.slice(-36))}){localStorage.setItem('resulab.career-live-instance',${JSON.stringify(jwt.slice(-36))});localStorage.removeItem('resulab.career-run:${ownerA}');localStorage.removeItem('resulab.career-selection:${ownerA}');localStorage.setItem('sb-127-auth-token',${JSON.stringify(JSON.stringify(bootstrap))});localStorage.setItem('resulab_data',${JSON.stringify(JSON.stringify(resume))});localStorage.setItem('resulab_onboarding_done','true');}`;
  return html.replace('<head>', `<head><script>${init}</script>`);
} }] });
await web.listen(); console.log('LIVE CAREER ACCEPTANCE: http://127.0.0.1:3198/library (synthetic identity/data, real model, isolated database)');
let stopping = false;
async function stop() { if (stopping) return; stopping = true; await web.close(); await new Promise<void>(resolve => api.close(() => resolve())); await scheduler.stop(); await db.close(); process.exit(0); }
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => { void stop(); });
process.on('message', message => { if (message === 'resulab-local-stop') void stop(); });
