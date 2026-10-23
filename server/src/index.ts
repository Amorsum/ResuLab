import "dotenv/config";
import { serve } from "@hono/node-server";
import { createClient } from "@supabase/supabase-js";
import { loadConfig, readiness } from "./config.js";
import { createApp } from "./app.js";
import { AgentError } from "./errors.js";
import { supabaseStore } from "./store.js";
import { openAIProvider } from "./provider.js";
import { startScheduler } from "./engine.js";
import { configureEnvironmentProxy } from "./network.js";

const config = loadConfig();
configureEnvironmentProxy();
const ready = readiness(config);
const client = ready.database
  ? createClient(config.SUPABASE_URL!, config.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init) =>
          fetch(input, {
            ...init,
            signal: AbortSignal.any([
              AbortSignal.timeout(10000),
              ...(init?.signal ? [init.signal] : []),
            ]),
          }),
      },
    })
  : undefined;
const store = client ? supabaseStore(client) : undefined;
const app = createApp({
  config,
  store,
  modelReady: ready.model,
  authenticate: async (token) => {
    if (!client)
      throw new AgentError("CONFIG_MISSING", "服务端尚未配置认证", 503);
    const { data, error } = await client.auth.getUser(token);
    const unavailable =
      error &&
      (error.name === "AuthRetryableFetchError" ||
        error.status === 0 ||
        Boolean(error.status && error.status >= 500));
    if (error || !data.user)
      throw new AgentError(
        unavailable ? "AUTH_UNAVAILABLE" : "UNAUTHENTICATED",
        unavailable ? "认证服务暂时不可用" : "登录已失效，请重新登录",
        unavailable ? 503 : 401,
      );
    return data.user.id;
  },
});
const scheduler =
  store && ready.model
    ? startScheduler(store, openAIProvider(config, store), config)
    : undefined;
const server = serve(
  { fetch: app.fetch, hostname: config.HOST, port: config.PORT },
  () =>
    console.log(
      JSON.stringify({
        event: "listening",
        host: config.HOST,
        port: config.PORT,
        protocolVersion: "1.0.0",
        ...ready,
      }),
    ),
);
let shuttingDown = false;
for (const name of ["SIGTERM", "SIGINT"] as const)
  process.on(name, async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    const force = setTimeout(() => process.exit(1), 15000);
    force.unref();
    server.close();
    await scheduler?.stop();
    clearTimeout(force);
  });
