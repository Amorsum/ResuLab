import { z } from "zod";

export const PROTOCOL_VERSION = "1.0.0" as const;
export const AGENT_LIMITS = Object.freeze({
  jdChars: 12000,
  snapshotChars: 48000,
  fieldChars: 4000,
  answerChars: 2000,
  items: 80,
  questions: 3,
  bodyBytes: 131072,
});
const text = z.string().max(AGENT_LIMITS.fieldChars);
const id = z.string().min(1).max(160);
const refId = z.string().min(1).max(2048);
const strings = z.array(text).max(40);
const dated = { startDate: text, endDate: text, isCurrent: z.boolean() };
export const resumeSnapshotSchema = z
  .object({
    education: z
      .array(
        z
          .object({
            id,
            schoolName: text,
            degree: text,
            major: text,
            ...dated,
            gpa: text,
            description: text,
          })
          .strict(),
      )
      .max(AGENT_LIMITS.items)
      .default([]),
    workExperience: z
      .array(
        z
          .object({
            id,
            companyName: text,
            position: text,
            ...dated,
            city: text,
            description: text,
            highlights: strings,
          })
          .strict(),
      )
      .max(AGENT_LIMITS.items)
      .default([]),
    projects: z
      .array(
        z
          .object({
            id,
            projectName: text,
            role: text,
            ...dated,
            description: text,
            techStack: strings,
            url: text,
          })
          .strict(),
      )
      .max(AGENT_LIMITS.items)
      .default([]),
    skills: z
      .array(
        z.object({ id, skillName: text, level: text, category: text }).strict(),
      )
      .max(AGENT_LIMITS.items)
      .default([]),
    certificates: z
      .array(z.object({ id, name: text, issuer: text, date: text }).strict())
      .max(AGENT_LIMITS.items)
      .default([]),
    languages: z
      .array(
        z.object({ id, language: text, level: text, score: text }).strict(),
      )
      .max(AGENT_LIMITS.items)
      .default([]),
    selfEvaluation: text.default(""),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (JSON.stringify(value).length > AGENT_LIMITS.snapshotChars)
      ctx.addIssue({ code: "custom", message: "简历内容过长" });
    for (const [section, items] of Object.entries(value)) {
      if (
        Array.isArray(items) &&
        new Set(items.map((item) => item.id)).size !== items.length
      )
        ctx.addIssue({
          code: "custom",
          path: [section],
          message: "条目 ID 重复",
        });
    }
  });

export const targetSchema = z.discriminatedUnion("section", [
  z
    .object({
      section: z.literal("education"),
      itemId: id,
      field: z.literal("description"),
    })
    .strict(),
  z
    .object({
      section: z.literal("workExperience"),
      itemId: id,
      field: z.enum(["description", "highlights"]),
    })
    .strict(),
  z
    .object({
      section: z.literal("projects"),
      itemId: id,
      field: z.literal("description"),
    })
    .strict(),
  z
    .object({
      section: z.literal("selfEvaluation"),
      field: z.literal("selfEvaluation"),
    })
    .strict(),
]);
export const referenceSchema = z
  .object({
    id: refId,
    section: z.enum([
      "education",
      "workExperience",
      "projects",
      "skills",
      "certificates",
      "languages",
      "selfEvaluation",
    ]),
    itemId: id.optional(),
    field: id,
    quote: text.trim().min(1),
  })
  .strict();
export const requirementSchema = z
  .object({
    id,
    text: text.trim().min(1),
    jdQuote: text.trim().min(1),
    required: z.boolean(),
  })
  .strict();
export const evidenceSchema = z
  .object({
    requirementId: id,
    coverage: z.enum(["supported", "needs_clarification", "missing"]),
    refs: z.array(referenceSchema).max(12),
  })
  .strict();
export const questionSchema = z
  .object({
    id,
    requirementId: id,
    question: text.trim().min(1),
    answer: z.string().max(AGENT_LIMITS.answerChars).optional(),
  })
  .strict();
export const changeSchema = z
  .object({
    id,
    target: targetSchema,
    before: z.union([text, strings]),
    after: z.union([text, strings]),
    reason: text.min(1),
    sources: z
      .array(
        z
          .object({
            kind: z.enum(["resume", "answer"]),
            refId,
            quote: text.trim().min(1),
          })
          .strict(),
      )
      .min(1)
      .max(12),
    needsConfirmation: z.boolean(),
  })
  .strict();
export const errorSchema = z
  .object({ code: id, message: text, retryable: z.boolean() })
  .strict();
export const toolSchema = z.enum([
  "extract_job_requirements",
  "find_resume_evidence",
  "request_clarification",
  "draft_resume_changes",
  "validate_changes",
]);
export const runStatusSchema = z.enum([
  "queued",
  "running",
  "awaiting_input",
  "completed",
  "failed",
]);
export const runViewSchema = z
  .object({
    protocolVersion: z.literal(PROTOCOL_VERSION),
    runId: z.string().uuid(),
    status: runStatusSchema,
    resumeRevision: z.string().regex(/^[a-f0-9]{64}$/),
    steps: z
      .array(
        z
          .object({
            id,
            tool: toolSchema,
            status: z.enum(["queued", "running", "completed", "failed"]),
            attempt: z.number().int().positive(),
            durationMs: z.number().nonnegative().optional(),
            summary: text,
          })
          .strict(),
      )
      .max(5),
    requirements: z.array(requirementSchema).max(20),
    evidence: z.array(evidenceSchema).max(20),
    questions: z.array(questionSchema).max(AGENT_LIMITS.questions),
    changes: z.array(changeSchema).max(20),
    usage: z
      .object({
        calls: z.number().int().nonnegative(),
        inputTokens: z.number().int().nonnegative().nullable(),
        outputTokens: z.number().int().nonnegative().nullable(),
        elapsedMs: z.number().nonnegative(),
        waitingMs: z.number().nonnegative(),
        estimatedCost: z.number().nonnegative().nullable(),
        currency: z.string().min(1).max(12),
      })
      .strict(),
    error: errorSchema.optional(),
  })
  .strict();
const idempotencyKey = z
  .string()
  .min(8)
  .max(128)
  .regex(/^[A-Za-z0-9._:-]+$/);
export const createRunSchema = z
  .object({
    jdText: z.string().trim().min(10).max(AGENT_LIMITS.jdChars),
    resumeSnapshot: resumeSnapshotSchema,
    resumeRevision: z.string().regex(/^[a-f0-9]{64}$/),
    idempotencyKey,
  })
  .strict();
export const answerRunSchema = z
  .object({
    answers: z
      .array(
        z
          .object({
            questionId: id,
            answer: z.string().trim().min(1).max(AGENT_LIMITS.answerChars),
          })
          .strict(),
      )
      .min(1)
      .max(AGENT_LIMITS.questions),
    idempotencyKey,
  })
  .strict();
export const retryRunSchema = z.object({ idempotencyKey }).strict();
export const extractionSchema = z
  .object({
    tool: z.literal("extract_job_requirements"),
    result: z
      .object({ requirements: z.array(requirementSchema).min(1).max(20) })
      .strict(),
  })
  .strict();
export const matchingSchema = z
  .object({
    tool: z.literal("find_resume_evidence"),
    result: z
      .object({
        evidence: z.array(evidenceSchema).max(20),
        questions: z
          .array(questionSchema.omit({ answer: true }))
          .max(AGENT_LIMITS.questions),
      })
      .strict(),
  })
  .strict();
export const draftingSchema = z
  .object({
    tool: z.literal("draft_resume_changes"),
    result: z.object({ changes: z.array(changeSchema).max(20) }).strict(),
  })
  .strict();
