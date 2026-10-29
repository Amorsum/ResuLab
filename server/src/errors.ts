export class AgentError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 500,
    public retryable = false,
  ) {
    super(message);
  }
}
export class ToolResultError extends AgentError {
  constructor(
    message: string,
    public path: string,
    public rule: string,
  ) {
    super("TOOL_RESULT_INVALID", message, 502, true);
  }
}
const dbErrors: Record<string, [string, number, boolean]> = {
  ENTRY_NOT_FOUND: ['经历不存在或不可访问', 404, false],
  REVISION_CONFLICT: ['经历已在其他设备更新，本机输入已保留，请重新核对', 409, false],
  SOURCE_CHANGED: ['经历已修改、撤回确认或归档，请重新核对选材', 409, false],
  RUN_NOT_FOUND: ["任务不存在或不可访问", 404, false],
  IDEMPOTENCY_CONFLICT: ["相同幂等键对应的内容不同", 409, false],
  STATE_CONFLICT: ["当前任务状态不允许此操作，请刷新", 409, false],
  INVALID_ANSWERS: ["请回答当前全部问题，问题不能重复", 400, false],
  RUN_LIMIT: ["任务数量已达到限制，请稍后再试", 429, true],
  LEASE_LOST: ["执行权已失效，等待任务恢复", 409, true],
  BUDGET_EXHAUSTED: ["模型调用预算已耗尽", 429, false],
};
export function databaseError(error: { message: string }): AgentError {
  const code = Object.keys(dbErrors).find(
    (code) => error.message === code || error.message.endsWith(`: ${code}`),
  );
  if (!code)
    return new AgentError(
      "DATABASE_UNAVAILABLE",
      "任务存储暂时不可用",
      503,
      true,
    );
  const [message, status, retryable] = dbErrors[code];
  return new AgentError(code, message, status, retryable);
}
export function safeError(error: unknown): AgentError {
  return error instanceof AgentError
    ? error
    : new AgentError("INTERNAL_ERROR", "服务暂时不可用，请稍后重试", 500, true);
}
