const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { IDBFactory } = require('fake-indexeddb');
function load(file) { const code = require('esbuild').buildSync({ entryPoints: [path.join(__dirname, '..', file)], bundle: true, format: 'cjs', platform: 'node', write: false }).outputFiles[0].text; const m = { exports: {} }; new Function('module', 'exports', 'require', code)(m, m.exports, require); return m.exports; }
const docs = load('src/utils/resumeDocuments.ts'), { createEmptyResume } = load('src/constants/defaultResume.ts'), { cleanLibraryResume } = load('src/utils/careerLibrary.ts'), { resumeReducer } = load('src/context/resumeReducer.ts'), checks = load('src/utils/exportChecks.ts'), project = load('shared/project.ts');
const backup = load('src/utils/resumeDocumentBackup.ts');
beforeEach(() => { global.indexedDB = new IDBFactory(); });
test('document snapshots isolate owners, preserve grouping through backups, reject stale writes and do not multiply autosave history', async () => {
  const base = docs.identifyResume(createEmptyResume(), 'base'); base.personalInfo.fullName = '合成候选人';
  let saved = await docs.persistResumeDocument('owner-a', base, 0);
  assert.equal((await docs.readResumeDocuments('owner-b')).length, 0);
  for (let i = 0; i < 5; i++) saved = await docs.persistResumeDocument('owner-a', { ...base, selfEvaluation: String(i) }, saved.revision);
  assert.equal(saved.history.length, 0);
  await assert.rejects(docs.persistResumeDocument('owner-a', base, 1), /其他页面/);
  saved = await docs.persistResumeDocument('owner-a', saved.resume, saved.revision, '切换前');
  assert.equal(saved.history.length, 1);
  const same = await docs.persistResumeDocument('owner-a', saved.resume, saved.revision, '切换前'); assert.equal(same.revision, saved.revision);
  const child = docs.forkResume({ ...base, _cloudId: 'cloud', _cloudUpdatedAt: 'old' }, '前端岗位');
  assert.equal(child.documentMeta.baseId, base.documentMeta.id); assert.notEqual(child.documentMeta.id, base.documentMeta.id); assert.equal(child._cloudId, undefined); assert.equal(child._cloudUpdatedAt, undefined);
  assert.deepEqual(cleanLibraryResume(child).documentMeta, child.documentMeta);
  await docs.persistResumeDocument('owner-a', child, 0);
  assert.equal((await docs.readResumeDocuments('owner-a')).length, 2);
});
test('concurrent writes from two tabs atomically accept one revision and preserve its contents', async () => {
  const resume = docs.identifyResume(createEmptyResume(), 'base');
  const first = await docs.persistResumeDocument('owner-a', resume, 0);
  const attempts = await Promise.allSettled([
    docs.persistResumeDocument('owner-a', { ...resume, selfEvaluation: '窗口一' }, first.revision),
    docs.persistResumeDocument('owner-a', { ...resume, selfEvaluation: '窗口二' }, first.revision),
  ]);
  assert.equal(attempts.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(attempts.filter(r => r.status === 'rejected').length, 1);
  const saved = (await docs.readResumeDocuments('owner-a'))[0];
  assert.ok(['窗口一', '窗口二'].includes(saved.resume.selfEvaluation)); assert.equal(saved.revision, 2);
});
test('a smart-fit action restores all three layout fields in one undo boundary and ignores an unchanged fit', () => {
  const base = createEmptyResume(), next = resumeReducer(base, { type: 'SET_LAYOUT', payload: checks.smartFitLayout(base, 1800) });
  assert.ok(next.fontSize < base.fontSize); assert.ok(next.pageMargin < base.pageMargin); assert.ok(next.lineHeight < base.lineHeight);
  assert.strictEqual(resumeReducer(base, { type: 'SET_LAYOUT', payload: checks.smartFitLayout(base, 1000) }), base);
});
test('export preflight identifies actionable omissions and preserves valid multi-page content', () => {
  const base = createEmptyResume(); assert.equal(checks.inspectResumeExport(base).issues.length, 2);
  base.personalInfo.fullName = '合成'; base.personalInfo.email = 'synthetic@example.invalid';
  assert.equal(checks.inspectResumeExport(base).issues.length, 0);
  base.projects.push({ id: 'p', projectName: '项目', description: '' }); assert.equal(checks.inspectResumeExport(base).issues[0].section, 'projects');
});
test('local rewriting preserves all fields outside the selected paragraph and rejects missing targets', () => {
  const draft = { projectName: '团队项目', role: '成员', summary: '原简述', bullets: ['个人行动一', '个人行动二'], techStack: ['TypeScript'] };
  const candidate = { projectName: '不应改名', role: '不应升职', summary: '不应修改', bullets: ['精简的个人行动', '不应修改'], techStack: ['不应新增'] };
  const next = project.mergeProjectRewrite(draft, candidate, 'bullet:0');
  assert.deepEqual(next, { ...draft, bullets: ['精简的个人行动', '个人行动二'] });
  assert.throws(() => project.mergeProjectRewrite(draft, candidate, 'bullet:4'), /不存在/);
});
test('backup preview remaps document relationships and histories without retaining cloud ownership', async () => {
  const base = docs.identifyResume(createEmptyResume(), 'base'), child = docs.forkResume(base, '岗位'); child._cloudId = 'do-not-restore'; child.careerOrigins = { original: { entryId: 'other-owner', factId: 'fact', revision: 1 } };
  await docs.persistResumeDocument('owner-a', base, 0); await docs.persistResumeDocument('owner-a', child, 0);
  const preview = backup.parseDocumentBackup(backup.exportDocumentBackup(await docs.readResumeDocuments('owner-a')));
  const restoredBase = preview.find(r => r.resume.documentMeta.kind === 'base').resume, restoredChild = preview.find(r => r.resume.documentMeta.kind === 'job').resume;
  assert.notEqual(restoredBase.documentMeta.id, base.documentMeta.id); assert.equal(restoredChild.documentMeta.baseId, restoredBase.documentMeta.id); assert.equal(restoredChild._cloudId, undefined); assert.deepEqual(restoredChild.careerOrigins.original, { entryId: 'other-owner', factId: 'fact', revision: 1, unverified: true });
});
