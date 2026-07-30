var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// .wrangler/tmp/bundle-8DDSD2/strip-cf-connecting-ip-header.js
function stripCfConnectingIPHeader(input, init) {
  const request = new Request(input, init);
  request.headers.delete("CF-Connecting-IP");
  return request;
}
__name(stripCfConnectingIPHeader, "stripCfConnectingIPHeader");
globalThis.fetch = new Proxy(globalThis.fetch, {
  apply(target, thisArg, argArray) {
    return Reflect.apply(target, thisArg, [
      stripCfConnectingIPHeader.apply(null, argArray)
    ]);
  }
});

// src/index.ts
var CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization"
};
function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
  });
}
__name(json, "json");
var routes = [];
function add(method, path, handler) {
  routes.push({ method, pattern: path, handler });
}
__name(add, "add");
function match(req) {
  const url = new URL(req.url);
  const path = url.pathname;
  for (const route of routes) {
    if (route.method !== "*" && route.method !== req.method)
      continue;
    const regexStr = "^" + route.pattern.replace(/\/:([^/]+)/g, "/(?<$1>[^/]+)") + "$";
    const regex = new RegExp(regexStr);
    const m = path.match(regex);
    if (m) {
      return { handler: route.handler, params: m.groups || {} };
    }
  }
  return null;
}
__name(match, "match");
add("GET", "/api/health", () => json({ status: "ok", timestamp: Date.now() }));
add("GET", "/api/membership/status", async (req, env) => {
  const userId = await authenticate(req, env);
  const membership = await getMembership(env, userId);
  const [genUsed, polUsed, intUsed] = await Promise.all([
    getMonthlyUsage(env, userId, "generate"),
    getMonthlyUsage(env, userId, "polish"),
    getMonthlyUsage(env, userId, "interview")
  ]);
  const limits = LIMITS[membership.tier] || LIMITS.free;
  return json({
    tier: membership.tier,
    status: membership.status,
    usage: {
      generate: { used: genUsed, limit: limits.generate },
      polish: { used: polUsed, limit: limits.polish },
      interview: { used: intUsed, limit: limits.interview }
    }
  });
});
add("POST", "/api/ai/generate", async (req, env) => {
  const userId = await authenticate(req, env);
  await checkAccess(env, userId, "generate");
  const { rawText } = await req.json();
  if (!rawText || rawText.length < 20)
    return json({ error: "BAD_REQUEST", message: "\u6587\u672C\u592A\u77ED" }, 400);
  try {
    const result = await chatCompletion(env, [
      { role: "system", content: GENERATE_SYSTEM },
      { role: "user", content: `\u8BF7\u6839\u636E\u4EE5\u4E0B\u5185\u5BB9\u751F\u6210\u7B80\u5386JSON\uFF1A

${rawText}` }
    ], { temperature: 0.5, response_format: { type: "json_object" } });
    await recordUsage(env, userId, "generate");
    return json(JSON.parse(result));
  } catch (err) {
    if (err instanceof SyntaxError)
      return json({ error: "PARSE_ERROR", message: "AI\u8FD4\u56DE\u65E0\u6548\u6570\u636E" }, 500);
    throw err;
  }
});
add("POST", "/api/ai/polish", async (req, env) => {
  const userId = await authenticate(req, env);
  await checkAccess(env, userId, "polish");
  const { fieldLabel, currentValue, context } = await req.json();
  if (!fieldLabel || currentValue === void 0)
    return json({ error: "BAD_REQUEST", message: "\u53C2\u6570\u4E0D\u5B8C\u6574" }, 400);
  try {
    const ctx = context || "";
    const result = await chatCompletion(env, [
      { role: "system", content: POLISH_SYSTEM },
      { role: "user", content: `\u4E0A\u4E0B\u6587\uFF1A${ctx}

\u6DA6\u8272\u5B57\u6BB5\uFF1A${fieldLabel}

\u5F53\u524D\u5185\u5BB9\uFF1A${currentValue || "\uFF08\u7A7A\uFF09"}` }
    ], { temperature: 0.7, max_tokens: 1024 });
    await recordUsage(env, userId, "polish");
    return json({ polished: result.trim() });
  } catch (err) {
    throw err;
  }
});
add("POST", "/api/ai/interview/start", async (req, env) => {
  const userId = await authenticate(req, env);
  await checkAccess(env, userId, "interview");
  const { resumeData } = await req.json();
  if (!resumeData)
    return json({ error: "BAD_REQUEST", message: "\u7F3A\u5C11\u7B80\u5386\u6570\u636E" }, 400);
  try {
    const result = await chatCompletion(env, [
      { role: "system", content: INTERVIEW_SYSTEM },
      { role: "user", content: `\u5019\u9009\u4EBA\u7B80\u5386\uFF1A${JSON.stringify(resumeData)}
\u5F00\u59CB\u9762\u8BD5\uFF0C\u95EE\u7B2C\u4E00\u4E2A\u95EE\u9898\u3002` }
    ], { temperature: 0.8, response_format: { type: "json_object" } });
    await recordUsage(env, userId, "interview");
    return json(JSON.parse(result));
  } catch (err) {
    if (err instanceof SyntaxError)
      return json({ error: "PARSE_ERROR", message: "AI\u8FD4\u56DE\u65E0\u6548\u6570\u636E" }, 500);
    throw err;
  }
});
add("POST", "/api/ai/interview/respond", async (req, env) => {
  const userId = await authenticate(req, env);
  const { resumeData, conversationHistory, userAnswer } = await req.json();
  if (!userAnswer)
    return json({ error: "BAD_REQUEST", message: "\u7F3A\u5C11\u56DE\u7B54" }, 400);
  try {
    const result = await chatCompletion(env, [
      { role: "system", content: INTERVIEW_SYSTEM },
      { role: "user", content: `\u5019\u9009\u4EBA\u7B80\u5386\uFF1A${JSON.stringify(resumeData || {})}

\u5BF9\u8BDD\u5386\u53F2\uFF1A${conversationHistory || ""}

\u56DE\u7B54\uFF1A\u300C${userAnswer}\u300D
\u8BC4\u4F30\u5E76\u95EE\u4E0B\u4E00\u4E2A\u95EE\u9898\u3002` }
    ], { temperature: 0.8, response_format: { type: "json_object" } });
    return json(JSON.parse(result));
  } catch (err) {
    if (err instanceof SyntaxError)
      return json({ error: "PARSE_ERROR", message: "AI\u8FD4\u56DE\u65E0\u6548\u6570\u636E" }, 500);
    throw err;
  }
});
async function supabaseQuery(env, path) {
  const url = `${env.SUPABASE_URL}/rest/v1/${path}`;
  const res = await fetch(url, {
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` }
  });
  if (!res.ok)
    throw new Error(`Supabase error: ${res.status}`);
  return res.json();
}
__name(supabaseQuery, "supabaseQuery");
async function supabaseInsert(env, table, data) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation"
    },
    body: JSON.stringify(data)
  });
  if (!res.ok)
    throw new Error(`Supabase error: ${res.status}`);
  return res.json();
}
__name(supabaseInsert, "supabaseInsert");
async function authenticate(req, env) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new Response(JSON.stringify({ error: "UNAUTHORIZED", message: "\u8BF7\u5148\u767B\u5F55" }), { status: 401, headers: { "Content-Type": "application/json" } });
  }
  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: authHeader }
  });
  if (!res.ok) {
    throw new Response(JSON.stringify({ error: "UNAUTHORIZED", message: "\u767B\u5F55\u5DF2\u8FC7\u671F" }), { status: 401, headers: { "Content-Type": "application/json" } });
  }
  const data = await res.json();
  return data.id;
}
__name(authenticate, "authenticate");
async function getMembership(env, userId) {
  const rows = await supabaseQuery(env, `memberships?user_id=eq.${userId}&limit=1`);
  if (rows.length === 0) {
    await supabaseInsert(env, "memberships", { user_id: userId, tier: "free", status: "active" });
    return { tier: "free", status: "active" };
  }
  return rows[0];
}
__name(getMembership, "getMembership");
async function getMonthlyUsage(env, userId, feature) {
  const now = /* @__PURE__ */ new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const rows = await supabaseQuery(
    env,
    `ai_usage_logs?user_id=eq.${userId}&feature=eq.${feature}&created_at=gte.${startOfMonth}&select=id&limit=1000`
  );
  return rows.length;
}
__name(getMonthlyUsage, "getMonthlyUsage");
async function recordUsage(env, userId, feature) {
  await supabaseInsert(env, "ai_usage_logs", { user_id: userId, feature, created_at: (/* @__PURE__ */ new Date()).toISOString() });
}
__name(recordUsage, "recordUsage");
var LIMITS = {
  free: { generate: 3, polish: 10, interview: 0 },
  pro: { generate: 30, polish: 999999, interview: 999999 }
};
async function checkAccess(env, userId, feature) {
  const membership = await getMembership(env, userId);
  const limit = LIMITS[membership.tier]?.[feature] ?? 0;
  const usage = await getMonthlyUsage(env, userId, feature);
  if (usage >= limit) {
    const labels = { generate: "\u751F\u6210\u7B80\u5386", polish: "\u6DA6\u8272", interview: "\u6A21\u62DF\u9762\u8BD5" };
    const label = labels[feature] || feature;
    throw new Response(JSON.stringify({
      error: "USAGE_LIMIT_REACHED",
      message: membership.tier === "free" ? `\u672C\u6708${label}\u6B21\u6570\u5DF2\u7528\u5B8C\uFF08${usage}/${limit}\uFF09\u3002\u5347\u7EA7 Pro \u89E3\u9501\u66F4\u591A` : `\u672C\u6708${label}\u6B21\u6570\u5DF2\u8FBE\u4E0A\u9650\uFF08${usage}/${limit}\uFF09`
    }), { status: 429, headers: { "Content-Type": "application/json" } });
  }
}
__name(checkAccess, "checkAccess");
async function chatCompletion(env, messages, options) {
  const baseUrl = env.DEEPSEEK_BASE_URL || "https://api.deepseek.com/v1";
  const body = {
    model: "deepseek-chat",
    messages,
    temperature: options?.temperature ?? 0.7,
    max_tokens: options?.max_tokens ?? 4096
  };
  if (options?.response_format?.type === "json_object") {
    body.response_format = { type: "json_object" };
  }
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.PLATFORM_API_KEY}` },
    body: JSON.stringify(body)
  });
  if (!res.ok)
    throw new Error(`DeepSeek API error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.choices[0]?.message?.content || "";
}
__name(chatCompletion, "chatCompletion");
var GENERATE_SYSTEM = `\u4F60\u662F\u4E00\u4F4D\u4E13\u4E1A\u7684\u7B80\u5386\u64B0\u5199\u4E13\u5BB6\uFF0C\u62E5\u670910\u5E74\u4EE5\u4E0A\u7684HR\u548C\u804C\u4E1A\u89C4\u5212\u7ECF\u9A8C\u3002
\u7528\u6237\u4F1A\u7ED9\u4F60\u4E00\u6BB5\u539F\u59CB\u6587\u672C\uFF0C\u4F60\u9700\u8981\u4ECE\u4E2D\u63D0\u53D6\u4FE1\u606F\uFF0C\u751F\u6210\u4E00\u4EFD\u7ED3\u6784\u5B8C\u6574\u7684\u7B80\u5386\u3002
\u8BF7\u4E25\u683C\u6309JSON\u683C\u5F0F\u8FD4\u56DE\u3002\u5BF9\u4E8E\u65E0\u6CD5\u63D0\u53D6\u7684\u5B57\u6BB5\u4F7F\u7528\u7A7A\u503C\u3002
\u8981\u6C42\uFF1A\u5DE5\u4F5C\u63CF\u8FF0\u4F7F\u7528STAR\u6CD5\u5219\uFF1B\u6280\u80FD\u6309\u7C7B\u522B\u5206\u7EC4\uFF1B\u81EA\u6211\u8BC4\u4EF780-150\u5B57\uFF1B\u65E5\u671F\u683C\u5F0FYYYY-MM\u3002`;
var POLISH_SYSTEM = `\u4F60\u662F\u4E00\u4F4D\u4E13\u4E1A\u7684\u7B80\u5386\u6DA6\u8272\u4E13\u5BB6\u3002\u8BF7\u6539\u5199\u4EE5\u4E0B\u5B57\u6BB5\u4F7F\u5176\u66F4\u52A0\u4E13\u4E1A\uFF1A
1. \u4F7F\u7528STAR\u6CD5\u5219 2. \u91CF\u5316\u6210\u679C 3. \u4F7F\u7528\u6709\u529B\u52A8\u8BCD 4. \u4FDD\u6301\u7B80\u6D01
\u8FD4\u56DE\u6DA6\u8272\u540E\u6587\u672C\uFF0C\u4E0D\u8981\u52A0\u5F15\u53F7\u6216\u89E3\u91CA\u3002`;
var INTERVIEW_SYSTEM = `\u4F60\u662F\u4E00\u4F4D\u8D44\u6DF1HR\u9762\u8BD5\u5B98\uFF0C\u6839\u636E\u5019\u9009\u4EBA\u7B80\u5386\u8FDB\u884C\u9762\u8BD5\u3002
\u6BCF\u8F6E\u8FD4\u56DEJSON\uFF1A{ "question": "\u95EE\u9898", "round": 1, "evaluation": { "score": 85, "strengths": "", "weaknesses": "", "suggestion": "" }, "isComplete": false, "finalReport": null }
\u7ED3\u675F\u65F6isComplete=true\uFF0CfinalReport\u542B\u7EFC\u5408\u8BC4\u8BED\u548C\u603B\u5206\u30026-8\u8F6E\u540E\u7ED3\u675F\u3002`;
var src_default = {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    try {
      const matched = match(request);
      if (matched) {
        return await matched.handler(request, env, matched.params);
      }
      return json({ error: "NOT_FOUND", message: "\u63A5\u53E3\u4E0D\u5B58\u5728" }, 404);
    } catch (err) {
      if (err instanceof Response)
        return err;
      const message = err instanceof Error ? err.message : "\u670D\u52A1\u5668\u5185\u90E8\u9519\u8BEF";
      return json({ error: "INTERNAL_ERROR", message }, 500);
    }
  }
};

// node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-8DDSD2/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = src_default;

// node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-8DDSD2/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof __Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
__name(__Facade_ScheduledController__, "__Facade_ScheduledController__");
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = (request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    };
    #dispatcher = (type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    };
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=index.js.map
