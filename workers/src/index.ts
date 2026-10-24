// ResuLab AI API Worker with bundled shared resume-writing rules.
import { CAREER_LIMITS, CareerValidationError, parseCareerInput } from '../../shared/career';
import { composeCareer } from '../../shared/careerComposer';
import { RESUME_WRITER_VERSION } from '../../shared/resumeWritingSkill';

interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  PLATFORM_API_KEY: string;
  DEEPSEEK_BASE_URL?: string;
  DEEPSEEK_MODEL?: string;
  DEEPSEEK_THINKING?: 'enabled' | 'disabled';
}

// ==================== Helpers ====================

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(CORS_HEADERS)) headers.set(name, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

class ApiError extends Error {
  constructor(public code: string, message: string, public status = 503) { super(message); }
}

function requireSupabase(env: Env): string {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY)
    throw new ApiError('CONFIG_MISSING', 'AI 服务尚未配置完成，请联系管理员');
  try {
    const url = new URL(env.SUPABASE_URL);
    if (url.protocol !== 'https:') throw new Error();
    return url.origin;
  } catch { throw new ApiError('CONFIG_INVALID', 'AI 服务配置异常，请联系管理员'); }
}

async function dependencyFetch(url: string, init: RequestInit, dependency: 'auth' | 'database' | 'model'): Promise<Response> {
  try { return await fetch(url, init); }
  catch {
    throw new ApiError(dependency === 'auth' ? 'AUTH_UNAVAILABLE' : dependency === 'database' ? 'DATABASE_UNAVAILABLE' : 'MODEL_UNAVAILABLE',
      dependency === 'auth' ? '登录验证服务暂时不可用，请稍后重试' : dependency === 'database' ? 'AI 用量服务暂时不可用，请稍后重试' : 'AI 模型服务暂时不可用，请稍后重试');
  }
}

async function dependencyJson<T>(response: Response): Promise<T> {
  try { return await response.json() as T; }
  catch { throw new ApiError('UPSTREAM_INVALID', 'AI 依赖服务返回异常，请稍后重试'); }
}

type Handler = (req: Request, env: Env, params: Record<string, string>) => Promise<Response> | Response;

// ==================== Simple Router ====================

interface Route {
  method: string;
  pattern: string;
  handler: Handler;
}

const routes: Route[] = [];

function add(method: string, path: string, handler: Handler) {
  routes.push({ method, pattern: path, handler });
}

function match(req: Request): { handler: Handler; params: Record<string, string> } | null {
  const url = new URL(req.url);
  const path = url.pathname;
  for (const route of routes) {
    if (route.method !== '*' && route.method !== req.method) continue;
    // Convert /path/:param to regex
    const regexStr = '^' + route.pattern.replace(/\/:([^/]+)/g, '/(?<$1>[^/]+)') + '$';
    const regex = new RegExp(regexStr);
    const m = path.match(regex);
    if (m) {
      return { handler: route.handler, params: m.groups || {} };
    }
  }
  return null;
}

// ==================== Routes ====================

// Health
add('GET', '/api/health', () => json({ status: 'ok', version: 'career-library-20261024', resumeWriterVersion: RESUME_WRITER_VERSION, timestamp: Date.now() }));

// Membership status
add('GET', '/api/membership/status', async (req, env) => {
  const userId = await authenticate(req, env);
  const membership = await getMembership(env, userId);
  const [genUsed, polUsed, intUsed] = await Promise.all([
    getMonthlyUsage(env, userId, 'generate'),
    getMonthlyUsage(env, userId, 'polish'),
    getMonthlyUsage(env, userId, 'interview'),
  ]);
  const limits = LIMITS[membership.tier] || LIMITS.free;
  return json({
    tier: membership.tier,
    status: membership.status,
    usage: {
      generate: { used: genUsed, limit: limits.generate },
      polish: { used: polUsed, limit: limits.polish },
      interview: { used: intUsed, limit: limits.interview },
    },
  });
});

