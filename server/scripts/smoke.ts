import "dotenv/config";
import { mkdir, appendFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { evaluationCases } from "../../shared/agent.cases.js";
import { resumeRevision, type RunView } from "../../shared/agent.js";
import { runViewSchema } from "../../shared/agent.schema.js";

const base = (process.env.AGENT_API_BASE ?? "http://localhost:8788").replace(
  /\/$/,
  "",
);
const token = process.env.AGENT_ACCESS_TOKEN;
if (!token)
  throw new Error(
    "请在本地 server/.env 设置 AGENT_ACCESS_TOKEN（Supabase 登录 access token），不会写入结果。",
  );
const output = resolve(
  process.env.AGENT_RESULTS_PATH ??
    "../docs/competition/results/private/model-runs.jsonl",
);
const concurrency = process.env.SMOKE_CONCURRENCY === "2" ? 2 : 1;
const cases =
  process.env.SMOKE_ALL === "true"
    ? evaluationCases
    : evaluationCases.slice(0, 1);
async function request(path: string, body?: unknown): Promise<unknown> {
  const response = await fetch(base + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  const result = (await response.json()) as {
    error?: { code?: string };
    requestId?: string;
  };
  if (!response.ok)
    throw new Error(
      `HTTP ${response.status} ${result.error?.code ?? "UNKNOWN"} requestId=${result.requestId ?? "unknown"}`,
    );
  return result;
}
await mkdir(dirname(output), { recursive: true });
for (let index = 0; index < cases.length; index += concurrency)
  await Promise.all(
    cases.slice(index, index + concurrency).map(async (item) => {
      const started = performance.now();
      let view: RunView | undefined;
      let error: string | undefined;
      try {
        const created = (await request("/api/agent/runs", {
          jdText: item.jdText,
          resumeSnapshot: item.resumeSnapshot,
          resumeRevision: await resumeRevision(item.resumeSnapshot),
          idempotencyKey: crypto.randomUUID(),
        })) as { runId: string };
        let answered = false;
        while (performance.now() - started < 180000) {
          view = runViewSchema.parse(
            await request(`/api/agent/runs/${created.runId}`),
          );
          if (view.status === "completed" || view.status === "failed") break;
          if (view.status === "awaiting_input") {
            if (answered) throw new Error("出现超出协议的一轮以上追问");
            answered = true;
            await request(`/api/agent/runs/${created.runId}/answers`, {
              answers: view.questions.map((q) => ({
                questionId: q.id,
                answer: item.answer,
              })),
              idempotencyKey: crypto.randomUUID(),
            });
          }
          await delay(1000);
        }
        if (view?.status !== "completed" && view?.status !== "failed")
          error = "CLIENT_OBSERVATION_TIMEOUT";
      } catch (e) {
        error = e instanceof Error ? e.message : "CLIENT_ERROR";
      }
      const record = {
        timestamp: new Date().toISOString(),
        syntheticInput: true,
        realProvider: true,
        caseId: item.id,
        concurrency,
        runId: view?.runId ?? null,
        status: view?.status ?? "client_failed",
        clientElapsedMs: Math.round(performance.now() - started),
        usage: view?.usage ?? null,
        steps: view?.steps ?? [],
        error: error ?? view?.error ?? null,
      };
      await appendFile(output, JSON.stringify(record) + "\n");
      console.log(JSON.stringify(record));
      if (error || view?.status !== "completed") process.exitCode = 1;
    }),
  );
