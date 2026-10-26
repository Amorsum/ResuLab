const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function worker() {
  const listeners = {}, stores = new Map(), fetched = [], precached = [];
  const key = request => typeof request === 'string' ? new URL(request, 'https://resulab.amorsum.top').href : request.url;
  let network = async () => new Response('fresh');
  const caches = {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const entries = stores.get(name);
      return {
        async match(request) { return entries.get(key(request))?.clone(); },
        async put(request, response) { entries.set(key(request), response); },
        async addAll(paths) { precached.push(...paths); },
      };
    },
    async keys() { return [...stores.keys()]; },
    async delete(name) { return stores.delete(name); },
  };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../public/sw.js'), 'utf8'), {
    URL, Response, caches,
    self: { location: { origin: 'https://resulab.amorsum.top' }, addEventListener: (name, handler) => { listeners[name] = handler; }, skipWaiting() {}, clients: { claim() {} } },
    fetch: request => { fetched.push(request.url); return network(request); },
  });
  return {
    stores, fetched, precached, caches,
    network(fn) { network = fn; },
    async event(name) { let pending; listeners[name]({ waitUntil(promise) { pending = promise; } }); await pending; },
    async request(url, options = {}) {
      let response;
      listeners.fetch({ request: { url: new URL(url, 'https://resulab.amorsum.top').href, method: options.method || 'GET', mode: options.mode || 'cors', headers: new Headers(options.headers) }, respondWith(promise) { response = promise; } });
      return response;
    },
  };
}

test('Agent, Supabase and legacy AI requests bypass the worker entirely', async () => {
  const w = worker();
  for (const url of ['https://api.example.test/api/agent/runs/id', 'https://project.supabase.co/auth/v1/user', 'https://resulab-api.amorsum.workers.dev/api/membership/status']) {
    assert.equal(await w.request(url), undefined);
  }
  assert.equal(await w.request('/api/agent/runs/id'), undefined);
  assert.equal(await w.request('/assets/private.json', { headers: { Authorization: 'Bearer test' } }), undefined);
  assert.equal(await w.request('/assets/data.json', { method: 'POST' }), undefined);
  assert.equal(w.stores.size, 0);
});

test('navigation gets fresh HTML even when a prior shell is cached', async () => {
  const w = worker();
  const cache = await w.caches.open('resulab-v2');
  await cache.put('/', new Response('old'));
  assert.equal(await (await w.request('/', { mode: 'navigate' })).text(), 'fresh');
  assert.equal(await (await cache.match('/')).text(), 'fresh');
  assert.equal(w.fetched.length, 1);
});

test('offline deep links recover the current cached shell', async () => {
  const w = worker();
  const cache = await w.caches.open('resulab-v2');
  await cache.put('/', new Response('offline shell'));
  w.network(async () => { throw new Error('offline'); });
  assert.equal(await (await w.request('/builder/classic', { mode: 'navigate' })).text(), 'offline shell');
});

test('hashed static assets use cache and unrelated GET requests do not', async () => {
  const w = worker();
  assert.equal(await (await w.request('/assets/app-123.js')).text(), 'fresh');
  w.network(async () => { throw new Error('offline'); });
  assert.equal(await (await w.request('/assets/app-123.js')).text(), 'fresh');
  assert.equal(w.fetched.length, 1);
  assert.equal(await w.request('/private-data.json'), undefined);
});

test('install avoids SPA routes returning 404 and activation clears only ResuLab caches', async () => {
  const w = worker();
  await w.event('install');
  assert.deepEqual(w.precached, ['/', '/manifest.json', '/icon.svg']);
  await w.caches.open('resulab-v1');
  await w.caches.open('unrelated-cache');
  await w.event('activate');
  assert.equal(w.stores.has('resulab-v1'), false);
  assert.equal(w.stores.has('resulab-v2'), true);
  assert.equal(w.stores.has('unrelated-cache'), true);
});
