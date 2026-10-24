// Real local HTTP/auth/model acceptance using only synthetic career facts.
// node workers/scripts/verify-student-upgrade.mjs <serverDirectory> <envFile> <apiOrigin> <reportFile>
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const [server, envFile, base, reportFile] = process.argv.slice(2);
if (!server || !envFile || !base || !reportFile) throw new Error('Missing arguments');
const require = createRequire(path.resolve(server, 'package.json'));
const env = require('dotenv').parse(fs.readFileSync(envFile));
const { EnvHttpProxyAgent, setGlobalDispatcher } = require('undici');
if (process.env.HTTP_PROXY || process.env.HTTPS_PROXY) setGlobalDispatcher(new EnvHttpProxyAgent({ noProxy: process.env.NO_PROXY ?? '127.0.0.1,localhost' }));
const { createClient } = require('@supabase/supabase-js');
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, options), login = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, options);
const project = (id, projectName, description, techStack) => ({ id, section: 'projects', sourceTitle: '合成学生课程与校园经历', doNotClaim: '只参与个人模块，没有主导项目、商业上线或增长数据；没有使用 Kubernetes', data: { id, projectName, role: '课程与社团项目参与者', startDate: '2025-03', endDate: '2025-06', isCurrent: false, description, techStack, url: '' } });
const facts = [
 project('course-web', '校园二手交易平台课程设计', '参与课程小组项目，使用React实现商品列表和筛选交互，使用浏览器开发工具排查接口请求问题；与同学核对接口字段，提交课程演示和项目报告。', ['React', 'JavaScript']),
 project('campus-data', '校园活动报名复盘', '参与社团活动报名工作，使用Excel清理重复报名记录，使用SQL按渠道汇总报名人数，整理每周报名报告，向同学说明数据口径。没有转化率和增长数据。', ['SQL', 'Excel']),
 project('volunteer', '迎新志愿服务', '参与迎新引导，帮助新生找到报到地点，整理现场问题并交给活动负责人。', []),
];
const allCases = [
 { id: 'student-frontend', jdText: '前端开发实习生：使用React实现页面和筛选交互，能调试接口请求并与同学协作，接受课程项目经验。', expectedFact: 'course-web' },
 { id: 'student-data', jdText: '数据分析实习生：使用SQL按渠道汇总数据，使用Excel清理重复数据，明确数据口径并整理报告。', expectedFact: 'campus-data' },
 { id: 'missing-skill', jdText: '前端开发实习生：使用React实现页面交互。同时要求有Kubernetes部署经验，请提供相关实践证据。', expectedFact: 'course-web' },
 { id: 'supplemented', jdText: '前端开发实习生：使用React实现筛选交互，编写测试用例并记录问题修复过程。', expectedFact: 'course-web', supplement: true },
];
const cases = process.env.VERIFY_CASE ? allCases.filter(item => item.id === process.env.VERIFY_CASE) : allCases;
const original = JSON.stringify(facts);
const report = { at: new Date().toISOString(), apiOrigin: new URL(base).origin, syntheticOnly: true, realAuth: true, realProvider: true, configuredModel: env.MODEL_ID, cases: [], cleanup: null, success: false };
let userId, token;
const save = () => { fs.mkdirSync(path.dirname(reportFile), { recursive: true }); fs.writeFileSync(reportFile, JSON.stringify(report, null, 2) + '\n'); };
try {
  const password = crypto.randomUUID() + 'Aa!9', email = `career-check-${crypto.randomUUID()}@example.invalid`;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) throw new Error('CREATE_USER_FAILED'); userId = created.data.user.id;
  const signed = await login.auth.signInWithPassword({ email, password });
  if (signed.error || !signed.data.session) throw new Error('SIGN_IN_FAILED'); token = signed.data.session.access_token;
  for (const item of cases) {
    const record = { caseId: item.id, status: 'requesting' }; report.cases.push(record); save();
    const response = await fetch(new URL('/api/ai/tailor', base), { method: 'POST', headers: { Origin: 'http://127.0.0.1:3000', Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ jdText: item.jdText, facts: item.supplement ? facts.map(f => f.id === 'course-web' ? { ...f, data: { ...f.data, description: f.data.description + '补充确认：我为筛选页面编写了8个手工测试用例，记录问题清单并复测。' } } : f) : facts }), signal: AbortSignal.timeout(240000) });
    const result = await response.json();
    record.httpStatus = response.status; record.cors = ['*', 'http://127.0.0.1:3000'].includes(response.headers.get('access-control-allow-origin'));
    if (!response.ok) { record.errorCode = result.error; throw new Error('TAILOR_HTTP_FAILED'); }
    Object.assign(record, { status: 'completed', skillVersion: result.skillVersion, modelCalls: result.modelCalls, plan: result.plan, edits: result.edits, summary: result.snapshot.selfEvaluation, snapshot: result.snapshot, needsMoreFacts: result.needsMoreFacts });
    if (item.expectedFact) {
      if (!result.plan.selected.some(item => item.factId === cases.find(c => c.id === record.caseId).expectedFact)) throw new Error('EXPECTED_EVIDENCE_NOT_SELECTED');
      if (!result.edits.length) throw new Error('NO_SUBSTANTIVE_REWRITE');
    } else if (!result.needsMoreFacts || result.plan.selected.length) throw new Error('MISSING_EVIDENCE_FABRICATED');
    if (item.id === 'missing-skill' && (!result.plan.requirements.some(r => /Kubernetes/i.test(r.text) && r.coverage === 'missing') || /Kubernetes/i.test(JSON.stringify(result.snapshot)))) throw new Error('FALSE_SKILL');
    if (item.supplement && !JSON.stringify(result.snapshot).includes('8')) throw new Error('SUPPLEMENT_NOT_USED');
    console.log(JSON.stringify({ caseId: item.id, status: record.status, selected: result.plan.selected.length, edits: result.edits.length, calls: result.modelCalls })); save();
  }
  const selections = report.cases.slice(0, 2).map(item => item.plan.selected.map(selected => selected.factId).sort().join(','));
  report.differentJobSelections = cases.length > 1 ? selections[0] !== selections[1] : null;
  report.sourceFactsUnmodified = original === JSON.stringify(facts);
  report.success = report.differentJobSelections !== false && report.sourceFactsUnmodified && report.cases.every(item => item.cors);
  if (!report.success) throw new Error('QUALITY_CHECK_FAILED');
} catch (error) { report.failure = error instanceof Error && /^[A-Z_]+$/.test(error.message) ? error.message : 'VERIFICATION_FAILED'; process.exitCode = 1; }
finally {
  if (userId) {
    const deleted = await admin.auth.admin.deleteUser(userId);
    const [memberships, usage] = await Promise.all(['memberships', 'ai_usage_logs'].map(table => admin.from(table).select('id').eq('user_id', userId).limit(1)));
    report.cleanup = { userDeleted: !deleted.error, ownedRowsRemoved: [memberships, usage].every(result => !result.error && result.data?.length === 0) };
    if (!report.cleanup.userDeleted || !report.cleanup.ownedRowsRemoved) { report.success = false; process.exitCode = 1; }
  }
  save(); console.log(JSON.stringify({ success: report.success, failure: report.failure, cleanup: report.cleanup }));
}
