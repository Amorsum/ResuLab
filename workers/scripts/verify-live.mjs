// Disposable synthetic account only; never logs credentials or resume contents.
// node verify-live.mjs <serverDirectory> <envFile> <apiOrigin> <reportFile> [--generate]
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const [server, envFile, origin, reportFile, generate] = process.argv.slice(2);
if (!server || !envFile || !origin || !reportFile) throw new Error('Missing verification arguments');
const require = createRequire(path.resolve(server, 'package.json'));
const env = require('dotenv').parse(fs.readFileSync(envFile));
const { EnvHttpProxyAgent, setGlobalDispatcher } = require('undici');
if (process.env.HTTP_PROXY || process.env.HTTPS_PROXY)
  setGlobalDispatcher(new EnvHttpProxyAgent({ noProxy: process.env.NO_PROXY ?? 'localhost,127.0.0.1' }));
const { createClient } = require('@supabase/supabase-js');
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, options);
const login = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, options);
const base = new URL(origin).origin;
const frontendOrigin = new URL(process.env.LEGACY_FRONTEND_ORIGIN || 'https://resulab.amorsum.top').origin;
const report = { at: new Date().toISOString(), apiOrigin: base, frontendOrigin, supabaseHost: new URL(env.SUPABASE_URL).hostname, syntheticOnly: true, operations: [], generateRequested: generate === '--generate', realModelCompleted: false, cleanup: null, success: false };
let userId, token, stage = 'health';
const save = () => { fs.mkdirSync(path.dirname(reportFile), { recursive: true }); fs.writeFileSync(reportFile, JSON.stringify(report, null, 2) + '\n'); };
async function request(route, method = 'GET', body, authorization = token) {
  stage = `${method} ${route}`;
  const operation = { method, route, status: null, cors: false };
  report.operations.push(operation); save();
  const response = await fetch(base + route, {
    method, headers: { Origin: frontendOrigin, ...(authorization ? { Authorization: `Bearer ${authorization}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}), ...(method === 'OPTIONS' ? { 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization,content-type' } : {}) },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(method === 'POST' ? 120000 : 20000),
  });
  operation.status = response.status;
  const allow = response.headers.get('Access-Control-Allow-Origin');
  operation.cors = allow === '*' || allow === frontendOrigin;
  const result = await response.json().catch(() => ({}));
  if (typeof result.error === 'string' && /^[A-Z_]+$/.test(result.error)) operation.errorCode = result.error;
  save(); return { response, result, operation };
}
try {
  const health = await request('/api/health');
  if (health.response.status !== 200) throw new Error('HEALTH_FAILED');
  await request('/api/ai/generate', 'OPTIONS');
  await request('/api/ai/generate', 'POST', {}, undefined);
  stage = 'create-disposable-user';
  const email = `worker-check-${crypto.randomUUID()}@example.invalid`, password = crypto.randomUUID() + 'Aa!9';
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) throw new Error('TEST_USER_CREATE_FAILED');
  userId = created.data.user.id;
  stage = 'sign-in';
  const signed = await login.auth.signInWithPassword({ email, password });
  if (signed.error || !signed.data.session) throw new Error('TEST_SIGN_IN_FAILED');
  token = signed.data.session.access_token;
  const verified = await admin.auth.getUser(token);
  report.currentProjectTokenVerified = !verified.error && verified.data.user?.id === userId;
  if (!report.currentProjectTokenVerified) throw new Error('CURRENT_PROJECT_TOKEN_INVALID');
  const membership = await request('/api/membership/status');
  report.workerAcceptsCurrentProjectToken = membership.response.status === 200;
  if (!report.workerAcceptsCurrentProjectToken)
    throw new Error(membership.response.status === 401 ? 'WORKER_REJECTED_VERIFIED_CURRENT_PROJECT_TOKEN' : 'MEMBERSHIP_FAILED');
  if (generate === '--generate') {
    const generated = await request('/api/ai/generate', 'POST', { rawText: '这是用于接口验收的合成简历：合成候选人求职后端开发。在示例团队参与订单查询接口开发，使用TypeScript和SQL，与前端核对字段。不提供电话邮箱，也没有性能提升指标。' });
    if (generated.response.status !== 200) throw new Error('GENERATE_FAILED');
    const result = generated.result;
    report.generatedSections = ['personalInfo', 'jobIntention', 'education', 'workExperience', 'projects', 'skills', 'selfEvaluation'].filter((key) => result[key] && (typeof result[key] !== 'object' || Object.keys(result[key]).length > 0));
    if (!report.generatedSections.length) throw new Error('GENERATE_EMPTY');
    report.realModelCompleted = true;
  }
  report.success = report.operations.every((operation) => operation.cors);
  if (!report.success) throw new Error('CORS_MISSING');
} catch (error) {
  report.failureStage = stage;
  report.failure = error instanceof Error && /^[A-Z_]+$/.test(error.message) ? error.message : 'VERIFICATION_FAILED';
  const code = error?.cause?.code;
  if (typeof code === 'string' && /^[A-Z0-9_]+$/.test(code)) report.networkCode = code;
  process.exitCode = 1;
} finally {
  if (userId) {
    const removed = await admin.auth.admin.deleteUser(userId);
    report.cleanup = { userDeleted: !removed.error };
    if (removed.error) { report.success = false; process.exitCode = 1; }
  }
  save(); console.log(JSON.stringify(report));
}