// AI generate — 分两轮
add('POST', '/api/ai/generate', async (req, env) => {
  const userId = await authenticate(req, env);
  await checkAccess(env, userId, 'generate');
  const { rawText, purpose } = await req.json() as { rawText: string; purpose?: string };
  if (typeof rawText !== 'string' || rawText.trim().length < 20) return json({ error: 'BAD_REQUEST', message: '文本太短或格式不正确' }, 400);
  if (purpose !== undefined && purpose !== 'career-library') return json({ error: 'BAD_REQUEST', message: '不支持的提取用途' }, 400);
  if (purpose === 'career-library' && rawText.length > 20000) return json({ error: 'BAD_REQUEST', message: '补充经历不能超过20000字' }, 400);

  try {
    // 第一轮：提取结构化数据（不含自我评价）
    const round1 = await chatCompletion(env, [
      { role: 'system', content: GENERATE_ROUND1_SYSTEM + (purpose === 'career-library' ? '\n本次用于事实库，只提取原文事实。没有明确技能等级时level留空，不从“使用过”推断熟练。不要写自我评价、求职目标或推测人物信息。' : '') },
      { role: 'user', content: rawText },
    ], { temperature: 0.2, max_tokens: 4096, response_format: { type: 'json_object' } });

    const structured = JSON.parse(round1) as Record<string, unknown>;

    // 第二轮：基于第一轮结果生成自我评价
    const context = buildSelfEvalContext(structured);
    let selfEvaluation = '';
    if (context && purpose !== 'career-library') {
      const round2 = await chatCompletion(env, [
        { role: 'system', content: GENERATE_ROUND2_SYSTEM },
        { role: 'user', content: context },
      ], { temperature: 0.3, max_tokens: 512 });
      selfEvaluation = round2.trim();
    }

    await recordUsage(env, userId, 'generate');

    return json({ ...structured, selfEvaluation });
  } catch (err) {
    if (err instanceof SyntaxError) return json({ error: 'PARSE_ERROR', message: 'AI返回无效数据' }, 500);
    throw err;
  }
});

async function readCareerInput(req: Request) {
  const reader = req.body?.getReader();
  if (!reader) throw new ApiError('BAD_REQUEST', '请提供岗位描述和已确认的经历', 400);
  const parts: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > CAREER_LIMITS.bytes) throw new ApiError('INPUT_TOO_LARGE', '本次材料过多，请减少参与生成的来源', 413);
      parts.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.length; }
  try { return parseCareerInput(JSON.parse(new TextDecoder().decode(bytes))); }
  catch (error) {
    if (error instanceof CareerValidationError || error instanceof SyntaxError)
      throw new ApiError('INVALID_INPUT', '请检查岗位描述和经历材料，减少超长内容或未完成的条目', 400);
    throw error;
  }
}

// Two bounded stages: select verified facts, then write a separate job-specific draft.
add('POST', '/api/ai/tailor', async (req, env) => {
  const userId = await authenticate(req, env);
  await checkAccess(env, userId, 'generate');
  const input = await readCareerInput(req);
  try {
    const result = await composeCareer(input, (instruction, data) => chatCompletion(env, [
      { role: 'system', content: instruction }, { role: 'user', content: JSON.stringify(data) },
    ], { temperature: 0.2, max_tokens: 6000, response_format: { type: 'json_object' } }));
    await recordUsage(env, userId, 'generate');
    return json(result);
  } catch (error) {
    if (error instanceof CareerValidationError || error instanceof SyntaxError)
      throw new ApiError('MODEL_RESULT_INVALID', '生成内容未通过来源或事实校验，请补充具体经历后重试', 502);
    throw error;
  }
});

// AI polish
add('POST', '/api/ai/polish', async (req, env) => {
  const userId = await authenticate(req, env);
  await checkAccess(env, userId, 'polish');
  const { fieldLabel, currentValue, context } = await req.json() as { fieldLabel: string; currentValue: string; context?: string };
  if (!fieldLabel || currentValue === undefined) return json({ error: 'BAD_REQUEST', message: '参数不完整' }, 400);
  try {
    const ctx = context || '';
    const result = await chatCompletion(env, [
      { role: 'system', content: POLISH_SYSTEM },
      { role: 'user', content: `上下文：${ctx}\n\n润色字段：${fieldLabel}\n\n当前内容：${currentValue || '（空）'}` },
    ], { temperature: 0.7, max_tokens: 1024 });
    await recordUsage(env, userId, 'polish');
    return json({ polished: result.trim() });
  } catch (err) {
    throw err;
  }
});

