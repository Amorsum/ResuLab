const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

// Minimal deterministic hook scheduler: tests the hook's effects/cleanup and fake timers,
// without network, a Supabase account, or extra test dependencies.
function harness() {
  let session = { user: { id: 'alice' }, access_token: 'alice-token' };
  let cursor = 0, api, dirty = true;
  const slots = [], effects = [], timers = new Map(), cache = new Map();
  const persisted = new Map();
  const previous = { fetch: global.fetch, localStorage: global.localStorage, sessionStorage: global.sessionStorage };
  const storage = { getItem: key => persisted.get(key) ?? null, setItem: (key, value) => persisted.set(key, value), removeItem: key => persisted.delete(key) };
  global.localStorage = storage; global.sessionStorage = storage;
  const react = {
    useState(initial) { const i = cursor++; slots[i] ??= { value: typeof initial === 'function' ? initial() : initial }; return [slots[i].value, update => { const value = typeof update === 'function' ? update(slots[i].value) : update; if (!Object.is(value, slots[i].value)) { slots[i].value = value; dirty = true; } }]; },
    useRef(value) { const i = cursor++; slots[i] ??= { current: value }; return slots[i]; },
    useEffect(effect, deps) { const i = cursor++; const old = slots[i]; if (!old || deps.some((d, j) => !Object.is(d, old.deps[j]))) { slots[i] = { deps, cleanup: old?.cleanup }; effects.push(() => { slots[i].cleanup?.(); slots[i].cleanup = effect(); }); } },
  };
  function load(file) {
    file = path.resolve(__dirname, '..', file);
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} }; cache.set(file, module);
    const source = fs.readFileSync(file, 'utf8').replaceAll('import.meta.env', '({DEV:false,VITE_AGENT_MOCK:"true",VITE_AGENT_API_BASE:"http://localhost:8788"})');
    const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
    const req = name => name === 'react' ? react : name === './useAuth' ? { useAuth: () => ({ session, loading: false }) } : !name.startsWith('.') ? require(name) : load(path.resolve(path.dirname(file), `${name.replace(/\.js$/, '')}.ts`));
    new Function('require', 'module', 'exports', 'setTimeout', 'clearTimeout', code)(req, module, module.exports, (fn, ms) => { const id = Symbol(); timers.set(id, { fn, ms }); return id; }, id => timers.delete(id));
    return module.exports;
  }
  const { useAgent, AGENT_MOCK } = load('src/hooks/useAgent.ts');
  async function flush() { for (let i = 0; i < 8; i++) { if (dirty) { dirty = false; cursor = 0; api = useAgent(); while (effects.length) effects.shift()(); } await new Promise(setImmediate); } return api; }
  return { flush, get api() { return api; }, persisted, timers, AGENT_MOCK,
    session(value) { session = value; dirty = true; },
    async tick(ms) { const entry = [...timers.entries()].find(([, t]) => t.ms === ms); if (entry) { timers.delete(entry[0]); await entry[1].fn(); } return flush(); },
    close() { for (const slot of slots) slot?.cleanup?.(); Object.assign(global, previous); },
    sample: load('src/constants/defaultResume.ts').createEmptyResume,
    view: load('shared/agent.examples.ts').agentExamples,
  };
}
test('production never enables mock; account-scoped restore stops at awaiting input', async () => {
  const h = harness();
  try {
    assert.equal(h.AGENT_MOCK, false);
    h.persisted.set('resulab.agent.run:alice', h.view.awaiting_input.runId);
    let calls = 0;
    global.fetch = async (_url, options) => { calls++; assert.equal(options.headers.Authorization, 'Bearer alice-token'); return new Response(JSON.stringify(h.view.awaiting_input)); };
    await h.flush();
    assert.equal(h.api.run.status, 'awaiting_input'); assert.equal(calls, 1);
    assert.equal([...h.timers.values()].some(t => t.ms === 1500), false);
    h.api.setDraft('q-1', '不清楚'); await h.flush();
    assert.equal(h.api.drafts['q-1'], '不清楚');
    h.session({ user: { id: 'bob' }, access_token: 'bob-token' }); await h.flush();
    assert.equal(h.api.run, null); assert.equal(h.api.runId, null); assert.deepEqual(h.api.drafts, {}); assert.equal(calls, 1);
  } finally { h.close(); }
});
test('polling schedules only after response, stops on errors, and aborts on cleanup', async () => {
  const h = harness();
  try {
    h.persisted.set('resulab.agent.run:alice', h.view.running.runId);
    let resolve, signal, calls = 0;
    global.fetch = (_url, options) => { calls++; signal = options.signal; return new Promise(done => { resolve = done; }); };
    await h.flush(); assert.equal(calls, 1); assert.equal([...h.timers.values()].some(t => t.ms === 1500), false);
    resolve(new Response(JSON.stringify(h.view.running))); await h.flush();
    assert.equal([...h.timers.values()].some(t => t.ms === 1500), true);
    global.fetch = async () => { calls++; throw new Error('offline'); };
    await h.tick(1500); assert.equal(calls, 2); assert.ok(h.api.error); assert.ok(h.api.runId);
    assert.equal([...h.timers.values()].some(t => t.ms === 1500), false);
    global.fetch = (_url, options) => { signal = options.signal; return new Promise(() => {}); };
    h.api.refresh(); await h.flush();
    h.session(null); await h.flush(); assert.equal(signal.aborted, true); assert.equal(h.api.run, null);
  } finally { h.close(); }
});
test('uncertain creation reuses the exact operation and idempotency key', async () => {
  const h = harness();
  try {
    const bodies = [];
    global.fetch = async (_url, options) => { bodies.push(JSON.parse(options.body)); throw new Error('response lost'); };
    await h.flush();
    await h.api.create('这是用于测试的岗位描述内容。', h.sample()); await h.flush();
    assert.ok(h.api.error); assert.equal(h.api.canResend, true);
    await h.api.resend(); await h.flush(); assert.equal(bodies.length, 2); assert.deepEqual(bodies[0], bodies[1]);
    assert.ok(bodies[0].idempotencyKey); assert.equal(bodies[0].resumeSnapshot.personalInfo, undefined);
    assert.equal([...h.persisted.values()].some(value => value.includes('这是用于测试')), false);
  } finally { h.close(); }
});
test('answer drafts restore and successful answers resume polling with current token', async () => {
  const h = harness();
  try {
    const id = h.view.awaiting_input.runId;
    h.persisted.set('resulab.agent.run:alice', id);
    h.persisted.set(`resulab.agent.answers:alice:${id}`, JSON.stringify({ 'q-1': '没有做过' }));
    global.fetch = async () => new Response(JSON.stringify(h.view.awaiting_input));
    await h.flush(); assert.equal(h.api.drafts['q-1'], '没有做过');
    let sent;
    global.fetch = async (_url, options) => {
      if (options.method === 'POST') { sent = JSON.parse(options.body); return new Response(JSON.stringify({ runId: id, status: 'queued' }), { status: 202 }); }
      return new Response(JSON.stringify(h.view.completed));
    };
    await h.api.answer(); await h.flush(); assert.equal(sent.answers[0].answer, '没有做过'); assert.equal(h.api.run.status, 'completed');
  } finally { h.close(); }
});
