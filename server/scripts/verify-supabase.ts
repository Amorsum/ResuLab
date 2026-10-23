import "dotenv/config";
import assert from "node:assert/strict";
import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { configureEnvironmentProxy } from "../src/network.js";
import { loadConfig, readiness } from "../src/config.js";
import { agentExamples, exampleSnapshot } from "../../shared/agent.examples.js";
import { resumeRevision, sha256 } from "../../shared/agent.js";
import { runViewSchema } from "../../shared/agent.schema.js";
import type { RunRecord } from "../src/store.js";

// Real test-project checks. Creates only disposable synthetic users and their rows.
// Does not call the global queue claimant or send any model request.
const config = loadConfig();
if (!readiness(config).database) throw new Error("请先配置测试项目后端密钥");
const proxy = configureEnvironmentProxy();
const timeoutFetch: typeof fetch = (input, init) =>
  fetch(input, {
    ...init,
    signal: AbortSignal.any([
      AbortSignal.timeout(12000),
      ...(init?.signal ? [init.signal] : []),
    ]),
  });
const client = () =>
  createClient(config.SUPABASE_URL!, config.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: timeoutFetch },
  });
const admin = client(); // Never sign this administrative client in as a normal user.
const base = (process.env.AGENT_API_BASE ?? "http://localhost:8788").replace(
  /\/$/,
  "",
);
const suffix = crypto.randomUUID();
const users: Array<{
  id: string;
  email: string;
  password: string;
  token: string;
}> = [];
const checks: Array<{ name: string; passed: boolean }> = [];
const cleanup: Array<{ userDeleted: boolean; ownedRunsRemoved: boolean }> = [];
let failure: string | null = null;
let failureDetails: {
  operation: string;
  name: string | null;
  code: string | null;
  status: number | null;
  networkRelated: boolean;
} | null = null;
const check = (condition: unknown, name: string) => {
  checks.push({ name, passed: Boolean(condition) });
  console.log(JSON.stringify({ check: name, passed: Boolean(condition) }));
  if (!condition) throw new Error(`CHECK_FAILED:${name}`);
};
function code(error: unknown) {
  const value = (error as { code?: unknown })?.code;
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(value)
    ? value
    : "OPERATION_FAILED";
}
async function ok<T extends { data: unknown; error: unknown }>(
  label: string,
  operation: PromiseLike<T>,
): Promise<T["data"]> {
  const result = await operation;
  if (result.error) {
    const error = result.error as {
      name?: unknown;
      code?: unknown;
      status?: unknown;
      message?: unknown;
    };
    const safeName = (value: unknown) =>
      typeof value === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(value)
        ? value
        : null;
    failureDetails = {
      operation: label,
      name: safeName(error.name),
      code: safeName(error.code),
      status: typeof error.status === "number" ? error.status : null,
      networkRelated:
        typeof error.message === "string" &&
        /fetch failed|network|timeout|aborted|reset/i.test(error.message),
    };
    throw new Error(`${label}:${code(result.error)}`);
  }
  return result.data;
}
async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  return (await ok(name, admin.rpc(name, args))) as T;
}
async function denied(
  name: string,
  args: Record<string, unknown>,
  expected: string,
) {
  const result = await admin.rpc(name, args);
  check(Boolean(result.error?.message === expected), expected);
}
const getRun = (owner: string, id: string) =>
  rpc<RunRecord>("agent_get_run", { p_owner: owner, p_run: id });
