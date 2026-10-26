import { before, after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname, basename, resolve } from "node:path";
import {
  database,
  fixtureApp,
  fixtureInput,
  createRun,
  claim,
  getRun,
  reset,
  testConfig,
  modelFetch,
  ownerA,
  ownerB,
} from "./helpers.js";
import { executeRun } from "../src/engine.js";
import { openAIProvider } from "../src/provider.js";
import { publicView } from "../src/store.js";
import { AgentError } from "../src/errors.js";
import type { Store } from "../src/store.js";

test("a lost usage write cannot replace unknown billing with the previous call's totals", async () => {
  const { store } = context;
  const id = await createRun(store);
  let finishes = 0;
  const failingStore: Store = {
    async rpc<T>(name: string, args: Record<string, unknown>) {
      if (name === "agent_finish_model_call" && ++finishes === 2)
        throw new AgentError(
          "DATABASE_UNAVAILABLE",
          "任务存储暂时不可用",
          503,
          true,
        );
      return store.rpc<T>(name, args);
    },
  };
  const config = testConfig();
  await executeRun(
    (await claim(store))!,
    failingStore,
    openAIProvider(config, failingStore, modelFetch()),
    config,
    signal(),
  );
  const run = await getRun(store, id);
  assert.equal(run.status, "failed");
  assert.equal(run.run_view.usage.calls, 2);
  assert.equal(run.run_view.usage.inputTokens, null);
  assert.equal(run.run_view.usage.outputTokens, null);
  assert.equal(run.run_view.usage.estimatedCost, null);
});

let context: Awaited<ReturnType<typeof database>>;
before(async () => {
  context = await database();
});
after(async () => {
  await context?.db.close();
});
beforeEach(async () => {
  await reset(context.db);
});
const headers = {
  Authorization: "Bearer owner-a",
  "Content-Type": "application/json",
};
const signal = () => new AbortController().signal;

test("cosmetic drafts get one bounded content repair with usage retained; repeated cosmetics cannot publish", async () => {
  for (const repairSucceeds of [true, false]) {
    await reset(context.db);
    const { store } = context, id = await createRun(store), config = testConfig();
    const scripted = modelFetch();
    let drafts = 0;
    const events: Record<string, unknown>[] = [];
    const fetcher: typeof fetch = async (url, init) => {
      const payload = await (await scripted(url, init)).json();
      const action = JSON.parse(payload.choices[0].message.content);
      if (action.tool === "draft_resume_changes" && (++drafts === 1 || !repairSucceeds))
        action.result.changes[0].after = "使用 TypeScript 开发接口。";
      if (drafts === 2) {
        const instruction = JSON.parse(init!.body as string).messages[0].content;
        assert.ok(instruction.includes("cosmetic_only_change"));
        assert.ok(instruction.includes("事实、数字和来源约束仍全部生效"));
      }
      payload.choices[0].message.content = JSON.stringify(action);
      return new Response(JSON.stringify(payload));
    };
    await executeRun((await claim(store))!, store, openAIProvider(config, store, fetcher, (event) => events.push(event)), config, signal());
    const run = await getRun(store, id);
    assert.equal(drafts, 2);
    assert.equal(run.run_view.usage.calls, 4);
    assert.equal(run.run_view.usage.inputTokens, 400);
    assert.equal(run.run_view.usage.outputTokens, 80);
    assert.equal(run.status, repairSucceeds ? "completed" : "failed");
    assert.equal(run.run_view.changes.length, repairSucceeds ? 1 : 0);
    assert.deepEqual(events.find((event) => event.stepId === "step-3")?.validation, {
      kind: "semantic_validation",
      issues: [{ path: "$.result.changes[0].after", code: "cosmetic_only_change" }],
    });
  }
});

test("a cosmetic repair cannot introduce unsupported metrics or obtain a second repair", async () => {
  const { store } = context, id = await createRun(store), config = testConfig();
  const scripted = modelFetch();
  let drafts = 0;
  const events: Record<string, unknown>[] = [];
  const fetcher: typeof fetch = async (url, init) => {
    const payload = await (await scripted(url, init)).json();
    const action = JSON.parse(payload.choices[0].message.content);
    if (action.tool === "draft_resume_changes")
      action.result.changes[0].after = ++drafts === 1
        ? "使用 TypeScript 开发接口。"
        : "使用 TypeScript 开发接口，性能提升90%";
    payload.choices[0].message.content = JSON.stringify(action);
    return new Response(JSON.stringify(payload));
  };
  await executeRun((await claim(store))!, store, openAIProvider(config, store, fetcher, (event) => events.push(event)), config, signal());
  const run = await getRun(store, id);
  assert.equal(drafts, 2);
  assert.equal(run.status, "failed");
  assert.deepEqual(run.run_view.changes, []);
  assert.equal(run.run_view.usage.calls, 4);
  assert.deepEqual(events.at(-1)?.validation, {
    kind: "semantic_validation",
    issues: [{ path: "$.result.changes[0].after", code: "unsupported_number" }],
  });
});