// Interview start
add('POST', '/api/ai/interview/start', async (req, env) => {
  const userId = await authenticate(req, env);
  await checkAccess(env, userId, 'interview');
  const { resumeData } = await req.json() as { resumeData: unknown };
  if (!resumeData) return json({ error: 'BAD_REQUEST', message: '缺少简历数据' }, 400);
  try {
    const result = await chatCompletion(env, [
      { role: 'system', content: INTERVIEW_SYSTEM },
      { role: 'user', content: `候选人简历：${JSON.stringify(resumeData)}\n开始面试，问第一个问题。` },
    ], { temperature: 0.8, response_format: { type: 'json_object' } });
    await recordUsage(env, userId, 'interview');
    return json(JSON.parse(result));
  } catch (err) {
    if (err instanceof SyntaxError) return json({ error: 'PARSE_ERROR', message: 'AI返回无效数据' }, 500);
    throw err;
  }
});

// Interview respond
add('POST', '/api/ai/interview/respond', async (req, env) => {
  const userId = await authenticate(req, env);
  const { resumeData, conversationHistory, userAnswer } = await req.json() as {
    resumeData: unknown; conversationHistory: string; userAnswer: string;
  };
  if (!userAnswer) return json({ error: 'BAD_REQUEST', message: '缺少回答' }, 400);
  try {
    const result = await chatCompletion(env, [
      { role: 'system', content: INTERVIEW_SYSTEM },
      { role: 'user', content: `候选人简历：${JSON.stringify(resumeData || {})}\n\n对话历史：${conversationHistory || ''}\n\n回答：「${userAnswer}」\n评估并问下一个问题。` },
    ], { temperature: 0.8, response_format: { type: 'json_object' } });
    return json(JSON.parse(result));
  } catch (err) {
    if (err instanceof SyntaxError) return json({ error: 'PARSE_ERROR', message: 'AI返回无效数据' }, 500);
    throw err;
  }
});

// ==================== Supabase REST ====================

async function supabaseQuery(env: Env, path: string): Promise<unknown[]> {
  const url = `${requireSupabase(env)}/rest/v1/${path}`;
  const res = await dependencyFetch(url, {
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
  }, 'database');
  if (!res.ok) throw new ApiError('DATABASE_UNAVAILABLE', 'AI 用量服务配置异常，请联系管理员');
  return dependencyJson<unknown[]>(res);
}