const userRequest = (path: string, token?: string, body?: unknown) =>
  timeoutFetch(base + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
try {
  const health = (await (await timeoutFetch(base + "/api/health")).json()) as {
    dependencies?: { databaseConfigured?: boolean; modelConfigured?: boolean };
  };
  check(
    health.dependencies?.databaseConfigured,
    "local_backend_has_database_configuration",
  );
  check(
    health.dependencies?.modelConfigured === false,
    "no_model_scheduler_for_database_fixture_checks",
  );
  for (const table of [
    "agent_runs",
    "agent_operations",
    "agent_steps",
    "agent_answers",
    "agent_model_calls",
  ]) {
    await ok(table, admin.from(table).select("*").limit(0));
    check(true, `${table}_accessible`);
  }
  const schemaResponse = await timeoutFetch(config.SUPABASE_URL + "/rest/v1/", {
    headers: {
      apikey: config.SUPABASE_SERVICE_ROLE_KEY!,
      Authorization: `Bearer ${config.SUPABASE_SERVICE_ROLE_KEY}`,
      Accept: "application/openapi+json",
    },
  });
  check(schemaResponse.ok, "postgrest_schema_accessible");
  const schema = (await schemaResponse.json()) as {
    paths?: Record<string, unknown>;
  };
  for (const name of [
    "agent_create_run",
    "agent_get_run",
    "agent_mutate_run",
    "agent_claim_run",
    "agent_renew_lease",
    "agent_checkpoint",
    "agent_begin_model_call",
    "agent_finish_model_call",
  ]) {
    check(Boolean(schema.paths?.[`/rpc/${name}`]), `${name}_installed`);
  }
  for (let index = 0; index < 2; index++) {
    const email = `agent-acceptance-${suffix}-${index}@example.invalid`;
    const password = crypto.randomUUID() + "aA1!";
    const created = await ok(
      "create_disposable_user",
      admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { synthetic_acceptance: true },
      }),
    );
    assert.ok(created.user && created.user.email === email);
    const entry = { id: created.user.id, email, password, token: "" };
    users.push(entry); // Cleanup remains possible if login fails.
    const signedIn = await ok(
      "sign_in_disposable_user",
      client().auth.signInWithPassword({ email, password }),
    );
    assert.ok(signedIn.session);
    entry.token = signedIn.session.access_token;
    check(
      (await ok("verify_user_token", admin.auth.getUser(entry.token))).user
        ?.id === entry.id,
      `real_user_${index}_token_verified`,
    );
  }
  const [a, b] = users;
  const revision = await resumeRevision(exampleSnapshot);
  const view = structuredClone(agentExamples.running);
  Object.assign(view, {
    status: "queued",
    resumeRevision: revision,
    steps: [],
    requirements: [],
    evidence: [],
    questions: [],
    changes: [],
  });
  Object.assign(view.usage, { calls: 0, elapsedMs: 0 });
  const key = `acceptance-${suffix}`;
  const args = {
    p_owner: a.id,
    p_key: key,
    p_hash: await sha256({
      jdText: "负责 TypeScript 接口开发",
      resumeSnapshot: exampleSnapshot,
    }),
    p_jd: "负责 TypeScript 接口开发",
    p_snapshot: exampleSnapshot,
    p_revision: revision,
    p_view: view,
    p_max_pending: 3,
    p_max_daily: 20,
  };
  const created = await Promise.all(
    [1, 2, 3].map(() =>
      rpc<{ runId: string; status: string }>("agent_create_run", args),
    ),
  );
  const runId = created[0].runId;
  check(
    created.every(
      (result) => result.runId === runId && result.status === "queued",
    ),
    "real_concurrent_create_is_idempotent",
  );
  await denied(
    "agent_create_run",
    { ...args, p_hash: "different-input" },
    "IDEMPOTENCY_CONFLICT",
  );
  check((await getRun(a.id, runId)).owner_id === a.id, "rpc_owner_read");
  await denied(
    "agent_get_run",
    { p_owner: b.id, p_run: runId },
    "RUN_NOT_FOUND",
  );
  const ownResponse = await userRequest(`/api/agent/runs/${runId}`, a.token);
  check(ownResponse.status === 200, "real_authenticated_http_read");
  runViewSchema.parse(await ownResponse.json());
  const otherResponse = await userRequest(`/api/agent/runs/${runId}`, b.token);
  check(otherResponse.status === 404, "real_other_user_http_404");
  await otherResponse.body?.cancel();
  const noAuth = await userRequest(`/api/agent/runs/${runId}`);
  check(noAuth.status === 401, "real_unauthenticated_http_401");
  await noAuth.body?.cancel();
  const modelGate = await userRequest("/api/agent/runs", a.token, {});
  const modelGateBody = (await modelGate.json()) as {
    error?: { code?: string };
  };
  check(
    modelGate.status === 503 && modelGateBody.error?.code === "CONFIG_MISSING",
    "missing_model_is_explicit_not_mock_success",
  );
  const asUser = (token: string) =>
    createClient(config.SUPABASE_URL!, config.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: timeoutFetch,
        headers: { Authorization: `Bearer ${token}` },
      },
    });
  const ownRows = await ok(
    "own_rls_read",
    asUser(a.token).from("agent_runs").select("id").eq("id", runId),
  );
  const otherRows = await ok(
    "other_rls_read",
    asUser(b.token).from("agent_runs").select("id").eq("id", runId),
  );
  check(
    ownRows?.length === 1 && otherRows?.length === 0,
    "real_rls_owner_isolation",
  );
  check(
    Boolean(
      (
        await asUser(a.token)
          .from("agent_runs")
          .update({ status: "completed" })
          .eq("id", runId)
      ).error,
    ),
    "browser_role_cannot_write_task_state",
  );
  check(
    Boolean(
      (
        await asUser(a.token).rpc("agent_get_run", {
          p_owner: a.id,
          p_run: runId,
        })
      ).error,
    ),
    "browser_role_cannot_call_server_rpc",
  );
  const answerArgs = {
    p_owner: a.id,
    p_run: runId,
    p_kind: "answers",
    p_key: `answers-${suffix}`,
    p_hash: await sha256([{ questionId: "q-1", answer: "没有做过" }]),
    p_answers: [{ questionId: "q-1", answer: "没有做过" }],
  };
  await denied("agent_mutate_run", answerArgs, "STATE_CONFLICT");
  const waitingView = {
    ...structuredClone(agentExamples.awaiting_input),
    runId,
    resumeRevision: revision,
    usage: { ...view.usage },
  };
  await ok(
    "seed_own_awaiting_fixture",
    admin
      .from("agent_runs")
      .update({
        status: "awaiting_input",
        stage: 3,
        run_view: waitingView,
        awaiting_since: new Date().toISOString(),
      })
      .eq("id", runId)
      .eq("owner_id", a.id),
  );
  const answers = await Promise.all(
    [1, 2].map(() => rpc<{ status: string }>("agent_mutate_run", answerArgs)),
  );
  const afterAnswer = await getRun(a.id, runId);
  check(
    answers.every((result) => result.status === "queued") &&
      afterAnswer.run_view.questions[0].answer === "没有做过",
    "real_answers_are_saved_once",
  );
  check(
    (
      await ok(
        "count_own_answers",
        admin.from("agent_answers").select("question_id").eq("run_id", runId),
      )
    )?.length === 1,
    "one_answer_row_after_duplicate_submissions",
  );
  const failedView = {
    ...afterAnswer.run_view,
    status: "failed",
    error: {
      code: "ACCEPTANCE_SIMULATED_TIMEOUT",
      message: "数据库测试故障；没有调用模型",
      retryable: true,
    },
  };
  await ok(
    "seed_own_failed_fixture",
    admin
      .from("agent_runs")
      .update({ status: "failed", run_view: failedView })
      .eq("id", runId)
      .eq("owner_id", a.id),
  );
  const retryArgs = {
    p_owner: a.id,
    p_run: runId,
    p_kind: "retry",
    p_key: `retry-${suffix}`,
    p_hash: await sha256({ retry: true }),
    p_answers: [],
  };
  await denied(
    "agent_mutate_run",
    { ...retryArgs, p_owner: b.id },
    "RUN_NOT_FOUND",
  );
  await Promise.all([1, 2].map(() => rpc("agent_mutate_run", retryArgs)));
  let run = await getRun(a.id, runId);
  check(
    run.status === "queued" && run.retry_count === 1,
    "real_retry_is_idempotent",
  );
  const lease = crypto.randomUUID();
  const runningView = {
    ...run.run_view,
    status: "running",
    steps: [
      {
        id: "step-3",
        tool: "draft_resume_changes",
        status: "running",
        attempt: 1,
        summary: "只测试数据库RPC，不发送模型请求",
      },
    ],
  };
  // Scope all fixtures to the user created in this script. Do not claim global queued jobs.
  await ok(
    "seed_own_lease_fixture",
    admin
      .from("agent_runs")
      .update({
        status: "running",
        run_view: runningView,
        lease_token: lease,
        lease_expires_at: new Date(Date.now() + 120000).toISOString(),
      })
      .eq("id", runId)
      .eq("owner_id", a.id),
  );
  check(
    await rpc("agent_renew_lease", {
      p_run: runId,
      p_token: lease,
      p_seconds: 120,
    }),
    "real_lease_renewal",
  );
  check(
    (await rpc("agent_renew_lease", {
      p_run: runId,
      p_token: crypto.randomUUID(),
      p_seconds: 120,
    })) === false,
    "foreign_lease_token_rejected",
  );
  const reserveArgs = {
    p_run: runId,
    p_token: lease,
    p_step: "step-3",
    p_model: "acceptance-no-provider-request",
    p_attempt: 1,
    p_config: { synthetic: true, providerRequestSent: false },
    p_max_calls: 1,
    p_currency: "CNY",
  };
  const reservation = await rpc<{ id: string }>(
    "agent_begin_model_call",
    reserveArgs,
  );
  await denied("agent_begin_model_call", reserveArgs, "BUDGET_EXHAUSTED");
  const usage = await rpc<{ calls: number; inputTokens: number | null }>(
    "agent_finish_model_call",
    {
      p_run: runId,
      p_token: lease,
      p_call: reservation.id,
      p_status: "failed",
      p_request: null,
      p_input: null,
      p_output: null,
      p_cost: null,
      p_error: "ACCEPTANCE_NO_PROVIDER_REQUEST",
    },
  );
  check(
    usage.calls === 1 && usage.inputTokens === null,
    "real_call_reservation_and_unknown_usage_accounting",
  );
  run = await getRun(a.id, runId);
  await denied(
    "agent_checkpoint",
    {
      p_run: runId,
      p_token: crypto.randomUUID(),
      p_view: run.run_view,
      p_stage: 3,
      p_status: "running",
    },
    "LEASE_LOST",
  );
  const saved = await rpc<RunRecord>("agent_checkpoint", {
    p_run: runId,
    p_token: lease,
    p_view: run.run_view,
    p_stage: 3,
    p_status: "failed",
  });
  check(
    saved.status === "failed" && saved.stage === 3,
    "real_checkpoint_persisted",
  );
} catch (error) {
  failure =
    error instanceof Error && /^(CHECK_FAILED:|[a-z_]+:)/.test(error.message)
      ? error.message
      : code(error);
  console.error(JSON.stringify({ verificationFailed: failure }));
  process.exitCode = 1;
} finally {
  for (const user of users.reverse()) {
    // These identifiers were returned by this script's createUser call, not discovered from existing users.
    assert.ok(user.email.startsWith(`agent-acceptance-${suffix}-`));
    const removed = await admin.auth.admin.deleteUser(user.id);
    const remaining = await admin
      .from("agent_runs")
      .select("id")
      .eq("owner_id", user.id)
      .limit(1);
    cleanup.push({
      userDeleted: !removed.error,
      ownedRunsRemoved: !remaining.error && remaining.data?.length === 0,
    });
    if (removed.error || remaining.error || remaining.data?.length)
      process.exitCode = 1;
  }
  const output = resolve(
    process.env.AGENT_ACCEPTANCE_REPORT ??
      "../docs/competition/results/supabase-acceptance.json",
  );
  await mkdir(dirname(output), { recursive: true });
  await writeFile(
    output,
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        apiOrigin: new URL(base).origin,
        runtime: { platform: process.platform, node: process.version },
        proxyConfigured: Boolean(proxy),
        realDatabase: true,
        realAuth: true,
        modelRequestsSent: 0,
        globalQueueClaimExecuted: false,
        globalQueueClaimReason: "避免领取其他用户任务；只检查函数已安装",
        fixtures: "临时合成账号和任务；状态/租约由本测试在自己任务上注入",
        checks,
        cleanup,
        failure,
        failureDetails,
        success: !process.exitCode,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    JSON.stringify({
      reportSaved: true,
      checksPassed: checks.filter((c) => c.passed).length,
      cleanupComplete:
        cleanup.length === 2 &&
        cleanup.every((c) => c.userDeleted && c.ownedRunsRemoved),
      modelRequestsSent: 0,
      success: !process.exitCode,
    }),
  );
  await proxy?.close();
}
