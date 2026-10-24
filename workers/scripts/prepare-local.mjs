// Run from repository root. No Cloudflare account or production changes required.
// Existing local files are never overwritten. Secrets stay in ignored .dev.vars.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../..', import.meta.url));
const require = createRequire(path.join(root, 'server/package.json'));
const dotenv = require('dotenv');
const serverFile = process.argv[2] ? path.resolve(process.argv[2]) : path.join(root, 'server/.env');
const env = dotenv.parse(fs.readFileSync(serverFile));
for (const name of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'MODEL_BASE_URL', 'MODEL_API_KEY', 'MODEL_ID'])
  if (!env[name]) throw new Error(`Missing server-only configuration: ${name}`);
const workerFile = path.join(root, 'workers/.dev.vars');
const frontendFile = path.join(root, '.env.local');
if (fs.existsSync(workerFile) || fs.existsSync(frontendFile)) throw new Error('Local config already exists; review it instead of overwriting.');
const { EnvHttpProxyAgent, setGlobalDispatcher } = require('undici');
if (process.env.HTTP_PROXY || process.env.HTTPS_PROXY) setGlobalDispatcher(new EnvHttpProxyAgent());
const host = new URL(env.SUPABASE_URL).hostname;
const project = host.split('.')[0];
const html = await (await fetch('https://resulab.amorsum.top', { signal: AbortSignal.timeout(20000) })).text();
const entry = html.match(/<script[^>]*src="([^"]+\.js)"/)?.[1];
if (!entry) throw new Error('Public frontend entry not found');
const bundle = await (await fetch(new URL(entry, 'https://resulab.amorsum.top'), { signal: AbortSignal.timeout(20000) })).text();
if (!bundle.includes(env.SUPABASE_URL)) throw new Error('Published frontend uses a different Supabase project');
const publicKeys = [...new Set(bundle.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g) ?? [])].filter((key) => {
  try { const payload = JSON.parse(Buffer.from(key.split('.')[1], 'base64url')); return payload.role === 'anon' && payload.ref === project; }
  catch { return false; }
});
if (publicKeys.length === 0) publicKeys.push(...new Set(bundle.match(/sb_publishable_[A-Za-z0-9_-]+/g) ?? []));
if (publicKeys.length !== 1) throw new Error('Expected exactly one public frontend key for the current project');
const lines = (values) => Object.entries(values).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join('\n') + '\n';
const worker = {
  SUPABASE_URL: env.SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY,
  PLATFORM_API_KEY: env.MODEL_API_KEY, DEEPSEEK_BASE_URL: env.MODEL_BASE_URL, DEEPSEEK_MODEL: env.MODEL_ID,
  ...(env.MODEL_THINKING ? { DEEPSEEK_THINKING: env.MODEL_THINKING } : new URL(env.MODEL_BASE_URL).hostname === 'api.deepseek.com' ? { DEEPSEEK_THINKING: 'disabled' } : {}),
};
const agentBase = bundle.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/)?.[0];
const frontend = {
  VITE_SUPABASE_URL: env.SUPABASE_URL, VITE_SUPABASE_ANON_KEY: publicKeys[0],
  VITE_AI_API_BASE: 'http://127.0.0.1:8787', VITE_AGENT_MOCK: 'false', ...(agentBase ? { VITE_AGENT_API_BASE: agentBase } : {}),
};
fs.writeFileSync(workerFile, lines(worker), { flag: 'wx' });
fs.writeFileSync(frontendFile, lines(frontend), { flag: 'wx' });
console.log(JSON.stringify({ worker: 'http://127.0.0.1:8787', frontend: 'http://127.0.0.1:3000', supabaseHost: host, serverOnlySecrets: 'workers/.dev.vars (gitignored)', frontendConfig: '.env.local (public config, gitignored)' }));
