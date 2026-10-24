// Runs real HTTPS/auth/model tasks. Admin credentials stay in the server env file.
// Usage: node verify-model.mjs <serverDirectory> <envFile> <apiOrigin> <reportFile> [sourceRunId]
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

const [server, envFile, base, reportFile, sourceRunId] = process.argv.slice(2);
if (!server || !envFile || !base || !reportFile)
  throw new Error("Missing verification arguments");
const require = createRequire(path.resolve(server, "package.json"));
const env = require("dotenv").parse(fs.readFileSync(envFile));
const { createClient } = require("@supabase/supabase-js");
const authOptions = {
  auth: { persistSession: false, autoRefreshToken: false },
};
const admin = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  authOptions,
);
const login = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  authOptions,
);
const { evaluationCases } = await import(
  pathToFileURL(path.resolve(server, "dist/shared/agent.cases.js")).href
);
const { resumeRevision } = await import(
  pathToFileURL(path.resolve(server, "dist/shared/agent.js")).href
);
const { runViewSchema } = await import(
  pathToFileURL(path.resolve(server, "dist/shared/agent.schema.js")).href
);
const suffix = crypto.randomUUID();
const report = {
  at: new Date().toISOString(),
  apiOrigin: new URL(base).origin,
  realDatabase: true,
  realAuth: true,
  realProvider: true,
  sourceRunId: sourceRunId ?? null,
  originalRunUnmodified: true,
  cases: [],
  cleanup: null,
  success: false,
};
let userId, token;
function requireOk(result) {
  if (result.error) throw new Error("DATABASE_OR_AUTH_OPERATION_FAILED");
  return result.data;
}
async function request(route, body) {
  const response = await fetch(base.replace(/\/$/, "") + route, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Origin: "https://resulab.amorsum.top",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`API_HTTP_${response.status}`);
  if (
    response.headers.get("access-control-allow-origin") !==
    "https://resulab.amorsum.top"
  )
    throw new Error("CORS_CHECK_FAILED");
  return response.json();
}
try {
  const health = await (
    await fetch(base + "/api/health", { signal: AbortSignal.timeout(15000) })
  ).json();
  if (health.status !== "ok" || !health.dependencies?.modelConfigured)
    throw new Error("MODEL_NOT_READY");
  const cases = evaluationCases.filter((c) =>
    ["sufficient", "missing"].includes(c.id),
  );
  if (sourceRunId) {
    if (!/^[0-9a-f-]{36}$/.test(sourceRunId))
      throw new Error("INVALID_SOURCE_RUN_ID");
    const source = requireOk(
      await admin
        .from("agent_runs")
        .select("jd_text,resume_snapshot")
        .eq("id", sourceRunId)
        .single(),
    );
    cases.push({
      id: "captured-step1-regression",
      jdText: source.jd_text,
      resumeSnapshot: source.resume_snapshot,
      answer: "未提供补充信息，请仅依据原简历，不新增经历或指标。",
    });
  }
  const email = `agent-model-${suffix}@example.invalid`,
    password = crypto.randomUUID() + "Aa!9";
  userId = requireOk(
    await admin.auth.admin.createUser({ email, password, email_confirm: true }),
  ).user.id;
  token = requireOk(await login.auth.signInWithPassword({ email, password }))
    .session.access_token;
  for (const item of cases) {
    const started = Date.now();
    const created = await request("/api/agent/runs", {
      jdText: item.jdText,
      resumeSnapshot: item.resumeSnapshot,
      resumeRevision: await resumeRevision(item.resumeSnapshot),
      idempotencyKey: crypto.randomUUID(),
    });
    const record = {
      caseId: item.id,
      runId: created.runId,
      status: "observing",
      answered: false,
    };
    report.cases.push(record);
    let view;
    for (;;) {
      view = runViewSchema.parse(
        await request(`/api/agent/runs/${created.runId}`),
      );
      if (["completed", "failed"].includes(view.status)) break;
      if (Date.now() - started > 240000)
        throw new Error("MODEL_OBSERVATION_TIMEOUT");
      if (view.status === "awaiting_input") {
        if (record.answered) throw new Error("EXTRA_QUESTION_ROUND");
        record.answered = true;
        await request(`/api/agent/runs/${created.runId}/answers`, {
          answers: view.questions.map((q) => ({
            questionId: q.id,
            answer: item.answer,
          })),
          idempotencyKey: crypto.randomUUID(),
        });
      }
      await delay(1500);
    }
    const calls = requireOk(
      await admin
        .from("agent_model_calls")
        .select(
          "id,step_id,attempt,status,input_tokens,output_tokens,estimated_cost,currency,error_code,config",
        )
        .eq("run_id", created.runId)
        .order("started_at"),
    );
    const input = calls.reduce((n, c) => n + c.input_tokens, 0),
      output = calls.reduce((n, c) => n + c.output_tokens, 0);
    const tokensMatch =
      calls.every(
        (c) =>
          Number.isSafeInteger(c.input_tokens) &&
          Number.isSafeInteger(c.output_tokens),
      ) &&
      view.usage.inputTokens === input &&
      view.usage.outputTokens === output;
    const cost = calls.reduce((n, c) => n + Number(c.estimated_cost), 0);
    const costsMatch =
      calls.every((c) => c.estimated_cost !== null) &&
      Math.abs(view.usage.estimatedCost - cost) < 1e-8;
    Object.assign(record, {
      status: view.status,
      elapsedMs: Date.now() - started,
      usage: view.usage,
      steps: view.steps.map((s) => ({
        id: s.id,
        status: s.status,
        attempt: s.attempt,
      })),
      errorCode: view.error?.code ?? null,
      calls,
      tokensMatch,
      costsMatch,
      changesCount: view.changes.length,
    });
    console.log(
      JSON.stringify({
        caseId: item.id,
        runId: created.runId,
        status: view.status,
        tokensMatch,
        costsMatch,
      }),
    );
    if (view.status !== "completed" || !tokensMatch || !costsMatch)
      throw new Error("MODEL_REGRESSION_FAILED");
  }
  report.success = true;
} catch (error) {
  // Never serialize SDK/network/Zod exception payloads: they can contain private data.
  report.failure =
    error instanceof Error && /^[A-Z0-9_]+$/.test(error.message)
      ? error.message
      : "VERIFICATION_FAILED";
  process.exitCode = 1;
} finally {
  if (userId) {
    const removed = await admin.auth.admin.deleteUser(userId);
    const remaining = await admin
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
      success: report.success,
      failure: report.failure ?? null,
      cleanup: report.cleanup,
    }),
  );
}
