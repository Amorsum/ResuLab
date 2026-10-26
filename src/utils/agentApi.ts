import { z } from 'zod';
import { runStatusSchema, runViewSchema } from '../../shared/agent.schema';

export class AgentApiError extends Error {
  constructor(message: string, public status = 0, public requestId?: string) { super(message); }
}
const messages: Record<number, string> = {
  400: '提交内容不符合要求，请检查长度和字段。', 401: '登录已失效，请重新登录后恢复任务。',
  403: '你没有权限访问该任务。', 404: '任务不存在或不属于当前账号。',
  409: '任务状态已变化，请刷新任务后重试。', 429: '请求过于频繁或已达用量限制，请稍后再试。',
  503: '后端尚未就绪，请确认数据库和模型配置。',
};
export async function agentRequest(base: string, path: string, token: string, signal: AbortSignal, body?: unknown) {
  const response = await fetch(`${base.replace(/\/$/, '')}/api/agent${path}`, {
    method: body === undefined ? 'GET' : 'POST', signal,
    headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    // Do not render arbitrary upstream messages or stack traces.
    const id = z.object({ requestId: z.string().max(160).optional() }).safeParse(data);
    throw new AgentApiError(messages[response.status] || '服务暂时不可用，请稍后手动重试。', response.status, id.success ? id.data.requestId : undefined);
  }
  const parsed = body === undefined ? runViewSchema.safeParse(data) : z.object({ runId: z.string().uuid(), status: runStatusSchema }).strict().safeParse(data);
  if (!parsed.success) throw new AgentApiError('服务返回的数据不符合协议，请联系队友核对版本。');
  return parsed.data;
}
