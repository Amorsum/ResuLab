// Real replay of a captured step-3 checkpoint, under a disposable account.
// Usage: node verify-drafting.mjs <serverDirectory> <envFile> <apiOrigin> <reportFile> <sourceRunId>
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

const [server, envFile, base, reportFile, sourceRunId] = process.argv.slice(2);
if (
  !server ||
  !envFile ||
  !base ||
  !reportFile ||
  !/^[0-9a-f-]{36}$/.test(sourceRunId ?? "")
)
  throw new Error("Missing verification arguments");
const require = createRequire(path.resolve(server, "package.json")),
  env = require("dotenv").parse(fs.readFileSync(envFile));
const { createClient } = require("@supabase/supabase-js"),
  options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    options,
  ),
  login = createClient(
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    options,
  );
const { runViewSchema } = await import(
  pathToFileURL(path.resolve(server, "dist/shared/agent.schema.js")).href
);
const { stableStringify, targetValue } = await import(
  pathToFileURL(path.resolve(server, "dist/shared/agent.js")).href
);
const report = {
  at: new Date().toISOString(),
  revision: path.basename(path.dirname(path.resolve(server))),
  apiOrigin: new URL(base).origin,
  sourceRunId,
  originalRunUnmodified: false,
  realDatabase: true,
  realAuth: true,
  realProvider: true,
  seededCheckpointStage: 3,
  success: false,
  cleanup: null,
};
let userId, token;
const ok = (result) => {
  if (result.error) throw new Error("DATABASE_OR_AUTH_FAILED");
  return result.data;
};
async function request(route) {
  const response = await fetch(base.replace(/\/$/, "") + route, {
    headers: {
      Authorization: `Bearer ${token}`,
      Origin: "https://resulab.amorsum.top",
    },
    signal: AbortSignal.timeout(15000),
  });
  if (
    response.status !== 200 ||
    response.headers.get("access-control-allow-origin") !==
      "https://resulab.amorsum.top"
  )
    throw new Error("API_OR_CORS_FAILED");
  return runViewSchema.parse(await response.json());
}
try {
  const source = ok(
    await admin.from("agent_runs").select("*").eq("id", sourceRunId).single(),
  );
  if (source.stage !== 3 || source.status !== "failed")
    throw new Error("SOURCE_CHECKPOINT_INVALID");
  const originalCalls = ok(
    await admin
      .from("agent_model_calls")
      .select("id")
      .eq("run_id", sourceRunId),
  ).length;
  const email = `agent-drafting-${crypto.randomUUID()}@example.invalid`,
    password = crypto.randomUUID() + "Aa!9";
  userId = ok(
    await admin.auth.admin.createUser({ email, password, email_confirm: true }),
  ).user.id;
  token = ok(await login.auth.signInWithPassword({ email, password })).session
    .access_token;
  const id = crypto.randomUUID(),
    view = structuredClone(source.run_view);
  view.runId = id;
  view.status = "queued";
  view.changes = [];
  delete view.error;
  view.steps = view.steps.filter((step) =>
    ["step-0", "step-1", "step-2"].includes(step.id),
  );
  view.usage = {
    calls: 0,
    inputTokens: null,
    outputTokens: null,
    elapsedMs: 0,
    waitingMs: 0,
    estimatedCost: null,
    currency: env.MODEL_CURRENCY ?? "CNY",
  };
  // One atomic insert. The scheduler sees a complete checkpoint, with no queue-claim race.
  ok(
    await admin
      .from("agent_runs")
      .insert({
        id,
        owner_id: userId,
        status: "queued",
        stage: 3,
        jd_text: source.jd_text,
        resume_snapshot: source.resume_snapshot,
        resume_revision: source.resume_revision,
        run_view: view,
      }),
  );
  report.runId = id;
  const started = Date.now();
  let result;
  for (;;) {
    result = await request(`/api/agent/runs/${id}`);
    if (["completed", "failed"].includes(result.status)) break;
    if (Date.now() - started > 240000) throw new Error("OBSERVATION_TIMEOUT");
    await delay(1000);
  }
  const calls = ok(
    await admin
      .from("agent_model_calls")
      .select(
        "id,step_id,attempt,status,error_code,input_tokens,output_tokens,estimated_cost,config",
      )
      .eq("run_id", id)
      .order("started_at"),
  );
  const integrity = result.changes.map((change, index) => {
    const before = targetValue(source.resume_snapshot, change.target);
    return {
      index,
      targetExists: before !== undefined,
      beforeMatches: stableStringify(before) === stableStringify(change.before),
      afterTypeMatches: Array.isArray(before) === Array.isArray(change.after),
      beforeType: Array.isArray(change.before) ? "array" : "string",
    };
  });
  const after = ok(
    await admin
      .from("agent_runs")
      .select("status,stage,updated_at")
      .eq("id", sourceRunId)
      .single(),
  );
  const afterCalls = ok(
    await admin
      .from("agent_model_calls")
      .select("id")
      .eq("run_id", sourceRunId),
  ).length;
  report.originalRunUnmodified =
    after.status === source.status &&
    after.stage === source.stage &&
    after.updated_at === source.updated_at &&
    originalCalls === afterCalls;
  const tokensMatch =
    calls.every(
      (call) =>
        Number.isSafeInteger(call.input_tokens) &&
        Number.isSafeInteger(call.output_tokens),
    ) &&
    calls.reduce((n, c) => n + c.input_tokens, 0) ===
      result.usage.inputTokens &&
    calls.reduce((n, c) => n + c.output_tokens, 0) ===
      result.usage.outputTokens;
  const costsMatch =
    calls.every((c) => c.estimated_cost !== null) &&
    Math.abs(
      calls.reduce((n, c) => n + Number(c.estimated_cost), 0) -
        result.usage.estimatedCost,
    ) < 1e-8;
  const events = fs
    .readFileSync(
      path.resolve(path.dirname(envFile), "../logs/api.stdout.log"),
      "utf8",
    )
    .split(/\r?\n/)
    .flatMap((line) => {
      try {
        const event = JSON.parse(line);
        return event.event === "model_call" && event.runId === id
          ? [event]
          : [];
      } catch {
        return [];
      }
    });
  const responseTokensMatch =
    events.length === calls.length &&
    events.every((event) => {
      const call = calls.find((c) => c.id === event.callId);
      return (
        call &&
        call.input_tokens === event.prompt_tokens &&
        call.output_tokens === event.completion_tokens
      );
    });
  Object.assign(report, {
    status: result.status,
    errorCode: result.error?.code ?? null,
    changesCount: result.changes.length,
    integrity,
    steps: result.steps.map((step) => ({ id: step.id, status: step.status })),
    usage: result.usage,
    calls,
    events,
    tokensMatch,
    costsMatch,
    responseTokensMatch,
  });
  report.success =
    result.status === "completed" &&
    integrity.length > 0 &&
    integrity.every(
      (c) => c.targetExists && c.beforeMatches && c.afterTypeMatches,
    ) &&
    tokensMatch &&
    costsMatch &&
    responseTokensMatch &&
    report.originalRunUnmodified;
  if (!report.success) throw new Error("DRAFTING_REGRESSION_FAILED");
} catch (error) {
  report.failure =
    error instanceof Error && /^[A-Z0-9_]+$/.test(error.message)
      ? error.message
      : "VERIFICATION_FAILED";
  process.exitCode = 1;
} finally {
  if (userId) {
    const removed = await admin.auth.admin.deleteUser(userId),
      remaining = await admin
        .from("agent_runs")
        .select("id")
        .eq("owner_id", userId)
        .limit(1);
    report.cleanup = {
      userDeleted: !removed.error,
      ownedRunsRemoved: !remaining.error && remaining.data?.length === 0,
    };
    if (!report.cleanup.userDeleted || !report.cleanup.ownedRunsRemoved) {
      report.success = false;
      process.exitCode = 1;
    }
  }
  fs.mkdirSync(path.dirname(reportFile), { recursive: true });
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2) + "\n");
  console.log(
    JSON.stringify({
      runId: report.runId ?? null,
      status: report.status ?? null,
      changesCount: report.changesCount ?? null,
      success: report.success,
      failure: report.failure ?? null,
      cleanup: report.cleanup,
    }),
  );
}
