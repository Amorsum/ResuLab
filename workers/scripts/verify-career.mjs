// Real local HTTP/auth/model acceptance using only synthetic career facts.
// node workers/scripts/verify-career.mjs <serverDirectory> <envFile> <apiOrigin> <reportFile>
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
const facts = [
  { id: 'work-backend', section: 'workExperience', sourceTitle: '完整开发经历', doNotClaim: '只参与实现，方案由同事确定，不能写成主导架构或性能优化', data: { id: 'work-backend', companyName: '合成电商团队', position: '开发实习生', startDate: '2025-01', endDate: '', isCurrent: true, city: '', description: '每天整理发版说明，使用TypeScript开发订单查询接口，负责筛选条件和分页逻辑，与前端核对接口字段，协助查看日志定位接口报错。接口方案由同事确定。', highlights: ['参与实现订单查询接口'] } },
  { id: 'project-data', section: 'projects', sourceTitle: '数据整理补充材料', doNotClaim: '没有转化率分析或增长成果，不写负责人或项目主导', data: { id: 'project-data', projectName: '活动报名数据整理', role: '数据整理参与者', startDate: '2024-06', endDate: '2024-09', isCurrent: false, description: '先发报名通知，还会用Excel对报名数据去重，做周报；使用SQL按渠道汇总报名数据，周报按渠道展示报名人数，不包含转化率分析。', techStack: ['SQL', 'Excel'], url: '' } },
  { id: 'project-material', section: 'projects', sourceTitle: '物料整理材料', doNotClaim: '只协助整理，不能写成品牌设计经验', data: { id: 'project-material', projectName: '宣传物料整理', role: '协助整理', startDate: '2024-01', endDate: '2024-03', isCurrent: false, description: '整理活动海报素材并核对文案，协助发送通知。', techStack: [], url: '' } },
  ...[['TypeScript', '编程语言'], ['SQL', '数据库'], ['Excel', '工具']].map(([name, category], index) => ({ id: `skill-${index}`, section: 'skills', sourceTitle: '已确认技能', doNotClaim: '保持掌握等级，不能升级为精通', data: { id: `skill-${index}`, skillName: name, level: '掌握', category } })),
];
const cases = [
  { id: 'backend', jdText: '后端开发岗位：使用TypeScript开发业务接口，实现筛选条件和分页逻辑；与前端协作核对字段，协助定位接口报错。', expectedFact: 'work-backend' },
  { id: 'data-operations', jdText: '数据运营岗位：使用SQL按渠道汇总活动报名数据，使用Excel进行数据去重和周报整理，并说明数据口径。', expectedFact: 'project-data' },
  { id: 'missing', jdText: '招聘兽医，要求持有执业兽医资格，具备动物外科手术经验。', expectedFact: null },
];
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
    const response = await fetch(new URL('/api/ai/tailor', base), { method: 'POST', headers: { Origin: 'http://127.0.0.1:3000', Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ jdText: item.jdText, facts }), signal: AbortSignal.timeout(240000) });
    const result = await response.json();
    record.httpStatus = response.status; record.cors = ['*', 'http://127.0.0.1:3000'].includes(response.headers.get('access-control-allow-origin'));
    if (!response.ok) { record.errorCode = result.error; throw new Error('TAILOR_HTTP_FAILED'); }
    Object.assign(record, { status: 'completed', skillVersion: result.skillVersion, modelCalls: result.modelCalls, plan: result.plan, edits: result.edits, summary: result.snapshot.selfEvaluation, snapshot: result.snapshot, needsMoreFacts: result.needsMoreFacts });
    if (item.expectedFact) {
      if (!result.plan.selected.some(item => item.factId === cases.find(c => c.id === record.caseId).expectedFact)) throw new Error('EXPECTED_EVIDENCE_NOT_SELECTED');
      if (!result.edits.length) throw new Error('NO_SUBSTANTIVE_REWRITE');
    } else if (!result.needsMoreFacts || result.plan.selected.length) throw new Error('MISSING_EVIDENCE_FABRICATED');
    console.log(JSON.stringify({ caseId: item.id, status: record.status, selected: result.plan.selected.length, edits: result.edits.length, calls: result.modelCalls })); save();
  }
  const selections = report.cases.slice(0, 2).map(item => item.plan.selected.map(selected => selected.factId).sort().join(','));
  report.differentJobSelections = selections[0] !== selections[1];
  report.sourceFactsUnmodified = original === JSON.stringify(facts);
  report.success = report.differentJobSelections && report.sourceFactsUnmodified && report.cases.every(item => item.cors);
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
