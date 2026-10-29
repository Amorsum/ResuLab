const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { createRequire } = require('node:module');
const { IDBFactory } = require('fake-indexeddb');
const wranglerRequire = createRequire(path.join(__dirname, '../workers/node_modules/wrangler/package.json'));
function load(file) {
  const code = wranglerRequire('esbuild').buildSync({ entryPoints: [path.join(__dirname, '..', file)], bundle: true, write: false, format: 'cjs', platform: 'browser', target: 'es2022', define: { 'import.meta.env': '{}' } }).outputFiles[0].text;
  const module = { exports: {} }; new Function('module', 'exports', 'require', code)(module, module.exports, require); return module.exports;
}
const shared = load('shared/careerEntries.ts'), store = load('src/utils/careerStore.ts'), application = load('src/utils/careerApplication.ts');
const defaults = load('src/constants/defaultResume.ts'), reducer = load('src/context/resumeReducer.ts'), legacy = load('src/utils/careerLibrary.ts');
beforeEach(() => { global.indexedDB = new IDBFactory(); });
const entry = (ownerId = 'local-guest') => ({ ...store.blankCareerEntry(), ownerId, revision: 1, createdAt: 1, updatedAt: 1, title: '竞赛演示平台', kind: 'competition', status: 'confirmed',
  facts: [{ id: 'project', section: 'projects', sourceTitle: '竞赛', doNotClaim: '', data: { id: 'project', projectName: '竞赛演示平台', role: '竞赛成员', startDate: '', endDate: '', isCurrent: false, description: '使用 TypeScript 实现查询接口，交付可演示项目', techStack: ['TypeScript'], url: '' } }] });

test('jobs inherit the explicitly selected confirmed facts and reject invalid or stale selection', async () => {
  const oldStorage = global.localStorage;
  try {
    const first = entry(), second = entry(); second.title = '另一个项目';
    for (const source of [first, second]) { const { ownerId, revision, createdAt, updatedAt, ...input } = source; await store.saveCareerEntry(ownerId, input, 0, true); }
    let value = JSON.stringify({ selection: { selectedIds: [`${first.id}:project`], lockedIds: [], excludedIds: [] } });
    global.localStorage = { getItem: () => value };
    let library = await store.readUnifiedLibrary('local-guest'); assert.equal(library.sources.length, 1); assert.equal(library.sources[0].id, first.id);
    value = JSON.stringify({ selection: { selectedIds: ['missing:project'], lockedIds: [], excludedIds: [] } });
    await assert.rejects(store.readUnifiedLibrary('local-guest'), /核对选材/);
    value = '{broken'; await assert.rejects(store.readUnifiedLibrary('local-guest'), /重新选择/);
    global.localStorage.getItem = () => null; library = await store.readUnifiedLibrary('local-guest'); assert.equal(library.sources.length, 2);
  } finally { global.localStorage = oldStorage; }
});

test('manual application preserves unrelated content, tracks origins, skips duplicate sources and rejects stale previews', () => {
  const source = entry(), facts = shared.entryFacts([source]), resume = defaults.createEmptyResume();
  resume.personalInfo.phone = 'private'; resume.fontSize = 16; resume.education.push({ id: 'edu', schoolName: '原学校', degree: '', major: '', startDate: '', endDate: '', isCurrent: false, gpa: '', description: '' });
  const plan = application.prepareCareerApplication(resume, [source], facts, '后端开发');
  const next = reducer.resumeReducer(resume, { type: 'APPLY_CAREER', payload: plan });
  assert.equal(next.projects.length, 1); assert.equal(next.education.length, 1); assert.equal(next.personalInfo.phone, 'private'); assert.equal(next.fontSize, 16);
  assert.equal(Object.values(next.careerOrigins)[0].revision, 1); assert.equal(resume.projects.length, 0);
  const duplicate = application.prepareCareerApplication(next, [source], facts, '后端开发');
  assert.equal(duplicate.rows[0].action, 'skip'); assert.equal(application.applyCareerApplication(next, duplicate), next);
  assert.throws(() => application.applyCareerApplication({ ...resume, fontSize: 17 }, plan), /已变化/);
  const replace = application.prepareCareerApplication(next, [source], facts); replace.rows[0].action = 'replace'; replace.rows[0].fact.data.description = '修正后的真实贡献';
  const replaced = application.applyCareerApplication(next, replace); assert.equal(replaced.projects.length, 1); assert.equal(replaced.projects[0].description, '修正后的真实贡献');
  const version = application.careerVersion({ ...next, _cloudId: 'old' }, [source], facts, '新岗位');
  assert.equal(version._cloudId, undefined); assert.equal(version.education.length, 1); assert.equal(version.education[0].schoolName, '原学校'); assert.equal(version.projects.length, 1); assert.equal(version.personalInfo.phone, 'private');
});

test('drafts survive refresh, remain isolated, increment guest versions and never claim upload success', async () => {
  const source = entry(), { ownerId, revision, createdAt, updatedAt, ...input } = source;
  let saved = await store.saveCareerEntry(ownerId, { ...input, facts: [], status: 'draft', rawText: '还没整理完的结果' }, 0);
  assert.equal((await store.readCareerWorkspace(ownerId)).entries[0].rawText, '还没整理完的结果');
  assert.equal((await store.readCareerWorkspace('other-user')).entries.length, 0);
  saved = await store.saveCareerEntry(ownerId, input, 1, true); assert.equal(saved.entries[0].revision, 2);
  await assert.rejects(store.saveCareerEntry(ownerId, input, 1, true), /已变化/);
  const pending = await store.saveCareerEntry('cloud-user', input, 0, true);
  assert.equal(pending.pending[source.id].expectedRevision, 0); assert.equal(pending.entries[0].status, 'confirmed');
});

