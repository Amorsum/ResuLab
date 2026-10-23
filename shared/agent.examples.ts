import {
  PROTOCOL_VERSION,
  referenceId,
  type ResumeSnapshot,
  type RunView,
} from "./agent.js";
/** Synthetic fixtures only. Never use these as real model evaluation results. */
export const exampleSnapshot: ResumeSnapshot = {
  education: [],
  workExperience: [
    {
      id: "work-1",
      companyName: "示例公司",
      position: "后端开发",
      startDate: "2025-01",
      endDate: "",
      isCurrent: true,
      city: "",
      description: "使用 TypeScript 开发接口",
      highlights: [],
    },
  ],
  projects: [],
  skills: [],
  certificates: [],
  languages: [],
  selfEvaluation: "",
};
const ref = {
  id: referenceId("workExperience", "work-1", "description"),
  section: "workExperience" as const,
  itemId: "work-1",
  field: "description",
  quote: "使用 TypeScript 开发接口",
};
const base: RunView = {
  protocolVersion: PROTOCOL_VERSION,
  runId: "00000000-0000-4000-8000-000000000001",
  status: "running",
  resumeRevision: "0".repeat(64),
  steps: [
    {
      id: "step-0",
      tool: "extract_job_requirements",
      status: "completed",
      attempt: 1,
      durationMs: 1200,
      summary: "识别到岗位要求",
    },
  ],
  requirements: [
    {
      id: "req-1",
      text: "TypeScript 接口开发",
      jdQuote: "负责 TypeScript 接口开发",
      required: true,
    },
  ],
  evidence: [{ requirementId: "req-1", coverage: "supported", refs: [ref] }],
  questions: [],
  changes: [],
  usage: {
    calls: 1,
    inputTokens: null,
    outputTokens: null,
    elapsedMs: 1200,
    waitingMs: 0,
    estimatedCost: null,
    currency: "CNY",
  },
};
const copy = (): RunView => structuredClone(base);
export const agentExamples: Record<
  "running" | "awaiting_input" | "completed" | "timeout" | "missing",
  RunView
> = {
  running: copy(),
  awaiting_input: {
    ...copy(),
    status: "awaiting_input",
    questions: [
      {
        id: "q-1",
        requirementId: "req-1",
        question: "你负责了哪些接口功能？没有做过也可以直接说明。",
      },
    ],
  },
  completed: {
    ...copy(),
    status: "completed",
    changes: [
      {
        id: "change-1",
        target: {
          section: "workExperience",
          itemId: "work-1",
          field: "description",
        },
        before: "使用 TypeScript 开发接口",
        after: "负责基于 TypeScript 的接口开发。",
        reason: "突出与岗位相关的实际经历",
        sources: [{ kind: "resume", refId: ref.id, quote: ref.quote }],
        needsConfirmation: true,
      },
    ],
  },
  timeout: {
    ...copy(),
    status: "failed",
    error: {
      code: "MODEL_TIMEOUT",
      message: "模型响应超时，请重试",
      retryable: true,
    },
  },
  missing: {
    ...copy(),
    status: "completed",
    evidence: [{ requirementId: "req-1", coverage: "missing", refs: [] }],
    changes: [],
  },
};
