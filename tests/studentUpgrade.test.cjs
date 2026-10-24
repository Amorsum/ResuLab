const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { createRequire } = require('node:module');
const { IDBFactory } = require('fake-indexeddb');
const esbuild = createRequire(path.join(__dirname, '../workers/node_modules/wrangler/package.json'))('esbuild');
function load(file) { const code = esbuild.buildSync({ entryPoints: [path.join(__dirname, '..', file)], bundle: true, write: false, format: 'cjs', platform: 'browser', target: 'es2022' }).outputFiles[0].text; const m = { exports: {} }; new Function('module', 'exports', code)(m, m.exports); return m.exports; }
const { jobTarget } = load('shared/targetJob.ts');
const { factQuestions } = load('shared/careerReadiness.ts');
const { checkFactualClaims } = load('shared/factualGuards.ts');
const { composeCareer, verifyCareerResult, assembleCareer } = load('shared/careerComposer.ts');
const { careerSources } = load('shared/career.ts');
const lib = load('src/utils/careerLibrary.ts');
const { createEmptyResume } = load('src/constants/defaultResume.ts');
const project = { id: 'course', section: 'projects', sourceTitle: '课程项目', doNotClaim: '不主导', data: { id: 'course', projectName: '校园网站', role: '参与者', startDate: '2025-01', endDate: '2025-06', isCurrent: false, description: '参与课程网站，使用React实现筛选页面，完成课程报告。', techStack: ['React'], url: '' } };
const input = () => ({ jdText: '前端实习：使用React实现筛选页面；要求Kubernetes部署经验。', facts: [structuredClone(project)] });
const plan = { roleTitle: '前端实习', requirements: [{ id: 'r1', text: 'React页面', jdQuote: '使用React实现筛选页面', required: true, coverage: 'supported', gap: '' }, { id: 'r2', text: 'Kubernetes', jdQuote: 'Kubernetes部署经验', required: true, coverage: 'missing', gap: '没有部署经历' }], selected: [{ factId: 'course', requirementIds: ['r1'], reason: '课程页面开发直接支持' }] };
function writing(facts) { return { edits: [{ factId: 'course', field: 'description', after: '使用React实现筛选页面，参与课程网站开发并完成课程报告。', reason: '前置页面实现，保留参与边界', sourceIds: [careerSources(facts).find(s => s.field === 'description').id] }], summary: { text: '', sourceIds: [] } }; }
beforeEach(() => { global.indexedDB = new IDBFactory(); });
test('role-name references are explicit, job-specific, and never replace a supplied JD', () => {
  assert.equal(jobTarget('前端实习生').generic, true);
  assert.match(jobTarget('前端实习生').text, /通用岗位参考/);
  assert.notEqual(jobTarget('前端实习生').text, jobTarget('数据分析实习生').text);
  assert.equal(jobTarget('要求React', 'jd').text, '要求React');
  assert.match(jobTarget('尚未分类的岗位', 'role').text, /待补充招聘 JD/);
});
test('questions prioritize conflicts, avoid answered facts and remain bounded', () => {
  assert.equal(factQuestions([project]).length, 0);
  const sparse = structuredClone(project); sparse.data.description = '做了网页';
  assert.match(factQuestions([sparse])[0].question, /本人具体/);
  sparse.data.endDate = '2024-01';
  assert.equal(factQuestions([sparse])[0].priority, 0);
  assert.equal(factQuestions(Array.from({length: 8}, () => sparse)).length, 3);
});
test('guards reject responsibility inflation, ungrounded skills, negated skills and repetition', () => {
  const src = quote => [{ id: 's1', factId: 'course', field: 'description', quote }];
  assert.throws(() => checkFactualClaims('主导项目', src('参与项目'), '$'), /unsupported_responsibility/);
  assert.throws(() => checkFactualClaims('主导项目', src('不是主导项目'), '$'), /unsupported_responsibility/);
  assert.throws(() => checkFactualClaims('使用Kubernetes部署', src('使用React开发'), '$'), /unsupported_technology/);
  assert.throws(() => checkFactualClaims('使用Python', src('没有使用Python'), '$'), /negated_technology/);
  assert.throws(() => checkFactualClaims('完成报告；完成报告', src('完成报告'), '$'), /duplicate_claim/);
  assert.doesNotThrow(() => checkFactualClaims('参与React开发', src('参与React开发课程项目'), '$'));
});
test('student draft keeps confirmed education, missing skill gaps and source boundaries', async () => {
  const i = input(); i.facts.push({ id: 'edu', section: 'education', sourceTitle: '教育', doNotClaim: '', data: { id: 'edu', schoolName: '合成大学', degree: '本科', major: '计算机', startDate: '2023-09', endDate: '', isCurrent: true, gpa: '', description: '' } });
  const result = await composeCareer(i, async (_instruction, data) => JSON.stringify(data.plan ? writing([project]) : plan));
  assert.equal(result.snapshot.education[0].schoolName, '合成大学');
  assert.equal(result.snapshot.workExperience.length, 0);
  assert.equal(result.plan.requirements[1].coverage, 'missing');
  assert.doesNotMatch(JSON.stringify(result.snapshot), /Kubernetes/);
  assert.equal((await verifyCareerResult(result, i)).modelCalls, 2);
  const forged = writing([project]); forged.edits[0].after = '主导React课程项目';
  assert.throws(() => assembleCareer(forged, [project], plan), /unsupported_responsibility/);
});
test('review choice, restore-original, persistence and reopened versions do not mutate the library', async () => {
  const i = input(), result = await composeCareer(i, async (_instruction, data) => JSON.stringify(data.plan ? writing([project]) : plan));
  const base = createEmptyResume(); base.projects.push(project.data); base.personalInfo.fullName = '合成学生';
  const source = lib.newLibrarySource(base, '课程材料', 'paste', true);
  const draft = { id: result.id, title: '前端', kind: 'tailored', jdText: i.jdText, createdAt: 1, resume: lib.resumeFromCareer(base, result), result };
  const declined = lib.reviewedCareerResume(draft, [], false);
  assert.equal(declined.projects[0].description, project.data.description);
  const accepted = lib.reviewedCareerResume(draft, ['course:description'], false);
  assert.notEqual(accepted.projects[0].description, project.data.description);
  const saved = await lib.updateLibrary(lib.libraryOwner(), 0, current => ({ ...current, sources: [source], drafts: [draft, { ...draft, id: 'reviewed', resume: declined }] }));
  const reopened = await lib.readLibrary(lib.libraryOwner());
  assert.equal(reopened.revision, saved.revision);
  assert.equal(reopened.drafts[1].resume.projects[0].description, project.data.description);
  assert.equal(reopened.sources[0].resume.projects[0].description, project.data.description);
  assert.equal((await lib.readLibrary('other-account')).drafts.length, 0);
});
test('failure recovery is bounded and new fact answers invalidate previous results', async () => {
  let calls = 0;
  await assert.rejects(composeCareer(input(), async () => { calls++; throw new Error('MODEL_TIMEOUT'); }), /MODEL_TIMEOUT/);
  assert.equal(calls, 1);
  calls = 0;
  await assert.rejects(composeCareer(input(), async () => { calls++; return '{invalid'; }));
  assert.equal(calls, 2);
  const i = input(), result = await composeCareer(i, async (_instruction, data) => JSON.stringify(data.plan ? writing([project]) : plan));
  i.facts[0].data.description += '补充：编写8个测试用例。';
  await assert.rejects(verifyCareerResult(result, i), /input_revision_mismatch/);
});
const { formatDateRange } = load('src/utils/dateFormat.ts');
test('missing dates never claim current employment or produce duplicate current labels', () => {
  assert.equal(formatDateRange('', '', false), '');
  assert.equal(formatDateRange('', '', true), '至今');
  assert.equal(formatDateRange('', '2025-06', false), '2025年06月');
  assert.equal(formatDateRange('2025-01', '', true), '2025年01月 - 至今');
});
