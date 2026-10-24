// Verify the deployed Agent through its public HTTP API using a disposable user.
// node server/scripts/verify-deployment.mjs <serverDir> <envFile> <apiOrigin> <reportFile>
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
const [serverDir, envFile, apiOrigin, reportFile] = process.argv.slice(2);
if (!serverDir || !envFile || !apiOrigin || !reportFile) throw new Error('Missing arguments');
const require = createRequire(path.resolve(serverDir, 'package.json'));
const env = require('dotenv').parse(fs.readFileSync(envFile));
const { EnvHttpProxyAgent, setGlobalDispatcher } = require('undici');
if (process.env.HTTP_PROXY || process.env.HTTPS_PROXY) setGlobalDispatcher(new EnvHttpProxyAgent({ noProxy: '127.0.0.1,localhost' }));
const { createClient } = require('@supabase/supabase-js');
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, options);
const login = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, options);
const compiled = relative => import(pathToFileURL(path.resolve(serverDir, 'dist', relative)).href);
const { exampleSnapshot } = await compiled('shared/agent.examples.js');
const { resumeRevision } = await compiled('shared/agent.js');
const { runViewSchema } = await compiled('shared/agent.schema.js');
const { cosmeticContent } = await compiled('shared/resumeWritingSkill.js');
const snapshot = structuredClone(exampleSnapshot);
Object.assign(snapshot.workExperience[0], {
  companyName: '合成部署验收团队', position: '开发实习生',
  description: '每天整理发版说明，使用TypeScript开发订单查询接口，负责筛选条件和分页逻辑，与前端核对接口字段，协助查看日志定位接口报错。只参与实现，接口方案由同事确定。',
  highlights: ['参与订单查询接口开发，编写筛选条件和分页逻辑，与前端核对字段。'],
});
const base = new URL(apiOrigin).origin;
const frontendOrigin = 'https://resulab.amorsum.top';
const report = { at: new Date().toISOString(), apiOrigin: base, frontendOrigin, syntheticOnly: true, realAuth: true, realProvider: true, operations: [], cleanup: null, success: false };
let userId, token, stage = 'health';
const save = () => { fs.mkdirSync(path.dirname(reportFile), { recursive: true }); fs.writeFileSync(reportFile, JSON.stringify(report, null, 2) + '\n'); };
async function request(route, method = 'GET', body, authorization = token) {
  stage = method + ' ' + route;
  const response = await fetch(base + route, {
    method, headers: { Origin: frontendOrigin, ...(authorization ? { Authorization: `Bearer ${authorization}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}), ...(method === 'OPTIONS' ? { 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization,content-type,idempotency-key' } : {}) },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20000),
  });
  const cors = response.headers.get('access-control-allow-origin') === frontendOrigin;
  report.operations.push({ method, route, status: response.status, cors });
  const result = await response.json().catch(() => ({})); save();
  return { response, result, cors };
}
try {
  const health = await request('/api/health');
  if (!health.response.ok || health.result.status !== 'ok') throw new Error('HEALTH_FAILED');
  const preflight = await request('/api/agent/runs', 'OPTIONS');
  if (preflight.response.status !== 204 || !preflight.cors) throw new Error('PREFLIGHT_FAILED');
  const unauthenticated = await request('/api/agent/runs', 'POST', {}, '');
  if (unauthenticated.response.status !== 401 || !unauthenticated.cors) throw new Error('AUTH_GUARD_FAILED');
  stage = 'create-disposable-user';
  const email = `agent-deploy-${crypto.randomUUID()}@example.invalid`, password = crypto.randomUUID() + 'Aa!9';
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) throw new Error('TEST_USER_CREATE_FAILED');
  userId = created.data.user.id;
  const signed = await login.auth.signInWithPassword({ email, password });
  if (signed.error || !signed.data.session) throw new Error('TEST_SIGN_IN_FAILED');
  token = signed.data.session.access_token;
  const started = await request('/api/agent/runs', 'POST', {
    jdText: '后端开发岗位：使用TypeScript开发业务接口，实现筛选条件和分页逻辑，与前端核对接口字段，协助查看日志定位接口报错。',
    resumeSnapshot: snapshot, resumeRevision: await resumeRevision(snapshot), idempotencyKey: crypto.randomUUID(),
  });
  if (!started.response.ok || !started.result.runId || !started.cors) throw new Error('CREATE_RUN_FAILED');
  report.runId = started.result.runId; save();
  let view, previousStatus, answered = false;
  const deadline = Date.now() + 210000;
  while (Date.now() < deadline) {
    const current = await request('/api/agent/runs/' + report.runId);
    if (!current.response.ok || !current.cors) throw new Error('READ_RUN_FAILED');
    view = runViewSchema.parse(current.result);
    if (view.status !== previousStatus) { console.log(JSON.stringify({ status: view.status })); previousStatus = view.status; }
    if (['completed', 'failed'].includes(view.status)) break;
    if (view.status === 'awaiting_input') {
      if (answered) throw new Error('REPEATED_QUESTIONS'); answered = true;
      const response = await request('/api/agent/runs/' + report.runId + '/answers', 'POST', {
        answers: view.questions.map(question => ({ questionId: question.id, answer: '没有额外的经历或量化指标。我只参与接口实现，方案由同事确定。' })), idempotencyKey: crypto.randomUUID(),
      });
      if (!response.response.ok) throw new Error('ANSWER_FAILED');
    }
    await delay(1000);
  }
  report.status = view?.status;
  report.modelCalls = view?.usage.calls;
  report.changes = view?.changes;
  report.errorCode = view?.error?.code;
  report.substantiveChanges = view?.changes.filter(change => cosmeticContent(change.before) !== cosmeticContent(change.after)).length ?? 0;
  if (view?.status !== 'completed') throw new Error('RUN_NOT_COMPLETED');
  if (!report.substantiveChanges) throw new Error('NO_SUBSTANTIVE_CHANGES');
  report.success = true;
} catch (error) {
  report.failure = { stage, code: error instanceof Error && /^[A-Z_]+$/.test(error.message) ? error.message : 'VERIFICATION_FAILED' };
  process.exitCode = 1;
} finally {
  if (userId) {
    const removed = await admin.auth.admin.deleteUser(userId);
    const rows = await admin.from('agent_runs').select('id').eq('owner_id', userId).limit(1);
    report.cleanup = { userDeleted: !removed.error, ownedRunsRemoved: !rows.error && rows.data?.length === 0 };
    if (!report.cleanup.userDeleted || !report.cleanup.ownedRunsRemoved) { report.success = false; process.exitCode = 1; }
  }
  save(); console.log(JSON.stringify({ success: report.success, status: report.status, substantiveChanges: report.substantiveChanges, failure: report.failure, cleanup: report.cleanup }));
}