test('failed uploads retain input; cloud conflicts preserve both versions and stop blind retries', async () => {
  const source = entry('cloud-user'), input = store.entryInput(source), original = global.fetch;
  try {
    await store.mutateCareerWorkspace('cloud-user', w => ({ ...w, entries: [source] }));
    await store.saveCareerEntry('cloud-user', { ...input, rawText: '本机修正' }, 1, false);
    let writes = 0;
    global.fetch = async (_url, init) => {
      if (init.method !== 'GET') { writes++; return Response.json({ error: { message: '版本冲突' } }, { status: 409 }); }
      return Response.json([{ ...source, revision: 2, rawText: '云端修正' }]);
    };
    let w = await store.syncCareerWorkspace('cloud-user', 'synthetic-token');
    assert.equal(w.entries[0].rawText, '本机修正'); assert.equal(w.remote[0].rawText, '云端修正'); assert.equal(w.pending[source.id].conflict, true);
    await store.syncCareerWorkspace('cloud-user', 'synthetic-token'); assert.equal(writes, 1);
  } finally { global.fetch = original; }
});

test('legacy migration is stable per item; external backups reset confirmation and preserve editable copies', async () => {
  const source = entry(), resume = defaults.createEmptyResume(); resume.projects = source.facts.map(f => f.data);
  const library = legacy.emptyLibrary('owner'); library.sources = [legacy.newLibrarySource(resume, '旧材料', 'editor', true)];
  const first = await store.splitLegacyLibrary(library), second = await store.splitLegacyLibrary(library);
  assert.equal(first[0].id, second[0].id); assert.equal(first[0].facts[0].id, second[0].facts[0].id); assert.equal(first[0].status, 'confirmed');
  const backup = store.exportCareerBackup({ ownerId: 'owner', entries: [source], pending: {}, remote: [] }, library);
  const restored = store.parseCareerBackup(backup); assert.equal(restored.entries[0].status, 'draft'); assert.notEqual(restored.entries[0].id, source.id);
  const facts = shared.entryFacts([source]);
  assert.throws(() => shared.selectionFacts([source], { selectedIds: [facts[0].id], lockedIds: [], excludedIds: [facts[0].id] }));
  const plan = shared.selectedCareerPlan({ roleTitle: '岗位', requirements: [{ id: 'r', coverage: 'supported', text: '接口', jdQuote: '接口', required: true, gap: '' }], selected: [{ factId: 'removed', requirementIds: ['r'], reason: '原证据' }] }, { selectedIds: [facts[0].id], lockedIds: [], excludedIds: [] });
  assert.equal(plan.requirements[0].coverage, 'missing'); assert.deepEqual(plan.selected[0].requirementIds, []);
});

test('authentication outage preserves pending data and the same account can sync after recovery', async () => {
  const source = entry('cloud-user'), input = store.entryInput(source), original = global.fetch;
  let unavailable = true, stored;
  try {
    global.fetch = async (_url, init) => {
      if (unavailable) return Response.json({ error: { code: 'AUTH_UNAVAILABLE', message: '登录验证服务暂时不可用，请检查代理后重试' } }, { status: 503 });
      if (init.method === 'GET') return Response.json(stored ? [stored] : []);
      const body = JSON.parse(init.body); stored = { ...body.entry, ownerId: 'cloud-user', revision: 1, createdAt: 1, updatedAt: 1 };
      return Response.json(stored);
    };
    const pending = await store.saveCareerEntry('cloud-user', input, 0, true, 'unchanged-session');
    assert.equal(pending.entries[0].title, source.title); assert.match(pending.pending[source.id].error, /代理/);
    assert.equal(pending.pending[source.id].conflict, false);
    unavailable = false;
    const recovered = await store.syncCareerWorkspace('cloud-user', 'unchanged-session');
    assert.equal(Object.keys(recovered.pending).length, 0); assert.equal(recovered.entries[0].title, source.title);
  } finally { global.fetch = original; }
});

test('splitting the current resume skips untouched form rows and preserves actual unfinished experiences', async () => {
  const resume = defaults.createEmptyResume();
  resume.personalInfo.fullName = '只有基本信息';
  resume.education.push({ id: 'empty-edu', schoolName: '', major: '', degree: '本科', startDate: '', endDate: '', isCurrent: false, gpa: '', description: '' });
  resume.skills.push({ id: 'empty-skill', skillName: '', level: '熟练', category: '技术' });
  resume.projects.push({ id: 'empty-project', projectName: '', role: '', startDate: '', endDate: '', isCurrent: false, description: '', techStack: [], url: '' });
  const library = legacy.emptyLibrary('owner'); library.sources = [legacy.newLibrarySource(resume, '当前简历', 'editor', false)];
  assert.deepEqual(await store.splitLegacyLibrary(library), []);
  library.sources[0].resume.projects[0].description = '正在实现数据查询页面，结果尚未整理';
  const partial = await store.splitLegacyLibrary(library);
  assert.equal(partial.length, 1); assert.equal(partial[0].status, 'draft');
  assert.equal(partial[0].facts[0].data.description, '正在实现数据查询页面，结果尚未整理');
});
