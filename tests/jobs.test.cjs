const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { buildSync } = require('esbuild');
const { indexedDB } = require('fake-indexeddb');
function load(file, globals = {}) {
  const code = buildSync({ entryPoints: [path.join(__dirname, '..', file)], bundle: true, write: false, format: 'cjs', platform: 'node', target: 'es2022' }).outputFiles[0].text;
  const module = { exports: {} }; new Function('module', 'exports', 'require', ...Object.keys(globals), code)(module, module.exports, require, ...Object.values(globals)); return module.exports;
}
const jobs = load('shared/jobs.ts'), { ExecutionEngine, batchView } = load('extension/src/engine.ts'), match = load('shared/jobMatch.ts');
const baseJob = { id: 'job-a', source: 'boss', url: 'https://www.zhipin.com/job_detail/job-a.html', title: '前端开发', company: '合成公司 A', recruiter: '合成招聘者', recruiterKey: 'boss-a', city: '上海', salary: '15-25K·14薪', experience: '1-3年', education: '本科', jobType: '全职', jdText: '使用 TypeScript 开发页面并编写测试。', collectedAt: Date.now() };
const input = { jdText: baseJob.jdText, facts: [{ id: 's1', section: 'skills', data: { id: 's1', skillName: 'TypeScript', category: '开发', level: '掌握' }, sourceTitle: '已确认材料', doNotClaim: '' }] };
const plan = { roleTitle: '前端开发', requirements: [{ id: 'r1', text: 'TypeScript 开发', jdQuote: 'TypeScript', required: true, coverage: 'supported', gap: '' }], selected: [{ factId: 's1', requirementIds: ['r1'], reason: '已确认掌握 TypeScript' }] };
async function harness(options = {}) {
  let stored; const pdf = new TextEncoder().encode('%PDF-fixture-only'), hash = await jobs.sha256(pdf), ledger = [], calls = [], external = new Map();
  const item = { job: baseJob, filename: '合成公司_前端_123.pdf', hash, bytes: pdf.length, greeting: '您好，我希望应聘前端开发。', snapshotHash: 'a'.repeat(64), allowExistingConversation: false };
  const manifest = { id: crypto.randomUUID(), ownerId: 'owner-a', createdAt: Date.now(), items: [item] };
  const store = {
    load: async () => structuredClone(stored), save: async b => { stored = structuredClone(b); }, pdf: async h => h === hash ? pdf : undefined,
    ledger: async () => structuredClone(ledger), remember: async e => { const i = ledger.findIndex(row => row.account === e.account && row.jobId === e.jobId); if (i >= 0) ledger.splice(i, 1); ledger.push(e); },
  };
  let account = 'boss-account-a';
  const driver = {
    capabilities: { ...jobs.BOSS_CAPABILITIES, communicate: true, attach: true }, identity: async () => account,
    inspect: async i => external.get(i.job.id) || { kind: 'absent', message: 'empty' },
    communicate: async i => { calls.push(['communicate', i.job.id]); const receipt = { kind: 'communicated', message: 'verified greeting' }; external.set(i.job.id, receipt); if (options.crashGreeting) throw new Error('lost connection'); return receipt; },
    attach: async (i, data) => { calls.push(['attach', i.job.id, i.hash]); assert.equal(await jobs.sha256(data), i.hash); const receipt = { kind: options.pending ? 'pending' : 'sent', message: options.pending ? 'wait for consent' : 'verified attachment' }; external.set(i.job.id, receipt); return receipt; },
  };
  return { store, driver, engine: new ExecutionEngine(store, driver), manifest, item, calls, external, ledger, setAccount: value => { account = value; }, get batch() { return stored; } };
}
test('job URLs and identity cannot be mismatched or leave BOSS; manifests reject extra fields and duplicates', () => {
  assert.equal(jobs.jobSchema.parse(baseJob).id, 'job-a');
  assert.equal(jobs.jobSchema.parse({ ...baseJob, id: 'job_a~', url: 'https://www.zhipin.com/job_detail/job_a~.html' }).id, 'job_a~');
  for (const url of ['https://attacker.invalid/job_detail/job-a.html', 'javascript:alert(1)', 'https://www.zhipin.com/job_detail/job-b.html']) assert.equal(jobs.jobSchema.safeParse({ ...baseJob, url }).success, false);
  assert.equal(jobs.jobSchema.safeParse({ ...baseJob, command: 'send' }).success, false);
  assert.equal(jobs.searchSchema.safeParse({ ...jobs.defaultSearch, keyword: '工程师', limit: 51 }).success, false);
  assert.equal(jobs.searchSchema.safeParse({ ...jobs.defaultSearch, keyword: '工程师', salaryMin: 20000, salaryMax: 10000 }).success, false);
});
test('filter only explicit mismatches, daily salaries and missing details stay unknown; rank required evidence first', () => {
  assert.deepEqual(jobs.filterJob(baseJob, { ...jobs.defaultSearch, keyword: '前端', city: '北京', salaryMin: 30000 }).excluded, ['城市不符合所选范围', '薪资范围不相交']);
  const result = jobs.filterJob({ ...baseJob, city: '', salary: '200元/天' }, { ...jobs.defaultSearch, keyword: '前端', city: '上海', salaryMin: 20000 });
  assert.equal(result.excluded.length, 0); assert.equal(result.unknown.length, 2);
  const weak = { job: { ...baseJob, id: 'b' }, match: { plan: { ...plan, requirements: [{ ...plan.requirements[0], coverage: 'partial' }] } } };
  assert.equal(jobs.rankJobs([weak, { job: baseJob, match: { plan } }])[0].job.id, baseJob.id);
});
test('matching validates actual JD quotes and factual IDs; no writing stage; stale input rejected', async () => {
  let calls = 0; const result = await match.matchCareerJob(input, async () => { calls++; return JSON.stringify(plan); });
  assert.equal(calls, 1); assert.equal(result.modelCalls, 1); await match.verifyJobMatch(result, input);
  await assert.rejects(match.verifyJobMatch(result, { ...input, jdText: '不同岗位，需要 Python 分析数据。' }));
  calls = 0; await assert.rejects(match.matchCareerJob(input, async () => { calls++; return JSON.stringify({ ...plan, selected: [{ ...plan.selected[0], factId: 'invented' }] }); })); assert.equal(calls, 2);
  calls = 0; await assert.rejects(match.matchCareerJob(input, async () => { calls++; throw new Error('network'); })); assert.equal(calls, 1);
});
test('unapproved work cannot send; repeated approval and polling cannot duplicate a delivery', async () => {
  const h = await harness(); await h.engine.step(); assert.equal(h.calls.length, 0);
  await h.engine.approve(h.manifest); await h.engine.approve(h.manifest);
  await h.engine.step(); assert.equal(h.batch.items[0].status, 'communicated');
  await h.engine.step(); assert.equal(h.batch.items[0].status, 'sent');
  await h.engine.step(); await h.engine.step(); await h.engine.approve(h.manifest);
  assert.equal(h.calls.length, 2); assert.equal(h.batch.state, 'completed');
  assert.equal(batchView(h.batch, 1).events.length, 1);
});
test('PDF corruption, edited approvals and unverified production capabilities block sending', async () => {
  const h = await harness(); await assert.rejects(h.engine.approve({ ...h.manifest, items: [{ ...h.item, hash: 'b'.repeat(64) }] }), /附件/);
  h.driver.capabilities = jobs.BOSS_CAPABILITIES; await assert.rejects(h.engine.approve(h.manifest), /尚未/);
  h.driver.capabilities = { ...jobs.BOSS_CAPABILITIES, communicate: true, attach: true };
  await h.engine.approve(h.manifest);
  await assert.rejects(h.engine.approve({ ...h.manifest, items: [{ ...h.item, greeting: 'changed' }] }), /不可修改/);
  const modified = await h.store.load(); modified.manifest.items[0].greeting = 'changed'; await h.store.save(modified); await h.engine.step(); assert.equal(h.batch.state, 'paused'); assert.equal(h.calls.length, 0);
});
test('attachment pending retains its own PDF and continues the next job; not reported sent', async () => {
  const h = await harness({ pending: true }); h.manifest.items.push({ ...h.item, job: { ...baseJob, id: 'job-b', url: 'https://www.zhipin.com/job_detail/job-b.html', company: '合成公司 B', recruiterKey: 'boss-b' } });
  await h.engine.approve(h.manifest); for (let i = 0; i < 5; i++) await h.engine.step();
  assert.deepEqual(h.batch.items.map(row => row.status), ['attachment_pending', 'attachment_pending']); assert.equal(h.batch.state, 'completed');
  assert.deepEqual(h.calls.map(row => row[1]), ['job-a', 'job-a', 'job-b', 'job-b']);
});
test('ambiguous external effects pause, survive worker restart, and never auto-repeat', async () => {
  const h = await harness({ crashGreeting: true }); await h.engine.approve(h.manifest); await h.engine.step();
  assert.equal(h.batch.items[0].status, 'unknown'); assert.equal(h.batch.state, 'paused');
  const resumed = new ExecutionEngine(h.store, h.driver); await resumed.recover(); await resumed.step(); assert.equal(h.calls.length, 1);
  h.external.clear(); await assert.rejects(resumed.resume(), /结果不明/); assert.equal(h.calls.length, 1);
  h.external.set('job-a', { kind: 'communicated', message: 'positive exact receipt' }); await resumed.resume(); await resumed.step();
  assert.equal(h.calls.filter(c => c[0] === 'communicate').length, 1); assert.equal(h.batch.items[0].status, 'sent');
});
test('write-ahead checkpoint is recovered as unknown; account changes and cancellation stop work', async () => {
  const h = await harness(); await h.engine.approve(h.manifest); const batch = await h.store.load(); batch.items[0].phase = 'communicate'; await h.store.save(batch); await h.engine.recover();
  assert.equal(h.batch.items[0].status, 'unknown'); assert.equal(h.batch.state, 'paused');
  const other = await harness(); await other.engine.approve(other.manifest); other.setAccount('different'); await other.engine.step(); assert.equal(other.batch.state, 'paused'); assert.equal(other.calls.length, 0);
  other.setAccount('boss-account-a'); await other.engine.cancel(); await other.engine.step(); assert.equal(other.batch.items[0].status, 'cancelled'); assert.equal(other.calls.length, 0);
});
test('an old greeting cannot resolve an uncertain attachment and trigger a duplicate attachment', async () => {
  const h = await harness();
  h.driver.attach = async () => { h.calls.push(['attach', 'job-a']); throw new Error('response lost after attachment click'); };
  await h.engine.approve(h.manifest); await h.engine.step(); await h.engine.step();
  assert.equal(h.batch.items[0].status, 'unknown'); assert.equal(h.batch.items[0].uncertainPhase, 'attach');
  await h.engine.recover(); await assert.rejects(h.engine.resume(true), /结果不明/);
  assert.equal(h.calls.filter(c => c[0] === 'attach').length, 1);
  h.external.set('job-a', { kind: 'sent', message: 'exact attachment receipt' }); await h.engine.resume(true); await h.engine.step();
  assert.equal(h.batch.items[0].status, 'sent'); assert.equal(h.calls.filter(c => c[0] === 'attach').length, 1);
});
test('ledger and repeated recruiters require review; already delivered jobs cannot be sent again', async () => {
  const h = await harness(); h.ledger.push({ account: 'boss-account-a', jobId: 'other', recruiterKey: 'boss-a', status: 'communicated', hash: h.item.hash });
  await assert.rejects(h.engine.approve(h.manifest), /复核/); h.manifest.items[0].allowExistingConversation = true;
  await h.engine.approve(h.manifest); await h.engine.step(); await h.engine.step(); await h.engine.step();
  await assert.rejects(h.engine.approve({ ...h.manifest, id: crypto.randomUUID() }), /重复投递/);
});
test('IndexedDB preserves PDF blobs, isolates users and refuses stale revisions', async () => {
  const store = load('src/utils/jobsStore.ts', { indexedDB });
  const a = await store.readJobs('test-a'), b = await store.readJobs('test-b');
  a.records.push({ job: baseJob, status: 'review', selected: true, draft: { pdf: new Blob(['%PDF-test']) } });
  const saved = await store.saveJobs(a); assert.equal(saved.revision, 1); await assert.rejects(store.saveJobs(a), /其他页面/);
  assert.equal((await store.readJobs('test-b')).records.length, 0);
  assert.equal(await (await store.readJobs('test-a')).records[0].draft.pdf.text(), '%PDF-test');
  await store.clearJobs('test-a'); assert.equal((await store.readJobs('test-a')).records.length, 0); assert.equal(b.revision, 0);
});
test('archived batches retain pending attachments independently of the latest batch', async () => {
  const storage = load('extension/src/storage.ts', { indexedDB });
  const a = await harness({ pending: true }), store = storage.executionStore('history-user');
  await a.engine.approve(a.manifest); await a.engine.step(); await a.engine.step(); await a.engine.step(); await store.save(a.batch);
  const b = await harness(); await b.engine.approve(b.manifest); await store.save(b.batch);
  assert.equal((await store.load()).manifest.id, b.manifest.id);
  const old = await storage.executionStore('history-user', a.manifest.id).load(); assert.equal(old.items[0].status, 'attachment_pending');
  assert.equal((await storage.executionStore('another-history-user', a.manifest.id).load()), undefined);
});