async function supabaseInsert(env: Env, table: string, data: Record<string, unknown>): Promise<unknown> {
  const res = await dependencyFetch(`${requireSupabase(env)}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(data),
  }, 'database');
  if (!res.ok) throw new ApiError('DATABASE_UNAVAILABLE', 'AI 用量服务配置异常，请联系管理员');
  return dependencyJson<unknown>(res);
}

// ==================== Auth & Membership ====================

async function authenticate(req: Request, env: Env): Promise<string> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader || !/^Bearer \S+$/i.test(authHeader)) {
    throw new Response(JSON.stringify({ error: 'UNAUTHORIZED', message: '请先登录' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }
  const res = await dependencyFetch(`${requireSupabase(env)}/auth/v1/user`, {
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: authHeader },
  }, 'auth');
  if (!res.ok) {
    if (![400, 401, 403].includes(res.status))
      throw new ApiError('AUTH_UNAVAILABLE', '登录验证服务暂时不可用，请稍后重试');
    throw new Response(JSON.stringify({ error: 'UNAUTHORIZED', message: '登录已过期' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }
  const data = await dependencyJson<{ id: string }>(res);
  if (!data.id || !/^[0-9a-f-]{36}$/i.test(data.id))
    throw new ApiError('AUTH_UNAVAILABLE', '登录验证服务返回异常，请稍后重试');
  return data.id;
}

async function getMembership(env: Env, userId: string) {
  const rows = await supabaseQuery(env, `memberships?user_id=eq.${userId}&limit=1`);
  if (rows.length === 0) {
    await supabaseInsert(env, 'memberships', { user_id: userId, tier: 'free', status: 'active' });
    return { tier: 'free', status: 'active' };
  }
  return rows[0] as { tier: string; status: string };
}

async function getMonthlyUsage(env: Env, userId: string, feature: string): Promise<number> {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const rows = await supabaseQuery(env,
    `ai_usage_logs?user_id=eq.${userId}&feature=eq.${feature}&created_at=gte.${startOfMonth}&select=id&limit=1000`
  );
  return rows.length;
}

async function recordUsage(env: Env, userId: string, feature: string): Promise<void> {
  await supabaseInsert(env, 'ai_usage_logs', { user_id: userId, feature, created_at: new Date().toISOString() });
}

const LIMITS: Record<string, Record<string, number>> = {
  free: { generate: 3, polish: 10, interview: 0 },
  pro: { generate: 30, polish: 999999, interview: 999999 },
};

async function checkAccess(env: Env, userId: string, feature: string): Promise<void> {
  const membership = await getMembership(env, userId);
  const limit = LIMITS[membership.tier]?.[feature] ?? 0;
  const usage = await getMonthlyUsage(env, userId, feature);
  if (usage >= limit) {
    const labels: Record<string, string> = { generate: '生成简历', polish: '润色', interview: '模拟面试' };
    const label = labels[feature] || feature;
    throw new Response(JSON.stringify({
      error: 'USAGE_LIMIT_REACHED',
      message: membership.tier === 'free'
        ? `本月${label}次数已用完（${usage}/${limit}）。升级 Pro 解锁更多`
        : `本月${label}次数已达上限（${usage}/${limit}）`,
    }), { status: 429, headers: { 'Content-Type': 'application/json' } });
  }
}

// ==================== DeepSeek LLM ====================

async function chatCompletion(
  env: Env,
  messages: Array<{ role: string; content: string }>,
  options?: { temperature?: number; max_tokens?: number; response_format?: { type: string } }
): Promise<string> {
  if (!env.PLATFORM_API_KEY) throw new ApiError('CONFIG_MISSING', 'AI 模型尚未配置完成，请联系管理员');
  const baseUrl = env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1';
  const body: Record<string, unknown> = {
    model: env.DEEPSEEK_MODEL || 'deepseek-chat',
    messages,
    temperature: options?.temperature ?? 0.7,
    max_tokens: options?.max_tokens ?? 4096,
  };
  if (env.DEEPSEEK_THINKING === 'enabled' || env.DEEPSEEK_THINKING === 'disabled')
    body.thinking = { type: env.DEEPSEEK_THINKING };
  if (options?.response_format?.type === 'json_object') {
    body.response_format = { type: 'json_object' };
  }
  const res = await dependencyFetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.PLATFORM_API_KEY}` },
    body: JSON.stringify(body),
  }, 'model');
  if (!res.ok) throw new ApiError('MODEL_UNAVAILABLE', 'AI 模型服务暂时不可用，请稍后重试', 502);
  const data = await dependencyJson<{ choices: Array<{ message: { content: string } }> }>(res);
  return data.choices[0]?.message?.content || '';
}

// ==================== Prompts ====================

