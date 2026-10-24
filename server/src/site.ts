import { Hono } from 'hono';
import { serveStatic } from '@hono/node-server/serve-static';
import { bodyLimit } from 'hono/body-limit';
import type { Config } from './config.js';

type FetchHandler = (request: Request) => Response | Promise<Response>;
export interface LegacyEnvironment {
  SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY: string; PLATFORM_API_KEY: string;
  DEEPSEEK_BASE_URL?: string; DEEPSEEK_MODEL?: string; DEEPSEEK_THINKING?: 'enabled' | 'disabled';
}
export function legacyEnvironment(config: Config): LegacyEnvironment {
  return { SUPABASE_URL: config.SUPABASE_URL || '', SUPABASE_SERVICE_ROLE_KEY: config.SUPABASE_SERVICE_ROLE_KEY || '',
    PLATFORM_API_KEY: config.MODEL_API_KEY || '', DEEPSEEK_BASE_URL: config.MODEL_BASE_URL,
    DEEPSEEK_MODEL: config.MODEL_ID, DEEPSEEK_THINKING: config.MODEL_THINKING };
}
export async function loadLegacyApi(config: Config): Promise<FetchHandler> {
  const modulePath = new URL('../../legacy-ai.mjs', import.meta.url).href;
  const worker = (await import(modulePath)).default as { fetch: (request: Request, env: LegacyEnvironment) => Promise<Response> };
  const bindings = legacyEnvironment(config);
  return request => worker.fetch(request, bindings);
}
export function createSiteApp(options: { agent: FetchHandler; legacy: FetchHandler; staticRoot?: string }) {
  const app = new Hono();
  app.use('*', async (c, next) => {
    await next();
    c.header('X-Content-Type-Options', 'nosniff'); c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    if (c.req.path.startsWith('/api/')) c.header('Cache-Control', 'no-store');
    else {
      c.header('Cache-Control', c.req.path.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache');
      if (c.req.path.endsWith('.zip')) c.header('Content-Disposition', 'attachment');
    }
  });
  app.all('/api/health', c => options.agent(c.req.raw));
  app.all('/api/agent/*', c => options.agent(c.req.raw));
  app.all('/api/ai/health', c => options.legacy(new Request(new URL('/api/health', c.req.url), { headers: c.req.raw.headers })));
  app.use('/api/*', bodyLimit({ maxSize: 512 * 1024, onError: c => c.json({ error: 'INPUT_TOO_LARGE', message: '请求内容过长' }, 413) }));
  app.all('/api/*', c => options.legacy(c.req.raw));
  if (options.staticRoot) {
    app.use('*', async (c, next) => {
      if (!['GET', 'HEAD'].includes(c.req.method)) return c.text('Method not allowed', 405);
      await next();
    });
    app.use('*', serveStatic({ root: options.staticRoot }));
    // Missing downloads/assets must be a real 404, never an HTML "ZIP".
    app.get('*', async (c, next) => {
      if (c.req.path.startsWith('/downloads/') || c.req.path.startsWith('/assets/') || /\.[a-z\d]+$/i.test(c.req.path)) return c.text('Not found', 404);
      return serveStatic({ root: options.staticRoot!, path: 'index.html' })(c, next);
    });
  }
  app.notFound(c => c.json({ error: 'NOT_FOUND', message: '资源不存在' }, 404));
  app.onError((_error, c) => c.json({ error: 'INTERNAL_ERROR', message: '服务暂时不可用，请稍后重试' }, 500));
  return app;
}
