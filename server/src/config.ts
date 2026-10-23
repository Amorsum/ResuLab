import { z } from "zod";
const integer = (fallback: number, max: number) =>
  z.coerce.number().int().min(1).max(max).default(fallback);
const price = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.coerce.number().nonnegative().optional(),
);
const configSchema = z.object({
  HOST: z.enum(["127.0.0.1", "0.0.0.0", "::1", "::"]).default("127.0.0.1"),
  PORT: integer(8788, 65535),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  ALLOWED_ORIGINS: z.string().default("http://localhost:3000"),
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  MODEL_BASE_URL: z.string().url().optional(),
  MODEL_API_KEY: z.string().optional(),
  MODEL_ID: z.string().optional(),
  MODEL_TIMEOUT_MS: integer(45000, 120000),
  MAX_CONCURRENT_RUNS: integer(2, 10),
  MAX_MODEL_CALLS_PER_RUN: integer(6, 20),
  MAX_MODEL_RETRIES: z.coerce.number().int().min(0).max(2).default(1),
  MAX_PENDING_RUNS_PER_USER: integer(3, 20),
  MAX_DAILY_RUNS_PER_USER: integer(20, 1000),
  MODEL_INPUT_PRICE_PER_MILLION: price,
  MODEL_OUTPUT_PRICE_PER_MILLION: price,
  MODEL_CURRENCY: z.string().min(1).max(12).default("CNY"),
});
export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  return configSchema.parse(
    Object.fromEntries(Object.entries(env).filter(([, value]) => value !== "")),
  );
}
export type Config = ReturnType<typeof loadConfig>;
const usable = (value?: string) =>
  Boolean(
    value &&
    !/replace-on-server-only|your-project|provider\.example|actual-model-id/.test(
      value,
    ),
  );
export function readiness(config: Config) {
  return {
    database:
      usable(config.SUPABASE_URL) && usable(config.SUPABASE_SERVICE_ROLE_KEY),
    model:
      usable(config.MODEL_BASE_URL) &&
      usable(config.MODEL_API_KEY) &&
      usable(config.MODEL_ID),
  };
}
