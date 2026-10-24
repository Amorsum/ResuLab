import { Hono } from "hono";
import { cors } from "hono/cors";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import {
  AGENT_LIMITS,
  PROTOCOL_VERSION,
  answerRunSchema,
  createRunSchema,
  retryRunSchema,
  runViewSchema,
} from "../../shared/agent.schema.js";
import { resumeRevision, sha256, type RunView } from "../../shared/agent.js";
import { type Config } from "./config.js";
import { AgentError, safeError } from "./errors.js";
import { type Store, type RunRecord, publicView } from "./store.js";

export interface AppDependencies {
  config: Config;
  store?: Store;
  authenticate: (token: string) => Promise<string>;
  modelReady: boolean;
}
export function createApp(deps: AppDependencies) {
  const app = new Hono<{ Variables: { userId: string; requestId: string } }>();
  app.use("*", async (c, next) => {
    c.set("requestId", crypto.randomUUID());
    c.header("X-Request-Id", c.get("requestId"));
    await next();
  });
  app.use(
    "*",
    cors({
      origin: deps.config.ALLOWED_ORIGINS.split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      allowMethods: ["GET", "POST", "OPTIONS"],
      allowHeaders: ["Authorization", "Content-Type", "Idempotency-Key"],
      exposeHeaders: ["X-Request-Id"],
      maxAge: 600,
    }),
  );
  app.use(
    "*",
    bodyLimit({
      maxSize: AGENT_LIMITS.bodyBytes,
      onError: () => {
        throw new AgentError("INPUT_TOO_LARGE", "请求内容过长", 400);
      },
    }),
  );
  app.onError((error, c) => {
    const e =
      error instanceof z.ZodError
        ? new AgentError("INVALID_INPUT", "请求字段或类型不合法", 400)
        : safeError(error);
    if (e.status >= 500)
      console.error(
        JSON.stringify({ requestId: c.get("requestId"), code: e.code }),
      );
    return c.json(
      {
        error: { code: e.code, message: e.message, retryable: e.retryable },
        requestId: c.get("requestId"),
      },
      e.status as 400,
    );
  });
  app.notFound((c) =>
    c.json(
      {
        error: { code: "NOT_FOUND", message: "接口不存在", retryable: false },
        requestId: c.get("requestId"),
      },
      404,
    ),
  );
  app.get("/api/health", (c) =>
    c.json({
      version: "0.1.0",
      protocolVersion: PROTOCOL_VERSION,
      status: deps.store && deps.modelReady ? "ok" : "degraded",
      dependencies: {
        databaseConfigured: Boolean(deps.store),
        modelConfigured: deps.modelReady,
      },
    }),
  );
  app.use("/api/agent/*", async (c, next) => {
    const match = /^Bearer (\S+)$/i.exec(c.req.header("Authorization") ?? "");
    if (!match) throw new AgentError("UNAUTHENTICATED", "请先登录", 401);
    c.set("userId", await deps.authenticate(match[1]));
    if (!deps.store)
      throw new AgentError("CONFIG_MISSING", "服务端尚未配置任务数据库", 503);
    await next();
  });
  const store = () => deps.store!;
  const modelRequired = () => {
    if (!deps.modelReady)
      throw new AgentError("CONFIG_MISSING", "服务端尚未配置模型", 503);
  };
  async function json(c: { req: { json: () => Promise<unknown> } }) {
    try {
      return await c.req.json();
    } catch {
      throw new AgentError("INVALID_JSON", "请求必须为合法 JSON", 400);
    }
  }
  const checkKey = (header: string | undefined, key: string) => {
    if (header && header !== key)
      throw new AgentError("INVALID_INPUT", "请求头与请求体幂等键不一致", 400);
  };
  const runId = (value: string) => z.string().uuid().parse(value);
  app.post("/api/agent/runs", async (c) => {
    modelRequired();
    const input = createRunSchema.parse(await json(c));
    checkKey(c.req.header("Idempotency-Key"), input.idempotencyKey);
    if ((await resumeRevision(input.resumeSnapshot)) !== input.resumeRevision)
      throw new AgentError(
        "REVISION_MISMATCH",
        "简历摘要不匹配，请使用共享算法重新计算",
        400,
      );
    const view: RunView = {
      protocolVersion: PROTOCOL_VERSION,
      runId: crypto.randomUUID(),
      status: "queued",
      resumeRevision: input.resumeRevision,
      steps: [],
      requirements: [],
      evidence: [],
      questions: [],
      changes: [],
      usage: {
        calls: 0,
        inputTokens: null,
        outputTokens: null,
        elapsedMs: 0,
        waitingMs: 0,
        estimatedCost: null,
        currency: deps.config.MODEL_CURRENCY,
      },
    };
    const result = await store().rpc("agent_create_run", {
      p_owner: c.get("userId"),
      p_key: input.idempotencyKey,
      p_hash: await sha256({
        jdText: input.jdText,
        resumeSnapshot: input.resumeSnapshot,
        resumeRevision: input.resumeRevision,
      }),
      p_jd: input.jdText,
      p_snapshot: input.resumeSnapshot,
      p_revision: input.resumeRevision,
      p_view: view,
      p_max_pending: deps.config.MAX_PENDING_RUNS_PER_USER,
      p_max_daily: null, // Personal use: no daily quota; pending/concurrency guards still apply.
    });
    return c.json(result as object, 202);
  });
  app.get("/api/agent/runs/:id", async (c) => {
    const run = await store().rpc<RunRecord>("agent_get_run", {
      p_owner: c.get("userId"),
      p_run: runId(c.req.param("id")),
    });
    return c.json(runViewSchema.parse(publicView(run)));
  });
  app.post("/api/agent/runs/:id/answers", async (c) => {
    modelRequired();
    const input = answerRunSchema.parse(await json(c));
    checkKey(c.req.header("Idempotency-Key"), input.idempotencyKey);
    const answers = [...input.answers].sort((a, b) =>
      a.questionId.localeCompare(b.questionId),
    );
    const result = await store().rpc("agent_mutate_run", {
      p_owner: c.get("userId"),
      p_run: runId(c.req.param("id")),
      p_kind: "answers",
      p_key: input.idempotencyKey,
      p_hash: await sha256(answers),
      p_answers: answers,
    });
    return c.json(result as object, 202);
  });
  app.post("/api/agent/runs/:id/retry", async (c) => {
    modelRequired();
    const input = retryRunSchema.parse(await json(c));
    checkKey(c.req.header("Idempotency-Key"), input.idempotencyKey);
    const result = await store().rpc("agent_mutate_run", {
      p_owner: c.get("userId"),
      p_run: runId(c.req.param("id")),
      p_kind: "retry",
      p_key: input.idempotencyKey,
      p_hash: await sha256({ retry: true }),
      p_answers: [],
    });
    return c.json(result as object, 202);
  });
  return app;
}
