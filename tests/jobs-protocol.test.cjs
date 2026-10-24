const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { buildSync } = require('esbuild');
const { IDBFactory } = require('fake-indexeddb');
const code = buildSync({ entryPoints: [path.join(__dirname, '../extension/src/background.ts')], bundle: true, write: false, format: 'iife', platform: 'browser', target: 'es2022' }).outputFiles[0].text;
function harness(handler) {
  let listener; let url = 'http://127.0.0.1:3000/jobs';
  let elapsed = 0;
  class Clock extends Date { static now() { return Date.now() + elapsed; } }
  let nextId = 40; const tabs = new Map();
  const chrome = { runtime: { id: 'self-extension', onMessage: { addListener(fn) { listener = fn; } } }, tabs: {
    onRemoved: { addListener() {} }, onUpdated: { addListener() {} }, get: async id => id < 40 ? ({ id, url }) : tabs.get(id),
    create: async options => { const tab = { id: ++nextId, url: options.url, status: 'complete' }; tabs.set(tab.id, tab); return tab; },
    update: async (id, options) => { const tab = { ...tabs.get(id), ...options, status: 'complete' }; tabs.set(id, tab); return tab; },
    sendMessage: async (id, message) => handler ? handler(message, tabs.get(id)) : { ok: false, error: 'No fixture' },
  }, alarms: { create() {}, onAlarm: { addListener() {} } } };
  new Function('chrome', 'indexedDB', 'Date', code)(chrome, new IDBFactory(), Clock);
  const sender = { id: 'self-extension', frameId: 0, tab: { id: 1 }, url };
  const request = (type, payload = null, session = '', ownerId = 'user-a', taskId = '') => ({ channel: 'resulab-jobs', version: 1, direction: 'request', requestId: crypto.randomUUID(), session, ownerId, type, taskId, payload });
  const send = (value, source = sender) => new Promise(resolve => { const accepted = listener(value, source, resolve); if (!accepted) resolve({ ok: false, error: 'schema rejected' }); });
  return { request, send, sender, advance: ms => { elapsed += ms; }, navigate: next => { url = next; } };
}
test('bridge rejects untrusted origins, subframes, BOSS commands, missing sessions, and navigation away', async () => {
  const h = harness();
  for (const source of [{ ...h.sender, url: 'https://attacker.invalid/jobs' }, { ...h.sender, url: 'https://www.zhipin.com/jobs' }, { ...h.sender, frameId: 1 }, { ...h.sender, id: 'other-extension' }]) assert.equal((await h.send(h.request('PAIR'), source)).ok, false);
  const pair = await h.send(h.request('PAIR')); assert.equal(pair.ok, true);
  assert.equal((await h.send(h.request('STATUS', null, 'wrong'))).ok, false);
  assert.equal((await h.send(h.request('STATUS', null, pair.value.session, 'other-user'))).ok, false);
  assert.equal((await h.send(h.request('STATUS', null, pair.value.session))).ok, true);
  h.navigate('http://127.0.0.1:3000/library'); assert.equal((await h.send(h.request('STATUS', null, pair.value.session))).ok, false);
});
test('search verifies keyword, respects bounds and stops when no next page is available', async () => {
  const calls = [];
  const job = { id: 'a', source: 'boss', url: 'https://www.zhipin.com/job_detail/a.html', title: '合成岗位', company: '合成公司', recruiter: '', recruiterKey: '', city: '', salary: '', experience: '', education: '', jobType: '', jdText: '这是合成的完整岗位要求内容。', collectedAt: Date.now() };
  const h = harness(async msg => { calls.push(msg.type); return { ok: true, value: msg.type === 'SEARCH' ? { keyword: '工程师' } : msg.type === 'LIST' ? { urls: [job.url], actualKeyword: '工程师' } : msg.type === 'DETAIL' ? job : { end: true } }; });
  const session = (await h.send(h.request('PAIR'))).value.session;
  const search = { keyword: '工程师', city: '', salaryMin: 0, salaryMax: 0, experience: '', education: '', jobType: '', excludeCompanies: [], limit: 20 };
  const task = (await h.send(h.request('SEARCH', search, session))).value;
  let progress; for (let i = 0; i < 4; i++) progress = (await h.send(h.request('SEARCH_STATUS', null, session, 'user-a', task.id))).value;
  assert.equal(progress.phase, 'done'); assert.equal(progress.jobs.length, 1); assert.deepEqual(calls, ['SEARCH', 'LIST', 'DETAIL', 'NEXT']);
  await h.send(h.request('SEARCH_STATUS', null, session, 'user-a', task.id)); assert.equal(calls.length, 4);
  const wrong = harness(async msg => ({ ok: true, value: msg.type === 'SEARCH' ? {} : { urls: [job.url], actualKeyword: '其他条件' } }));
  const pair = (await wrong.send(wrong.request('PAIR'))).value.session, task2 = (await wrong.send(wrong.request('SEARCH', search, pair))).value;
  await wrong.send(wrong.request('SEARCH_STATUS', null, pair, 'user-a', task2.id));
  wrong.advance(11000);
  const paused = (await wrong.send(wrong.request('SEARCH_STATUS', null, pair, 'user-a', task2.id))).value;
  assert.equal(paused.phase, 'paused'); assert.match(paused.error, /回读不一致/);
});
test('pairing another tab revokes previous session; owner path injection and unknown commands rejected', async () => {
  const h = harness(), first = await h.send(h.request('PAIR'));
  assert.equal((await h.send(h.request('PAIR', null, '', 'user-a:child'))).ok, false);
  const second = await h.send(h.request('PAIR'), { ...h.sender, tab: { id: 2 } });
  assert.equal((await h.send(h.request('STATUS', null, first.value.session))).ok, false);
  assert.equal((await h.send(h.request('STATUS', null, second.value.session), { ...h.sender, tab: { id: 2 } })).ok, true);
  assert.equal((await h.send({ ...h.request('STATUS'), type: 'EXECUTE_JAVASCRIPT', payload: 'alert(1)' })).ok, false);
});

