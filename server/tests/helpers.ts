import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { databaseError, AgentError } from "../src/errors.js";
import { exampleSnapshot } from "../../shared/agent.examples.js";
import { resumeRevision } from "../../shared/agent.js";
import type { Store, RunRecord } from "../src/store.js";

export const ownerA = "00000000-0000-4000-8000-00000000000a";
export const ownerB = "00000000-0000-4000-8000-00000000000b";
export const testConfig = () =>
  loadConfig({
    NODE_ENV: "test",
    MODEL_ID: "test-provider",
    MODEL_BASE_URL: "https://test.invalid/v1",
    MODEL_API_KEY: "synthetic-only",
    MODEL_TIMEOUT_MS: "1000",
    MAX_MODEL_RETRIES: "0",
  });
export async function database(directory?: string, initialize = true) {
  const db = new PGlite(directory);
  await db.waitReady;
  if (initialize) {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as 'select nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
      grant usage on schema auth to authenticated;
      insert into auth.users values('${ownerA}'),('${ownerB}');`);
    await db.exec(
      await readFile(
        new URL(
          "../../supabase/migrations/202610230001_agent.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
  }
  const store: Store = {
    async rpc<T>(name: string, args: Record<string, unknown>) {
      if (!/^agent_[a-z_]+$/.test(name)) throw new Error("Unknown function");
      const entries = Object.entries(args);
      try {
        const result = await db.query<{ value: T }>(
          `select public.${name}(${entries.map(([key], index) => `${key} => $${index + 1}`).join(",")}) as value`,
          entries.map(([, value]) =>
            typeof value === "object" && value !== null
              ? JSON.stringify(value)
              : value,
          ),
        );
        return result.rows[0].value;
      } catch (error) {
        throw databaseError(error as { message: string });
      }
    },
  };
  return { db, store };
}
export function fixtureApp(store: Store, config = testConfig()) {
  return createApp({
    config,
    store,
    modelReady: true,
    authenticate: async (token) => {
      if (token === "owner-a") return ownerA;
      if (token === "owner-b") return ownerB;
      throw new AgentError("UNAUTHENTICATED", "登录无效", 401);
    },
  });
}
export async function fixtureInput(key = "create-key-0001") {
  return {
    jdText: "负责 TypeScript 接口开发",
    resumeSnapshot: structuredClone(exampleSnapshot),
    resumeRevision: await resumeRevision(exampleSnapshot),
    idempotencyKey: key,
  };
}
export async function createRun(
  store: Store,
  key = "create-key-0001",
): Promise<string> {
  const response = await fixtureApp(store).request("/api/agent/runs", {
    method: "POST",
    headers: {
      Authorization: "Bearer owner-a",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(await fixtureInput(key)),
  });
  if (response.status !== 202) throw new Error(await response.text());
  return ((await response.json()) as { runId: string }).runId;
}
export async function claim(store: Store, max = 2) {
  return store.rpc<RunRecord | null>("agent_claim_run", {
    p_seconds: 90,
    p_max_concurrent: max,
  });
}
export const getRun = (store: Store, id: string) =>
  store.rpc<RunRecord>("agent_get_run", { p_owner: ownerA, p_run: id });
export const reset = async (db: PGlite) => {
  await db.exec("truncate public.agent_runs cascade");
};
export function modelFetch(
  options: {
    questions?: boolean;
    noUsage?: boolean;
    newNumber?: boolean;
    forged?: boolean;
    missing?: boolean;
    useAnswer?: boolean;
    onCall?: (tool: string) => void;
  } = {},
): typeof fetch {
  return (async (_input, init) => {
    const body = JSON.parse(init!.body as string);
    const instruction = body.messages[0].content as string;
    const tool = instruction.includes('"tool":"extract_job_requirements"')
      ? "extract_job_requirements"
      : instruction.includes('"tool":"find_resume_evidence"')
        ? "find_resume_evidence"
        : "draft_resume_changes";
    options.onCall?.(tool);
    const ref = {
      id: "resume:workExperience:work-1:description",
      section: "workExperience",
      itemId: "work-1",
      field: "description",
      quote: options.forged ? "不存在的简历内容" : "使用 TypeScript 开发接口",
    };
    const result =
      tool === "extract_job_requirements"
        ? {
            requirements: [
              {
                id: "req-1",
                text: "TypeScript 接口开发",
                jdQuote: "TypeScript 接口开发",
                required: true,
              },
            ],
          }
        : tool === "find_resume_evidence"
          ? {
              evidence: [
                {
                  requirementId: "req-1",
                  coverage: options.missing
                    ? "missing"
                    : options.questions
                      ? "needs_clarification"
                      : "supported",
                  refs: options.missing ? [] : [ref],
                },
              ],
              questions: options.questions
                ? [
                    {
                      id: "q-1",
                      requirementId: "req-1",
                      question:
                        "请补充你负责的接口功能；没有做过可以直接说明。",
                    },
                  ]
                : [],
            }
          : {
              changes: options.missing
                ? []
                : [
                    {
                      id: "change-1",
                      target: {
                        section: "workExperience",
                        itemId: "work-1",
                        field: "description",
                      },
                      before: "使用 TypeScript 开发接口",
                      after: options.newNumber
                        ? "使用 TypeScript 开发接口，性能提升 90%"
                        : options.useAnswer
                          ? "使用 TypeScript 开发接口，负责登录鉴权接口。"
                          : "负责基于 TypeScript 的接口开发。",
                      reason: "突出岗位相关经历",
                      sources: [
                        {
                          kind: "resume",
                          refId: ref.id,
                          quote: "使用 TypeScript 开发接口",
                        },
                        ...(options.useAnswer
                          ? [
                              {
                                kind: "answer",
                                refId: "q-1",
                                quote: "负责登录鉴权接口",
                              },
                            ]
                          : []),
                      ],
                      needsConfirmation: true,
                    },
                  ],
            };
    return new Response(
      JSON.stringify({
        id: "test-request",
        choices: [{ message: { content: JSON.stringify({ tool, result }) } }],
        ...(options.noUsage
          ? {}
          : { usage: { prompt_tokens: 100, completion_tokens: 20 } }),
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  }) as typeof fetch;
}
