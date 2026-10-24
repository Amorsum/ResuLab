import { test } from "node:test";
import assert from "node:assert/strict";
import { matchingSchema } from "../../shared/agent.schema.js";
import { openAIProvider } from "../src/provider.js";
import { loadConfig } from "../src/config.js";
import type { RunRecord, Store } from "../src/store.js";
import { agentExamples } from "../../shared/agent.examples.js";

function harness(payloads: unknown[], overrides: NodeJS.ProcessEnv = {}) {
  const events: Record<string, unknown>[] = [],
    requests: Record<string, unknown>[] = [],
    writes: Record<string, unknown>[] = [];
  let index = 0;
  const store: Store = {
    async rpc<T>(name: string, args: Record<string, unknown>) {
      writes.push({ name, ...args });
      return (
        name === "agent_begin_model_call"
          ? { id: `call-${index}`, calls: index + 1 }
          : {}
      ) as T;
    },
  };
  const fetcher = (async (_url, init) => {
    requests.push(JSON.parse(String(init?.body)));
    const payload = payloads[Math.min(index++, payloads.length - 1)];
    return new Response(
      typeof payload === "string" ? payload : JSON.stringify(payload),
    );
  }) as typeof fetch;
  const config = loadConfig({
    MODEL_BASE_URL: "https://api.deepseek.com",
    MODEL_ID: "deepseek-flash",
    MODEL_API_KEY: "synthetic-key",
    MAX_MODEL_RETRIES: "0",
    ...overrides,
  });
  const run = {
    id: "synthetic-run",
    lease_token: "synthetic-lease",
    run_view: structuredClone(agentExamples.running),
  } as RunRecord;
  return {
    events,
    requests,
    writes,
    generate: () =>
      openAIProvider(config, store, fetcher, (e) => events.push(e)).generate(
        run,
        "step-1",
        matchingSchema,
        "JSON protocol",
        {},
        new AbortController().signal,
      ),
  };
}
const valid = {
  tool: "find_resume_evidence",
  result: { evidence: [], questions: [] },
};
const envelope = (content: unknown, finish_reason = "stop") => ({
  id: "request-id",
  choices: [{ finish_reason, message: { content } }],
  usage: {
    prompt_tokens: 123,
    completion_tokens: 3500,
    prompt_cache_hit_tokens: 100,
    prompt_cache_miss_tokens: 23,
    completion_tokens_details: { reasoning_tokens: 3400 },
  },
});

test("truncated JSON is distinguished from schema fields and retains billed usage on repair", async () => {
  const h = harness(
    [envelope('{"tool":', "length"), envelope(JSON.stringify(valid))],
    { MODEL_INPUT_PRICE_PER_MILLION: "2", MODEL_OUTPUT_PRICE_PER_MILLION: "8" },
  );
  await h.generate();
  assert.equal(h.events[0].finish_reason, "length");
  assert.equal((h.events[0].validation as { kind: string }).kind, "json_parse");
  assert.equal(h.events[0].prompt_tokens, 123);
  assert.equal(h.events[0].completion_tokens, 3500);
  assert.equal(h.events[0].reasoning_tokens, 3400);
  assert.equal(h.events[0].estimatedCost, (123 * 2 + 3500 * 8) / 1e6);
  assert.equal(
    h.writes.filter((w) => w.name === "agent_finish_model_call")[0].p_output,
    3500,
  );
  assert.deepEqual(h.requests[0].thinking, { type: "disabled" });
  assert.equal(h.requests[0].max_tokens, 8000);
});
test("field failures record exact protocol paths without echoing private model text", async () => {
  const invalid = {
    tool: "find_resume_evidence",
    result: {
      evidence: [
        { requirementId: "req-1", coverage: "PRIVATE_INVALID_VALUE", refs: [] },
      ],
      questions: [],
    },
  };
  const h = harness([
    envelope(JSON.stringify(invalid)),
    envelope(JSON.stringify(valid)),
  ]);
  await h.generate();
  assert.deepEqual(h.events[0].validation, {
    kind: "field_validation",
    issues: [
      { path: "$.result.evidence[0].coverage", code: "invalid_enum_value" },
    ],
  });
  assert.equal(h.events[0].finish_reason, "stop");
  assert.match(JSON.stringify(h.requests[1]), /result.evidence\[0\].coverage/);
  assert.ok(!JSON.stringify(h.events).includes("PRIVATE_INVALID_VALUE"));
  assert.ok(!JSON.stringify(h.requests[1]).includes("PRIVATE_INVALID_VALUE"));
});
test("a parsable but length-limited response cannot be accepted as a complete action", async () => {
  const h = harness([envelope(JSON.stringify(valid), "length")]);
  await assert.rejects(h.generate(), { code: "MODEL_SCHEMA_INVALID" });
  assert.equal(h.events.length, 2);
  assert.equal((h.events[0].validation as { kind: string }).kind, "truncated");
});
test("outer JSON errors and absent content remain distinct; unknown usage remains unknown", async () => {
  const outer = harness([
    "not-json-private-text",
    envelope(JSON.stringify(valid)),
  ]);
  await outer.generate();
  assert.equal(
    (outer.events[0].validation as { kind: string }).kind,
    "response_json_parse",
  );
  assert.ok(!JSON.stringify(outer.events).includes("not-json-private-text"));
  const h = harness([
    { choices: [{ finish_reason: "length", message: { content: null } }] },
  ]);
  await assert.rejects(h.generate(), { code: "MODEL_SCHEMA_INVALID" });
  assert.equal(
    (h.events[0].validation as { kind: string }).kind,
    "content_missing",
  );
  assert.equal(h.events[0].prompt_tokens, null);
  assert.equal(h.events[0].estimatedCost, null);
  const other = harness([envelope(JSON.stringify(valid))], {
    MODEL_BASE_URL: "https://other.invalid/v1",
  });
  await other.generate();
  assert.ok(!("thinking" in other.requests[0]));
});
test("zero token counts are valid but strings and missing counts cannot become zero cost", async () => {
  const config = {
    MODEL_INPUT_PRICE_PER_MILLION: "2",
    MODEL_OUTPUT_PRICE_PER_MILLION: "8",
  };
  const zero = harness(
    [
      {
        ...envelope(JSON.stringify(valid)),
        usage: { prompt_tokens: 0, completion_tokens: 0 },
      },
    ],
    config,
  );
  await zero.generate();
  assert.equal(zero.events[0].estimatedCost, 0);
  const unknown = harness(
    [
      {
        ...envelope(JSON.stringify(valid)),
        usage: { prompt_tokens: "123", completion_tokens: 2 },
      },
    ],
    config,
  );
  await unknown.generate();
  assert.equal(unknown.events[0].prompt_tokens, null);
  assert.equal(unknown.events[0].estimatedCost, null);
});