const GENERATE_ROUND1_SYSTEM = `你是一位专业的简历信息提取助手。请从用户提供的文本中提取结构化信息，填入JSON。

核心原则：**只提取原文中明确存在的信息，严禁编造任何内容。**

字段说明：
- personalInfo: { fullName, gender, birthYear, birthMonth, phone, email, city, jobTitle, yearsOfExperience }
- jobIntention: { desiredPosition, desiredCity, expectedSalary, jobType, availableDate }
- education: [{ id(自增数字), schoolName, degree, major, startDate(YYYY-MM), endDate(YYYY-MM), isCurrent, gpa, description }]
- workExperience: [{ id, companyName, position, startDate, endDate, isCurrent, city, description, highlights(字符串数组) }]
- projects: [{ id, projectName, role, startDate, endDate, isCurrent, description, techStack(字符串数组), url }]
- skills: [{ id, skillName, level(了解/掌握/熟练/精通), category(编程语言/框架/工具/数据库/其他) }]
- certificates: [{ id, name, issuer, date }]
- languages: [{ id, language, level(母语/精通/熟练/良好/一般), score }]
- socialLinks: [{ id, platform, url }]

规则：
1. 原文没有的信息留空，绝不猜测
2. 日期统一YYYY-MM格式
3. 项目/工作经历的description保持原文措辞，只做轻微整理
4. 技能按category分组
5. 荣誉奖项提取到certificates
6. 校园经历提取到education的description
7. 不要包含selfEvaluation字段`;

const GENERATE_ROUND2_SYSTEM = `你是一位专业的简历撰写专家。请根据以下简历摘要，写一段简洁的自我评价。
要求：
1. 基于事实，不夸大
2. 突出核心竞争力
3. 控制在80-120字
4. 只返回自我评价文本，不要加任何前缀或引号`;

function buildSelfEvalContext(data: Record<string, unknown>): string {
  const parts: string[] = [];
  const pi = data.personalInfo as Record<string, unknown> | undefined;
  if (pi) {
    parts.push(`姓名: ${pi.fullName || '未知'}, 职位: ${pi.jobTitle || '未知'}, 年限: ${pi.yearsOfExperience || '未知'}`);
  }
  const ji = data.jobIntention as Record<string, unknown> | undefined;
  if (ji) {
    parts.push(`求职意向: ${ji.desiredPosition || '未填'}`);
  }
  const edu = data.education as Array<Record<string, unknown>> | undefined;
  if (edu?.length) {
    parts.push(`教育: ${edu.map(e => `${e.schoolName} ${e.major} ${e.degree}`).join('; ')}`);
  }
  const work = data.workExperience as Array<Record<string, unknown>> | undefined;
  if (work?.length) {
    parts.push(`工作: ${work.map(w => `${w.companyName} ${w.position}`).join('; ')}`);
  }
  const proj = data.projects as Array<Record<string, unknown>> | undefined;
  if (proj?.length) {
    parts.push(`项目: ${proj.map(p => p.projectName).join('; ')}`);
  }
  const skills = data.skills as Array<Record<string, unknown>> | undefined;
  if (skills?.length) {
    parts.push(`技能: ${skills.map(s => s.skillName).join(', ')}`);
  }
  return parts.join('\n');
}

const POLISH_SYSTEM = `你是一位专业的简历润色专家。请对以下字段的内容进行小幅优化：

原则：
1. 只做措辞优化和句式调整，使表达更简洁专业
2. 不得添加原文中不存在的任何事实、数据、技能或成果
3. 不得编造数字、百分比、规模、排名等量化信息
4. 保持原文的核心内容和事实不变
5. 如果原文已经很好，就保持原样或只做最小改动

返回润色后文本，不要加引号或解释。`;

const INTERVIEW_SYSTEM = `你是一位资深HR面试官，根据候选人简历进行面试。
每轮返回JSON：{ "question": "问题", "round": 1, "evaluation": { "score": 85, "strengths": "", "weaknesses": "", "suggestion": "" }, "isComplete": false, "finalReport": null }
结束时isComplete=true，finalReport含综合评语和总分。6-8轮后结束。`;

// ==================== Export ====================

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    try {
      const matched = match(request);
      if (matched) {
        return withCors(await matched.handler(request, env, matched.params));
      }
      return json({ error: 'NOT_FOUND', message: '接口不存在' }, 404);
    } catch (err) {
      if (err instanceof Response) return withCors(err);
      if (err instanceof ApiError) return json({ error: err.code, message: err.message }, err.status);
      if (err instanceof SyntaxError) return json({ error: 'BAD_REQUEST', message: '请求数据格式不正确' }, 400);
      return json({ error: 'INTERNAL_ERROR', message: 'AI 服务暂时不可用，请稍后重试' }, 500);
    }
  },
};