test("step-3 semantic failures are repaired once before publication and preserve call usage", async () => {
  const { store } = context,
    id = await createRun(store),
    config = testConfig(),
    scripted = modelFetch();
  const events: Record<string, unknown>[] = [];
  let drafts = 0;
  const fetcher: typeof fetch = async (url, init) => {
    const response = await scripted(url, init),
      payload = await response.json();
    const action = JSON.parse(payload.choices[0].message.content);
    if (action.tool === "draft_resume_changes" && ++drafts === 1)
      action.result.changes[0].target.itemId = "missing-target";
    payload.choices[0].message.content = JSON.stringify(action);
    payload.choices[0].finish_reason = "stop";
    return new Response(JSON.stringify(payload));
  };
  await executeRun(
    (await claim(store))!,
    store,
    openAIProvider(config, store, fetcher, (event) => events.push(event)),
    config,
    signal(),
  );
  const run = await getRun(store, id),
    draftEvents = events.filter((e) => e.stepId === "step-3");
  assert.equal(run.status, "completed");
  assert.equal(run.run_view.changes[0].before, "使用 TypeScript 开发接口");
  assert.equal(run.run_view.usage.calls, 4);
  assert.equal(run.run_view.usage.inputTokens, 400);
  assert.equal(run.run_view.usage.outputTokens, 80);
  assert.equal(draftEvents.length, 2);
  assert.deepEqual(draftEvents[0].validation, {
    kind: "semantic_validation",
    issues: [{ path: "$.result.changes[0].target", code: "target_not_found" }],
  });
  assert.equal(draftEvents[0].status, "failed");
  assert.equal(draftEvents[1].status, "completed");
});

test("unfixable draft semantics and exhausted budgets cannot publish partial changes or retry indefinitely", async () => {
  for (const maxCalls of [6, 3]) {
    await reset(context.db);
    const { store } = context,
      id = await createRun(store),
      config = {
        ...testConfig(),
        MAX_MODEL_CALLS_PER_RUN: maxCalls,
        MAX_MODEL_RETRIES: 2,
      },
      scripted = modelFetch();
    let drafts = 0;
    const fetcher: typeof fetch = async (url, init) => {
      const payload = await (await scripted(url, init)).json(),
        action = JSON.parse(payload.choices[0].message.content);
      if (action.tool === "draft_resume_changes") {
        drafts++;
        action.result.changes[0].after = ["错误字段类型"];
      }
      payload.choices[0].message.content = JSON.stringify(action);
      return new Response(JSON.stringify(payload));
    };
    await executeRun(
      (await claim(store))!,
      store,
      openAIProvider(config, store, fetcher, () => {}),
      config,
      signal(),
    );
    const run = await getRun(store, id);
    assert.equal(run.status, "failed");
    assert.deepEqual(run.run_view.changes, []);
    assert.equal(drafts, maxCalls === 3 ? 1 : 2);
    assert.equal(run.run_view.usage.calls, maxCalls === 3 ? 3 : 4);
    assert.equal(
      run.run_view.error?.code,
      maxCalls === 3 ? "BUDGET_EXHAUSTED" : "TOOL_RESULT_INVALID",
    );
  }
});

