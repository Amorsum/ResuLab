const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { createRequire } = require('node:module');
const { IDBFactory } = require('fake-indexeddb');
const wranglerRequire = createRequire(path.join(__dirname, '../workers/node_modules/wrangler/package.json'));
function load(file) {
  const code = wranglerRequire('esbuild').buildSync({ entryPoints: [path.join(__dirname, '..', file)], bundle: true, write: false, format: 'cjs', platform: 'browser', target: 'es2022' }).outputFiles[0].text;
  const module = { exports: {} }; new Function('module', 'exports', code)(module, module.exports); return module.exports;
}
const lib = load('src/utils/careerLibrary.ts'), shared = load('shared/career.ts'), composer = load('shared/careerComposer.ts');
function resume() {
  return { templateId: 'classic', accentColor: '#2563eb', fontFamily: 'yahei', fontSize: 14, lineHeight: 22, pageMargin: 15, lastModified: 1,
    personalInfo: { fullName: '合成候选人', gender: '', birthYear: '', birthMonth: '', phone: 'private-phone', email: 'private@example.invalid', city: '', avatar: 'private-avatar', jobTitle: '', yearsOfExperience: '' },
    jobIntention: { desiredPosition: '', desiredCity: '', expectedSalary: '', jobType: '', availableDate: '' },
    education: [], projects: [], skills: [{ id: 'skill-1', skillName: 'TypeScript', level: '掌握', category: '编程语言' }], certificates: [], languages: [], selfEvaluation: '原有自我评价', socialLinks: [], _cloudId: 'old-cloud-id',
    workExperience: [{ id: 'work-1', companyName: '合成团队', position: '开发实习生', startDate: '2025-01', endDate: '', isCurrent: true, city: '', description: '协助查看日志，使用TypeScript开发订单查询接口，与前端核对字段', highlights: [] }] };
}
function bank() {
  const value = lib.emptyLibrary('owner-a'); value.sources = [lib.newLibrarySource(resume(), '完整经历', 'editor', true)]; return value;
}
function input() { return lib.libraryInput(bank(), '后端岗位：使用TypeScript开发订单查询接口，与前端协作。'); }
function plan(value = input()) {
  return { roleTitle: '后端开发', requirements: [{ id: 'req-1', text: 'TypeScript接口开发', jdQuote: '使用TypeScript开发订单查询接口', required: true, coverage: 'supported', gap: '' }], selected: [{ factId: value.facts.find(fact => fact.section === 'workExperience').id, requirementIds: ['req-1'], reason: '已有订单接口开发与前端协作经历' }] };
}
function writing(value = input(), selectedPlan = plan(value)) {
  const selected = value.facts.filter(fact => selectedPlan.selected.some(item => item.factId === fact.id));
  const source = shared.careerSources(selected).find(source => source.field === 'description');
  return { edits: [{ factId: selected[0].id, field: 'description', after: '使用TypeScript开发订单查询接口，与前端核对字段；协助查看日志。', reason: '将接口开发和协作前置，保留协助边界', sourceIds: [source.id] }], summary: { text: '', sourceIds: [] } };
}
beforeEach(() => { global.indexedDB = new IDBFactory(); });

test('extracted skills cannot inherit model-guessed proficiency and excluded skills retain project facts', () => {
  const proposed = resume(); proposed.skills[0].level = '精通';
  assert.throws(() => lib.approveLibrarySkills(proposed, {}), /确认/);
  assert.throws(() => lib.approveLibrarySkills(proposed, { 'skill-1': { include: true, level: '' } }), /确认/);
  const approved = lib.approveLibrarySkills(proposed, { 'skill-1': { include: true, level: '了解' } });
  assert.equal(approved.skills[0].level, '了解'); assert.equal(proposed.skills[0].level, '精通');
  const excluded = lib.approveLibrarySkills(proposed, { 'skill-1': { include: false, level: '' } });
  assert.equal(excluded.skills.length, 0); assert.deepEqual(excluded.workExperience, proposed.workExperience);
});

