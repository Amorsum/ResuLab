// Real workerd/Miniflare runtime; outbound calls use Node's configured proxy.
// No Cloudflare login, uploads, production deployments or mocked AI responses.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const directory = fileURLToPath(new URL('..', import.meta.url));
const workerRequire = createRequire(path.join(directory, 'package.json'));
const wranglerRequire = createRequire(path.join(directory, 'node_modules/wrangler/package.json'));
const serverRequire = createRequire(path.join(directory, '../server/package.json'));
const { Miniflare, Response: WorkerResponse, Log, LogLevel } = wranglerRequire('miniflare');
const esbuild = wranglerRequire('esbuild');
const dotenv = serverRequire('dotenv');
const { EnvHttpProxyAgent, setGlobalDispatcher } = serverRequire('undici');
if (process.env.HTTP_PROXY || process.env.HTTPS_PROXY)
  setGlobalDispatcher(new EnvHttpProxyAgent({ noProxy: process.env.NO_PROXY ?? 'localhost,127.0.0.1,[::1]' }));
const sourceFile = path.join(directory, 'src/index.ts');
const bindingsFile = path.join(directory, '.dev.vars');
if (!fs.existsSync(bindingsFile)) throw new Error('Run node workers/scripts/prepare-local.mjs from the repository root first.');
function options() {
  const bindings = dotenv.parse(fs.readFileSync(bindingsFile));
  const allowedOrigins = new Set([bindings.SUPABASE_URL, bindings.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1'].map((value) => new URL(value).origin));
  return {
    host: '127.0.0.1', port: 8787, modules: true, compatibilityDate: '2025-07-01',
    script: esbuild.buildSync({ entryPoints: [sourceFile], bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022', logLevel: 'silent' }).outputFiles[0].text,
    bindings, log: new Log(LogLevel.WARN), cf: false,
    outboundService: async (request) => {
      const url = new URL(request.url);
      if (!allowedOrigins.has(url.origin)) return new WorkerResponse('Local outbound origin is not configured', { status: 503 });
      try {
        const body = ['GET', 'HEAD'].includes(request.method) ? undefined : await request.arrayBuffer();
        const requestHeaders = new Headers(Object.fromEntries(request.headers));
        for (const name of ['content-length', 'transfer-encoding', 'connection', 'host', 'upgrade', 'expect']) requestHeaders.delete(name);
        const result = await fetch(url, { method: request.method, headers: requestHeaders, body, redirect: 'manual', signal: AbortSignal.timeout(90000) });
        const headers = new Headers(result.headers);
        // Node fetch decompresses the body; do not ask workerd to decompress it again.
        for (const name of ['content-encoding', 'content-length', 'transfer-encoding']) headers.delete(name);
        return new WorkerResponse([204, 205, 304].includes(result.status) ? null : await result.arrayBuffer(), { status: result.status, headers: Object.fromEntries(headers) });
      } catch (error) {
        const code = error?.cause?.code;
        console.error(JSON.stringify({ event: 'local_outbound_failed', host: url.hostname, code: typeof code === 'string' && /^[A-Z0-9_]+$/.test(code) ? code : 'FETCH_FAILED' }));
        return new WorkerResponse('Local upstream unavailable', { status: 503 });
      }
    },
  };
}
const runtime = new Miniflare(options());
await runtime.ready;
console.log('Local AI Worker ready: http://127.0.0.1:8787 (real Supabase/model; no Cloudflare deployment)');
let reloading = false;
const watchedFiles = [sourceFile, path.join(directory, '../shared/careerComposer.ts'), path.join(directory, '../shared/career.ts'), path.join(directory, '../shared/resumeWritingSkill.ts')];
for (const watched of watchedFiles) fs.watchFile(watched, { interval: 500 }, async () => {
  if (reloading) return;
  reloading = true;
  try { await runtime.setOptions(options()); console.log('Local AI Worker reloaded'); }
  catch { console.error('Local Worker reload failed; run the Worker typecheck.'); }
  finally { reloading = false; }
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { for (const file of watchedFiles) fs.unwatchFile(file); await runtime.dispose(); process.exit(0); });