test("authentication, CORS preflight and authentication errors are browser-readable", async () => {
  const app = fixtureApp(context.store);
  const preflight = await app.request("/api/agent/runs", {
    method: "OPTIONS",
    headers: {
      Origin: "http://localhost:3000",
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers":
        "Authorization,Content-Type,Idempotency-Key",
    },
  });
  assert.equal(preflight.status, 204);
  assert.match(
    preflight.headers.get("Access-Control-Allow-Headers")!,
    /Idempotency-Key/i,
  );
  const response = await app.request("/api/agent/runs", {
    method: "POST",
    headers: { Origin: "http://localhost:3000" },
  });
  assert.equal(response.status, 401);
  assert.equal(
    response.headers.get("Access-Control-Allow-Origin"),
    "http://localhost:3000",
  );
  assert.equal(
    ((await response.json()) as { error: { code: string } }).error.code,
    "UNAUTHENTICATED",
  );
});
test("database-enforced create idempotency, conflicts, revision checks and per-user limits", async () => {
  const app = fixtureApp(context.store),
    input = await fixtureInput();
  const requests = await Promise.all(
    Array.from({ length: 5 }, () =>
      app.request("/api/agent/runs", {
        method: "POST",
        headers,
        body: JSON.stringify(input),
      }),
    ),
  );
  assert.ok(requests.every((r) => r.status === 202));
  const results = await Promise.all(
    requests.map((r) => r.json() as Promise<{ runId: string }>),
  );
  assert.equal(new Set(results.map((r) => r.runId)).size, 1);
  assert.equal(
    (
      await context.db.query<{ n: number }>(
        "select count(*)::integer n from agent_runs",
      )
    ).rows[0].n,
    1,
  );
  const conflict = await app.request("/api/agent/runs", {
    method: "POST",
    headers,
    body: JSON.stringify({ ...input, jdText: "负责 TypeScript 后端服务开发" }),
  });
  assert.equal(conflict.status, 409);
  const revision = await app.request("/api/agent/runs", {
    method: "POST",
    headers,
    body: JSON.stringify({ ...input, resumeRevision: "f".repeat(64) }),
  });
  assert.equal(revision.status, 400);
  await createRun(context.store, "create-key-0002");
  await createRun(context.store, "create-key-0003");
  const limited = await app.request("/api/agent/runs", {
    method: "POST",
    headers,
    body: JSON.stringify(await fixtureInput("create-key-0004")),
  });
  assert.equal(limited.status, 429);
});
test("all task endpoints reject another owner; SQL RLS and RPC grants prevent browser bypass", async () => {
  const id = await createRun(context.store);
  const app = fixtureApp(context.store);
  for (const path of [
    `/api/agent/runs/${id}`,
    `/api/agent/runs/${id}/answers`,
    `/api/agent/runs/${id}/retry`,
  ]) {
    const response = await app.request(path, {
      method: path.endsWith(id) ? "GET" : "POST",
      headers: { ...headers, Authorization: "Bearer owner-b" },
      body: path.endsWith(id)
        ? undefined
        : JSON.stringify(
            path.endsWith("answers")
              ? {
                  answers: [{ questionId: "q-1", answer: "test" }],
                  idempotencyKey: "answers-key-1",
                }
              : { idempotencyKey: "retry-key-001" },
          ),
    });
    assert.equal(response.status, 404);
  }
  await context.db.exec(
    `set role authenticated; select set_config('request.jwt.claim.sub','${ownerB}',false);`,
  );
  assert.equal(
    (await context.db.query("select id from agent_runs")).rows.length,
    0,
  );
  await assert.rejects(
    context.db.query("update agent_runs set status='completed'"),
    /permission denied/,
  );
  await assert.rejects(
    context.db.query(`select agent_get_run('${ownerA}','${id}')`),
    /permission denied/,
  );
  await context.db.exec("reset role");
});
test("scripted-provider pipeline pauses, accepts answers exactly once, resumes and preserves trace/usage", async () => {
  const { store, db } = context,
    id = await createRun(store),
    config = testConfig();
  const called: string[] = [];
  const provider = openAIProvider(
    config,
    store,
    modelFetch({
      questions: true,
      useAnswer: true,
      onCall: (tool) => called.push(tool),
    }),
  );
  await executeRun((await claim(store))!, store, provider, config, signal());
  let run = await getRun(store, id);
  assert.equal(run.status, "awaiting_input");
  assert.equal(run.stage, 3);
  assert.equal(run.run_view.usage.calls, 2);
  const app = fixtureApp(store);
  const body = {
    answers: [{ questionId: "q-1", answer: "负责登录鉴权接口" }],
    idempotencyKey: "answer-key-001",
  };
  const wrong = await app.request(`/api/agent/runs/${id}/answers`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      ...body,
      answers: [{ questionId: "wrong", answer: "test" }],
    }),
  });
  assert.equal(wrong.status, 400);
  const replies = await Promise.all(
    [1, 2].map(() =>
      app.request(`/api/agent/runs/${id}/answers`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      }),
    ),
  );
  assert.ok(replies.every((r) => r.status === 202));
  await executeRun((await claim(store))!, store, provider, config, signal());
  run = await getRun(store, id);
  assert.equal(run.status, "completed");
  assert.equal(run.run_view.steps.length, 5);
  assert.equal(run.run_view.changes.length, 1);
  assert.equal(run.run_view.questions[0].answer, body.answers[0].answer);
  assert.equal(run.run_view.changes[0].sources[1].kind, "answer");
  assert.equal(run.run_view.changes[0].sources[1].refId, "q-1");
  assert.equal(run.run_view.usage.calls, 3);
  assert.equal(run.run_view.usage.inputTokens, 300);
  assert.equal(run.run_view.usage.estimatedCost, null);
  assert.deepEqual(called, [
    "extract_job_requirements",
    "find_resume_evidence",
    "draft_resume_changes",
  ]);
  assert.equal((await db.query("select * from agent_answers")).rows.length, 1);
  const finished = publicView(run);
  assert.equal(
    publicView(run, Date.now() + 50000).usage.elapsedMs,
    finished.usage.elapsedMs,
  );
});
test("missing evidence can complete with no fabricated changes or unnecessary clarification", async () => {
  const { store } = context,
    id = await createRun(store),
    config = testConfig();
  await executeRun(
    (await claim(store))!,
    store,
    openAIProvider(config, store, modelFetch({ missing: true, noUsage: true })),
    config,
    signal(),
  );
  const run = await getRun(store, id);
  assert.equal(run.status, "completed");
  assert.deepEqual(run.run_view.changes, []);
  assert.deepEqual(run.run_view.questions, []);
  assert.equal(run.run_view.evidence[0].coverage, "missing");
  assert.equal(run.run_view.usage.inputTokens, null);
});
test("forged evidence and unsupported numeric claims fail safely without exposing changes", async () => {
  for (const option of [{ forged: true }, { newNumber: true }]) {
    await reset(context.db);
    const id = await createRun(context.store),
      config = testConfig();
    await executeRun(
      (await claim(context.store))!,
      context.store,
      openAIProvider(config, context.store, modelFetch(option)),
      config,
      signal(),
    );
    const run = await getRun(context.store, id);
    assert.equal(run.status, "failed");
    assert.equal(run.run_view.error?.code, "TOOL_RESULT_INVALID");
    assert.deepEqual(run.run_view.changes, []);
    if ("forged" in option) assert.deepEqual(run.run_view.evidence, []);
  }
});
test("timeout is persisted, manual retry resumes from failed checkpoint, unknown usage stays null", async () => {
  const { store } = context,
    id = await createRun(store),
    config = { ...testConfig(), MODEL_TIMEOUT_MS: 20 };
  let calls = 0;
  const fake = modelFetch();
  const timeoutFetch: typeof fetch = async (input, init) => {
    if (++calls === 2)
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => reject(new Error("timeout")),
          { once: true },
        );
      });
    return fake(input, init);
  };
  await executeRun(
    (await claim(store))!,
    store,
    openAIProvider(config, store, timeoutFetch),
    config,
    signal(),
  );
  let run = await getRun(store, id);
  assert.equal(run.status, "failed");
  assert.equal(run.stage, 1);
  assert.equal(run.run_view.error?.code, "MODEL_TIMEOUT");
  assert.equal(run.run_view.usage.inputTokens, null);
  const body = JSON.stringify({ idempotencyKey: "retry-key-001" });
  const app = fixtureApp(store);
  const replies = await Promise.all(
    [1, 2].map(() =>
      app.request(`/api/agent/runs/${id}/retry`, {
        method: "POST",
        headers,
        body,
      }),
    ),
  );
  assert.ok(replies.every((r) => r.status === 202));
  const steps: string[] = [];
  await executeRun(
    (await claim(store))!,
    store,
    openAIProvider(
      testConfig(),
      store,
      modelFetch({ onCall: (t) => steps.push(t) }),
    ),
    testConfig(),
    signal(),
  );
  run = await getRun(store, id);
  assert.equal(run.status, "completed");
  assert.equal(run.run_view.steps[1].attempt, 2);
  assert.equal(run.run_view.usage.calls, 4);
  assert.equal(run.run_view.usage.inputTokens, null);
  assert.deepEqual(steps, ["find_resume_evidence", "draft_resume_changes"]);
});
test("invalid JSON gets only one repair; transient retries and call reservations obey total budget", async () => {
  const { store } = context;
  let id = await createRun(store),
    config = testConfig();
  let calls = 0;
  const invalid: typeof fetch = async () => {
    calls++;
    return new Response(
      JSON.stringify({ choices: [{ message: { content: "not-json" } }] }),
    );
  };
  await executeRun(
    (await claim(store))!,
    store,
    openAIProvider(config, store, invalid),
    config,
    signal(),
  );
  assert.equal(calls, 2);
  assert.equal(
    (await getRun(store, id)).run_view.error?.code,
    "MODEL_SCHEMA_INVALID",
  );
  await reset(context.db);
  id = await createRun(store);
  config = {
    ...testConfig(),
    MAX_MODEL_CALLS_PER_RUN: 1,
    MAX_MODEL_RETRIES: 1,
  };
  calls = 0;
  const limited: typeof fetch = async () => {
    calls++;
    return new Response("{}", { status: 429 });
  };
  await executeRun(
    (await claim(store))!,
    store,
    openAIProvider(config, store, limited),
    config,
    signal(),
  );
  const run = await getRun(store, id);
  assert.equal(calls, 1);
  assert.equal(run.run_view.error?.code, "BUDGET_EXHAUSTED");
  assert.equal(run.run_view.error?.retryable, false);
});
test("database claim ceiling and lease fencing prevent stale workers committing results", async () => {
  const { store, db } = context;
  for (let i = 0; i < 3; i++) await createRun(store, `create-key-000${i}`);
  const first = (await claim(store))!,
    second = (await claim(store))!;
  assert.notEqual(first.id, second.id);
  assert.equal(await claim(store), null);
  await db.query(
    `update agent_runs set lease_expires_at=now()-interval '1 second' where id=$1`,
    [first.id],
  );
  const replacement = (await claim(store))!;
  assert.notEqual(replacement.lease_token, first.lease_token);
  await assert.rejects(
    store.rpc("agent_checkpoint", {
      p_run: first.id,
      p_token: first.lease_token,
      p_view: first.run_view,
      p_stage: 0,
      p_status: "running",
    }),
    (e: unknown) => e instanceof AgentError && e.code === "LEASE_LOST",
  );
});
test("persisted checkpoint survives database close/reopen and resumes with a new lease", async () => {
  const dir = await mkdtemp(join(tmpdir(), "resulab-agent-"));
  let disk = await database(dir);
  const config = testConfig();
  try {
    const id = await createRun(disk.store);
    const run = (await claim(disk.store))!;
    run.run_view.requirements = [
      {
        id: "req-1",
        text: "接口开发",
        jdQuote: "TypeScript 接口开发",
        required: true,
      },
    ];
    run.run_view.steps = [
      {
        id: "step-0",
        tool: "extract_job_requirements",
        status: "completed",
        attempt: 1,
        summary: "岗位解析完成",
      },
    ];
    await disk.store.rpc("agent_checkpoint", {
      p_run: id,
      p_token: run.lease_token,
      p_view: run.run_view,
      p_stage: 1,
      p_status: "running",
    });
    await disk.db.close();
    disk = await database(dir, false);
    assert.equal(await claim(disk.store), null);
    await disk.db.query(
      `update agent_runs set lease_expires_at=now()-interval '1 second' where id=$1`,
      [id],
    );
    const calls: string[] = [];
    await executeRun(
      (await claim(disk.store))!,
      disk.store,
      openAIProvider(
        config,
        disk.store,
        modelFetch({ onCall: (t) => calls.push(t) }),
      ),
      config,
      signal(),
    );
    assert.equal((await getRun(disk.store, id)).status, "completed");
    assert.deepEqual(calls, ["find_resume_evidence", "draft_resume_changes"]);
  } finally {
    await disk.db.close();
    assert.equal(dirname(resolve(dir)), resolve(tmpdir()));
    assert.ok(basename(dir).startsWith("resulab-agent-"));
    await rm(dir, { recursive: true, force: true });
  }
});

test("personal usage can create another task after twenty completed tasks today", async () => {
  for (let i = 0; i < 20; i++) {
    const id = await createRun(context.store, `personal-history-${i}`);
    await context.db.query("update agent_runs set status='completed' where id=$1", [id]);
  }
  const response = await fixtureApp(context.store).request("/api/agent/runs", {
    method: "POST", headers, body: JSON.stringify(await fixtureInput("personal-task-21")),
  });
  assert.equal(response.status, 202);
});
