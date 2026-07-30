// ResuLab AI API Worker — 单文件，零依赖

interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  PLATFORM_API_KEY: string;
  DEEPSEEK_BASE_URL?: string;
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
add('GET', '/api/health', () => json({ status: 'ok', timestamp: Date.now() }));

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

// AI generate
add('POST', '/api/ai/generate', async (req, env) => {
  const userId = await authenticate(req, env);
  await checkAccess(env, userId, 'generate');
  const { rawText } = await req.json() as { rawText: string };
  if (!rawText || rawText.length < 20) return json({ error: 'BAD_REQUEST', message: '文本太短' }, 400);
  try {
    const result = await chatCompletion(env, [
      { role: 'system', content: GENERATE_SYSTEM },
      { role: 'user', content: `请根据以下内容生成简历JSON：\n\n${rawText}` },
    ], { temperature: 0.5, response_format: { type: 'json_object' } });
    await recordUsage(env, userId, 'generate');
    return json(JSON.parse(result));
  } catch (err) {
    if (err instanceof SyntaxError) return json({ error: 'PARSE_ERROR', message: 'AI返回无效数据' }, 500);
    throw err;
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
  const url = `${env.SUPABASE_URL}/rest/v1/${path}`;
  const res = await fetch(url, {
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
  });
  if (!res.ok) throw new Error(`Supabase error: ${res.status}`);
  return res.json();
}

async function supabaseInsert(env: Env, table: string, data: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Supabase error: ${res.status}`);
  return res.json();
}

// ==================== Auth & Membership ====================

async function authenticate(req: Request, env: Env): Promise<string> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    throw new Response(JSON.stringify({ error: 'UNAUTHORIZED', message: '请先登录' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }
  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: authHeader },
  });
  if (!res.ok) {
    throw new Response(JSON.stringify({ error: 'UNAUTHORIZED', message: '登录已过期' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }
  const data = await res.json() as { id: string };
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
  const baseUrl = env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1';
  const body: Record<string, unknown> = {
    model: 'deepseek-chat',
    messages,
    temperature: options?.temperature ?? 0.7,
    max_tokens: options?.max_tokens ?? 4096,
  };
  if (options?.response_format?.type === 'json_object') {
    body.response_format = { type: 'json_object' };
  }
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.PLATFORM_API_KEY}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`DeepSeek API error ${res.status}: ${await res.text()}`);
  const data = await res.json() as { choices: Array<{ message: { content: string } }> };
  return data.choices[0]?.message?.content || '';
}

// ==================== Prompts ====================

const GENERATE_SYSTEM = `你是一位专业的简历撰写专家，拥有10年以上的HR和职业规划经验。
用户会给你一段原始文本，你需要从中提取信息，生成一份结构完整的简历。
请严格按JSON格式返回。对于无法提取的字段使用空值。
要求：工作描述使用STAR法则；技能按类别分组；自我评价80-150字；日期格式YYYY-MM。`;

const POLISH_SYSTEM = `你是一位专业的简历润色专家。请改写以下字段使其更加专业：
1. 使用STAR法则 2. 量化成果 3. 使用有力动词 4. 保持简洁
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
        return await matched.handler(request, env, matched.params);
      }
      return json({ error: 'NOT_FOUND', message: '接口不存在' }, 404);
    } catch (err) {
      if (err instanceof Response) return err;
      const message = err instanceof Error ? err.message : '服务器内部错误';
      return json({ error: 'INTERNAL_ERROR', message }, 500);
    }
  },
};
