// Tests the distributable extension in a disposable profile. Every web response is synthetic.
import { chromium } from '@playwright/test';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const root = fileURLToPath(new URL('..', import.meta.url)), extension = path.join(root, 'release-artifacts/jobs-extension');
const profile = await mkdtemp(path.join(os.tmpdir(), 'resulab-extension-test-'));
const context = await chromium.launchPersistentContext(profile, { channel: 'chromium', headless: true, args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
try {
  let intercepted = 0;
  await context.route('**/*', async route => { intercepted++; await route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><meta charset="utf-8"><title>合成工作台通信测试</title><body>仅测试扩展桥接，不连接真实服务。</body></html>' }); });
  const page = await context.newPage(); await page.goto('https://resulab.amorsum.top/jobs');
  await page.waitForTimeout(250);
  const result = await page.evaluate(async () => {
    function request(type, session = '') {
      const requestId = crypto.randomUUID();
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => { window.removeEventListener('message', handler); reject(new Error('Extension bridge did not respond')); }, 10000);
        const handler = event => { if (event.source !== window || event.origin !== location.origin || event.data?.direction !== 'response' || event.data.requestId !== requestId) return; clearTimeout(timeout); window.removeEventListener('message', handler); resolve(event.data); };
        window.addEventListener('message', handler);
        window.postMessage({ channel: 'resulab-jobs', version: 1, direction: 'request', requestId, session, ownerId: 'synthetic-extension-test', type, taskId: '', payload: null }, location.origin);
      });
    }
    const pair = await request('PAIR'); if (!pair.ok) throw new Error(pair.error);
    const status = await request('STATUS', pair.value.session), forged = await request('STATUS', 'forged-session');
    const disconnected = await request('DISCONNECT', pair.value.session), revoked = await request('STATUS', pair.value.session);
    return { status, forged, disconnected, revoked };
  });
  assert.equal(result.status.ok, true); assert.equal(result.status.value.capabilities.communicate, false); assert.equal(result.status.value.capabilities.attach, false);
  assert.equal(result.forged.ok, false); assert.equal(result.disconnected.ok, true); assert.equal(result.revoked.ok, false);
  const report = { packagedExtensionLoaded: true, fixtureOriginIntercepted: true, externalRequestsAllowed: false, interceptedRequests: intercepted, pairing: true, sessionRevocation: true, productionSendingDisabled: true };
  const dir = path.join(root, 'docs/competition/results/jobs'); await mkdir(dir, { recursive: true }); await writeFile(path.join(dir, 'extension-browser.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
} finally { await context.close(); }