test('search waits for a missing receiver and unready controls, but bounds retries and stops on login', async () => {
  let mode = 'receiver';
  const h = harness(async () => {
    if (mode === 'receiver') throw new Error('Could not establish connection. Receiving end does not exist.');
    if (mode === 'login') return { ok: false, error: '请在 BOSS 完成登录后继续' };
    return { ok: true, value: { ready: false, reason: '等待 BOSS 搜索框加载' } };
  });
  const session = (await h.send(h.request('PAIR'))).value.session;
  const search = { keyword: '工程师', city: '', salaryMin: 0, salaryMax: 0, experience: '', education: '', jobType: '', excludeCompanies: [], limit: 1 };
  const task = (await h.send(h.request('SEARCH', search, session))).value;
  const poll = async () => (await h.send(h.request('SEARCH_STATUS', null, session, 'user-a', task.id))).value;
  assert.equal((await poll()).phase, 'open');
  mode = 'controls'; assert.equal((await poll()).phase, 'open');
  h.advance(31000); const timedOut = await poll(); assert.equal(timedOut.phase, 'paused'); assert.match(timedOut.error, /提交搜索前.*30 秒/);
  const next = (await h.send(h.request('SEARCH', search, session))).value;
  mode = 'login'; const login = (await h.send(h.request('SEARCH_STATUS', null, session, 'user-a', next.id))).value;
  assert.equal(login.phase, 'paused'); assert.match(login.error, /登录/);
});

test('filled search input alone cannot validate a mismatching result URL', async () => {
  const h = harness(async msg => ({ ok: true, value: msg.type === 'SEARCH' ? { ready: true } : { urls: [], actualKeyword: '工程师', appliedKeyword: '旧关键词' } }));
  const session = (await h.send(h.request('PAIR'))).value.session;
  const search = { keyword: '工程师', city: '', salaryMin: 0, salaryMax: 0, experience: '', education: '', jobType: '', excludeCompanies: [], limit: 1 };
  const task = (await h.send(h.request('SEARCH', search, session))).value;
  const poll = async () => (await h.send(h.request('SEARCH_STATUS', null, session, 'user-a', task.id))).value;
  assert.equal((await poll()).phase, 'list'); assert.equal((await poll()).phase, 'list');
  h.advance(11000); assert.equal((await poll()).phase, 'paused');
});
test('PDF transfers bind to manifest, enforce order/hash and keep real send gate closed', async () => {
  const h = harness(), pair = await h.send(h.request('PAIR')), session = pair.value.session;
  const bytes = new TextEncoder().encode('%PDF-synthetic'), hash = Buffer.from(await crypto.subtle.digest('SHA-256', bytes)).toString('hex');
  const id = crypto.randomUUID(), item = { job: { id: 'a', source: 'boss', url: 'https://www.zhipin.com/job_detail/a.html', title: '合成岗位', company: '合成公司', recruiter: '', recruiterKey: '', city: '', salary: '', experience: '', education: '', jobType: '', jdText: '这是测试岗位要求，不涉及真实招聘者。', collectedAt: Date.now() }, filename: 'fixture.pdf', hash, bytes: bytes.length, greeting: '合成文案', snapshotHash: 'a'.repeat(64), allowExistingConversation: false };
  const manifest = { id, ownerId: 'user-a', createdAt: Date.now(), items: [item] };
  assert.equal((await h.send(h.request('PREPARE', manifest, session, 'user-a', id))).ok, true);
  const chunk = { hash, offset: 0, total: bytes.length, data: Buffer.from(bytes).toString('base64') };
  assert.equal((await h.send(h.request('PDF_CHUNK', { ...chunk, offset: 1 }, session, 'user-a', id))).ok, false);
  assert.equal((await h.send(h.request('PDF_CHUNK', { ...chunk, hash: 'b'.repeat(64) }, session, 'user-a', id))).ok, false);
  assert.equal((await h.send(h.request('PDF_CHUNK', chunk, session, 'user-a', id))).ok, true);
  assert.equal((await h.send(h.request('PDF_CHUNK', chunk, session, 'user-a', id))).ok, true);
  assert.equal((await h.send(h.request('PDF_CHUNK', { ...chunk, data: Buffer.from('%PDF-corrupted').toString('base64') }, session, 'user-a', id))).ok, false);
  const normalized = { id, ownerId: 'user-a', items: [item], createdAt: manifest.createdAt };
  const manifestHash = Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(normalized)))).toString('hex');
  const result = await h.send(h.request('APPROVE', { manifestHash }, session, 'user-a', id)); assert.equal(result.ok, false); assert.match(result.error, /尚未/);
});
