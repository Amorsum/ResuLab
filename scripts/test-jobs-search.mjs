// Isolated packaged-extension regression. All pages are synthetic and network is intercepted.
import { chromium } from '@playwright/test';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const root = fileURLToPath(new URL('..', import.meta.url));
const extension = path.join(root, 'release-artifacts/jobs-extension');
const profile = await mkdtemp(path.join(os.tmpdir(), 'resulab-search-test-'));
const context = await chromium.launchPersistentContext(profile, { channel: 'chromium', headless: true, args: ['--host-resolver-rules=MAP * ~NOTFOUND', `--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
let variant = 'delayed';
try {
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    let body = '<p>合成工作台</p>';
    if (url.hostname === 'www.zhipin.com' && url.pathname === '/web/geek/jobs') {
      const field = variant === 'placeholder' ? 'placeholder="搜索职位、公司"' : 'class="ipt-search"';
      body = `<header><button onclick="window.wrongClick=true">搜索</button></header><main></main><script>
        window.clickedCount=0; window.submittedQuery='';
        setTimeout(() => {
          document.querySelector('main').innerHTML='<section><input ${field}><a class="search-btn"><span>搜 索</span></a></section><div id="results"></div>';
          let reactiveQuery=''; const input=document.querySelector('input');
          input.addEventListener('input', () => { queueMicrotask(() => { reactiveQuery=input.value; }); });
          document.querySelector('a.search-btn').onclick=() => {
            window.clickedCount++; window.submittedQuery=reactiveQuery;
            history.replaceState(null,'','?query='+encodeURIComponent(reactiveQuery));
            document.querySelector('#results').innerHTML='<a href="/job_detail/synthetic-a.html">合成工程师</a>';
          };
        }, 1200);
      </script>`;
    } else if (url.hostname === 'www.zhipin.com' && url.pathname === '/job_detail/synthetic-a.html') {
      body = '<div class="job-banner"><div class="name"><h1>合成工程师</h1></div></div><div class="sider-company"><div class="company-info"><a>合成公司</a></div></div><div class="job-sec-text">这是完整的合成岗位要求，用于验证收集流程。</div>';
    } else if (url.origin !== 'https://resulab.amorsum.top') { return route.abort(); }
    await route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><meta charset="utf-8"><body>'+body+'</body></html>' });
  });
  const page = await context.newPage(); await page.goto('https://resulab.amorsum.top/jobs');
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    window.request = (type, session = '', payload = null, taskId = '') => {
      const requestId = crypto.randomUUID();
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => { window.removeEventListener('message', handler); reject(new Error('bridge timeout')); }, 15000);
        const handler = event => {
          if (event.source !== window || event.origin !== location.origin || event.data?.direction !== 'response' || event.data.requestId !== requestId) return;
          clearTimeout(timeout); window.removeEventListener('message', handler); resolve(event.data);
        };
        window.addEventListener('message', handler);
        window.postMessage({ channel: 'resulab-jobs', version: 1, direction: 'request', requestId, session, ownerId: 'synthetic-search-test', type, taskId, payload }, location.origin);
      });
    };
  });
  const paired = await page.evaluate(() => window.request('PAIR')); assert.equal(paired.ok, true);
  const session = paired.value.session;
  // Playwright may miss the initial navigation of chrome.tabs.create. Give its
  // isolated-profile target interceptor time to attach BEFORE any fixture URL.
  // Search handlers, DOM, storage, and content scripts are still the packaged code.
  const worker = context.serviceWorkers()[0];
  await worker.evaluate(() => {
    const create = chrome.tabs.create.bind(chrome.tabs);
    chrome.tabs.create = async options => {
      const tab = await create({ ...options, url: 'about:blank' });
      await new Promise(resolve => setTimeout(resolve, 500));
      return chrome.tabs.update(tab.id, { url: options.url });
    };
  });
  for (variant of ['delayed', 'placeholder']) {
    const search = { keyword: '前端工程师', city: '', salaryMin: 0, salaryMax: 0, experience: '', education: '', jobType: '', excludeCompanies: [], limit: 1 };
    const tabOpened = context.waitForEvent('page');
    const task = await page.evaluate(({ session, search }) => window.request('SEARCH', session, search), { session, search });
    assert.equal(task.ok, true);
    const boss = await tabOpened;
    await boss.waitForLoadState();
    // No workbench timer runs here: onUpdated must trigger the initial search itself.
    try { await boss.waitForFunction(() => window.submittedQuery === '前端工程师', null, { timeout: 12000 }); }
    catch (error) {
      console.log('Synthetic page diagnostics', await boss.evaluate(() => ({ text: document.body.innerText, query: window.submittedQuery, count: window.clickedCount, html: document.querySelector('main')?.innerHTML })));
      console.log('Synthetic task diagnostics', await page.evaluate(({session,id}) => window.request('SEARCH_STATUS', session, null, id), {session,id:task.value.id}));
      throw error;
    }
    let progress;
    for (let i = 0; i < 20; i++) {
      const response = await page.evaluate(({ session, id }) => window.request('SEARCH_STATUS', session, null, id), { session, id: task.value.id });
      assert.equal(response.ok, true); progress = response.value;
      if (['done', 'paused'].includes(progress.phase)) break;
      await page.waitForTimeout(300);
    }
    assert.equal(progress.phase, 'done', progress.error);
    assert.equal(progress.jobs.length, 1, progress.error);
    assert.equal(progress.jobs[0].title, '合成工程师');
    assert.match(progress.jobs[0].jdText, /完整的合成岗位要求/);
    assert.deepEqual(await boss.evaluate(() => ({ count: window.clickedCount, wrong: Boolean(window.wrongClick) })), { count: 1, wrong: false });
    await boss.close();
    console.log('PASS: '+variant+' input → reactive query → scoped search click → keyword readback → full JD; no workbench poll required to submit');
  }
} finally { await context.close(); }