test('confirmed selected materials are deduplicated without sending contact/layout data or generated summaries', () => {
  const value = bank(); value.sources.push(lib.newLibrarySource(resume(), '重复简历', 'editor', true));
  value.sources.push(lib.newLibrarySource(resume(), '未经确认', 'editor', false));
  const facts = lib.libraryFacts(value);
  assert.equal(facts.length, 2);
  const body = JSON.stringify(lib.libraryInput(value, '后端岗位要求TypeScript接口开发'));
  for (const privateValue of ['private-phone', 'private@example.invalid', 'private-avatar', '原有自我评价', 'old-cloud-id']) assert.ok(!body.includes(privateValue));
  value.sources.forEach(source => { source.included = false; });
  assert.deepEqual(lib.libraryFacts(value), []);
});
test('blank form rows do not become facts and duplicate-source claim restrictions are retained', () => {
  const value = bank(), duplicate = lib.newLibrarySource(resume(), '第二份', 'editor', true);
  duplicate.doNotClaim = '不能写成主导'; value.sources.push(duplicate);
  const blank = resume(); blank.workExperience[0].companyName = ''; blank.skills[0].skillName = '';
  value.sources.push(lib.newLibrarySource(blank, '空表单行', 'editor', true));
  const facts = lib.libraryFacts(value);
  assert.equal(facts.length, 2); assert.ok(facts.every(fact => fact.doNotClaim === '不能写成主导'));
});
test('IndexedDB writes commit durably, isolate accounts and reject conflicting revisions atomically', async () => {
  const empty = await lib.readLibrary('owner-a');
  const results = await Promise.allSettled([
    lib.updateLibrary('owner-a', empty.revision, current => ({ ...current, sources: bank().sources })),
    lib.updateLibrary('owner-a', empty.revision, current => ({ ...current, drafts: [{ id: 'other' }] })),
  ]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter(result => result.status === 'rejected').length, 1);
  const saved = await lib.readLibrary('owner-a'); assert.equal(saved.revision, 1); assert.equal(saved.sources.length, 1);
  const other = await lib.readLibrary('owner-b'); assert.equal(other.sources.length, 0); assert.equal(other.drafts.length, 0);
  await assert.rejects(lib.updateLibrary('owner-a', 1, () => { throw new Error('simulated failure'); }), /simulated failure/);
  assert.equal((await lib.readLibrary('owner-a')).revision, 1);
});
test('backups restore as unconfirmed materials and editable copies without promoting AI writing to fact', () => {
  const value = bank(); value.drafts.push({ id: 'draft-1', title: '岗位副本', jdText: '目标JD', kind: 'tailored', createdAt: 1, resume: resume(), result: { invented: 'untrusted metadata' } });
  const restored = lib.parseLibraryBackup(lib.exportLibrary(value));
  assert.equal(restored.sources[0].confirmed, false); assert.equal(restored.sources[0].included, false);
  assert.notEqual(restored.sources[0].id, value.sources[0].id);
  assert.equal(restored.drafts[0].kind, 'editor-backup'); assert.equal(restored.drafts[0].result, undefined);
  assert.equal(restored.sources[0].resume.personalInfo.fullName, '合成候选人');
});
test('input validation rejects privileged fields, duplicate IDs and invalid item types', () => {
  const value = input();
  for (const mutate of [copy => { copy.facts[0].data.phone = 'secret'; }, copy => { copy.facts.push(structuredClone(copy.facts[0])); }, copy => { copy.facts[0].data.isCurrent = 'true'; }]) {
    const copy = structuredClone(value); mutate(copy); assert.throws(() => shared.parseCareerInput(copy));
  }
});
test('selection requires actual JD quotations, known facts and supported requirement links', () => {
  const value = input();
  for (const mutate of [copy => { copy.requirements[0].jdQuote = '不存在的要求'; }, copy => { copy.selected[0].factId = 'invented'; }, copy => { copy.selected = []; }, copy => { copy.selected[0].requirementIds = ['unknown']; }]) {
    const copy = plan(value); mutate(copy); assert.throws(() => composer.parseCareerPlan(copy, value));
  }
});
test('writing preserves company/date/proficiency metadata and rejects cross-item evidence and new metrics', () => {
  const value = input(), selectedPlan = composer.parseCareerPlan(plan(value), value), original = JSON.stringify(value);
  const assembled = composer.assembleCareer(writing(value, selectedPlan), value.facts, selectedPlan);
  assert.equal(assembled.snapshot.workExperience[0].companyName, '合成团队');
  assert.equal(assembled.snapshot.workExperience[0].position, '开发实习生');
  assert.equal(assembled.snapshot.workExperience[0].startDate, '2025-01');
  assert.equal(JSON.stringify(value), original);
  for (const mutate of [copy => { copy.edits[0].after += '性能提升90%'; }, copy => { copy.edits[0].sourceIds = ['unknown-source']; }, copy => { copy.edits[0].field = 'position'; }, copy => { copy.edits[0].after = ['wrong type']; }, copy => { copy.companyName = '新公司'; }]) {
    const copy = writing(value, selectedPlan); mutate(copy); assert.throws(() => composer.assembleCareer(copy, value.facts, selectedPlan));
  }
  const skill = value.facts.find(fact => fact.section === 'skills');
  selectedPlan.selected.push({ factId: skill.id, requirementIds: ['req-1'], reason: '已有技能' });
  const catalog = shared.careerSources(selectedPlan.selected.map(item => value.facts.find(fact => fact.id === item.factId)));
  const cross = writing(value, selectedPlan); cross.edits[0].sourceIds = [catalog.find(source => source.factId === skill.id).id];
  assert.throws(() => composer.assembleCareer(cross, value.facts, selectedPlan), { rule: 'source_ownership' });
});
test('compose repairs a cosmetic edit at most once and client validation detects tampered snapshots and stale input', async () => {
  const value = input(), expectedPlan = plan(value); let calls = 0;
  const result = await composer.composeCareer(value, async instruction => {
    calls++;
    if (calls === 1) return JSON.stringify(expectedPlan);
    const output = writing(value, expectedPlan);
    if (calls === 2) output.edits[0].after = value.facts.find(fact => fact.id === expectedPlan.selected[0].factId).data.description + '。';
    if (calls === 3) assert.match(instruction, /cosmetic_only_change/);
    return JSON.stringify(output);
  });
  assert.equal(calls, 3); assert.equal(result.modelCalls, 3);
  await composer.verifyCareerResult(result, value);
  const forged = structuredClone(result); forged.snapshot.workExperience[0].companyName = '伪造公司';
  await assert.rejects(composer.verifyCareerResult(forged, value), { rule: 'snapshot_tampered' });
  await assert.rejects(composer.verifyCareerResult(result, { ...value, jdText: '另一个岗位要求数据运营经验' }), { rule: 'input_revision_mismatch' });
  const master = resume(), draft = lib.resumeFromCareer(master, result);
  assert.equal(master.workExperience[0].description, resume().workExperience[0].description);
  assert.equal(draft.personalInfo.phone, 'private-phone'); assert.equal(draft._cloudId, undefined);
});
test('a failed repair cannot obtain more calls, while genuine gaps produce no fabricated resume', async () => {
  const value = input(), selectedPlan = plan(value); let calls = 0;
  await assert.rejects(composer.composeCareer(value, async () => {
    calls++; if (calls === 1) return JSON.stringify(selectedPlan);
    const output = writing(value, selectedPlan); output.edits[0].after += ' 提升90%'; return JSON.stringify(output);
  }), { rule: 'unsupported_number' });
  assert.equal(calls, 3);
  calls = 0;
  const result = await composer.composeCareer(value, async () => {
    calls++; return JSON.stringify({ roleTitle: '缺少经验的岗位', requirements: [{ ...selectedPlan.requirements[0], coverage: 'missing', gap: '未提供相关经历' }], selected: [] });
  });
  assert.equal(calls, 1); assert.equal(result.needsMoreFacts, true); assert.equal(result.snapshot.workExperience.length, 0);
  await composer.verifyCareerResult(result, value);
});
