import { chromium, expect } from '@playwright/test';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('..', import.meta.url));
const server = await createServer({ root, server: { host: '127.0.0.1', port: 3188, strictPort: true, open: false }, define: {
  'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('https://fixture.supabase.co'),
  'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify('fixture'),
} });
await server.listen();
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  // Deliberately slow persistence so controlled input bugs cannot hide behind a fast disk.
  await page.route('**/src/utils/jobsStore.ts', async route => {
    const response = await route.fetch(), original = await response.text();
    const delayed = original.replace(/export async function saveJobs\(value\)\s*\{/, '$&\n await new Promise(resolve => setTimeout(resolve, 180)); if (window.__failJobSave) throw new Error("合成存储失败");');
    assert.notEqual(original, delayed, 'The persistence delay must be applied');
    await route.fulfill({ response, body: delayed });
  });
  await page.goto('http://127.0.0.1:3188/jobs');
  const keyword = page.getByRole('textbox', { name: '岗位关键词' });
  await expect(keyword).toBeEnabled();
  await keyword.pressSequentially('frontend', { delay: 20 });
  await expect(keyword).toHaveValue('frontend');
  await keyword.press('Home'); await keyword.press('ArrowRight'); await keyword.press('ArrowRight');
  await keyword.pressSequentially('XX', { delay: 20 });
  await expect(keyword).toHaveValue('frXXontend');
  await keyword.press('ControlOrMeta+A'); await keyword.press('Backspace');
  await keyword.pressSequentially('前端开发实习生', { delay: 20 });
  await expect(keyword).toHaveValue('前端开发实习生');
  const city = page.getByRole('textbox', { name: '城市', exact: true });
  await city.pressSequentially('上海', { delay: 20 });
  await expect(city).toHaveValue('上海');
  const min = page.getByRole('spinbutton', { name: '月薪下限（元）' });
  await min.pressSequentially('12000', { delay: 20 });
  await expect(min).toHaveValue('12000');
  await expect.poll(async () => page.evaluate(async () => {
    const { readJobs } = await import('/src/utils/jobsStore.ts'); const data = await readJobs('local-guest');
    return { keyword: data.search.keyword, city: data.search.city, salaryMin: data.search.salaryMin };
  }), { timeout: 15000 }).toEqual({ keyword: '前端开发实习生', city: '上海', salaryMin: 12000 });
  await page.reload();
  await expect(keyword).toHaveValue('前端开发实习生'); await expect(city).toHaveValue('上海'); await expect(min).toHaveValue('12000');
  // Simulate an extension heartbeat taking time without contacting BOSS or loading an extension.
  await page.evaluate(() => {
    window.__statusRequests = 0;
    window.addEventListener('message', event => {
      const req = event.data;
      if (req?.channel !== 'resulab-jobs' || req.direction !== 'request') return;
      if (req.type === 'STATUS') window.__statusRequests++;
      setTimeout(() => window.postMessage({ channel: req.channel, version: 1, direction: 'response', requestId: req.requestId, session: req.session, ok: true,
        value: req.type === 'PAIR' ? { session: 'input-test-session' } : { capabilities: { read: true, search: true, communicate: false, attach: false, reason: '合成扩展', adapterVersion: 'fixture' }, batch: null },
      }, location.origin), req.type === 'STATUS' ? 800 : 0);
    });
  });
  await page.getByRole('button', { name: '连接浏览器扩展 ↗' }).click();
  await expect(page.getByRole('button', { name: '重新连接扩展 ↗' })).toBeEnabled();
  await keyword.focus();
  await page.waitForFunction(() => window.__statusRequests >= 2);
  await expect(keyword).toBeEnabled();
  await keyword.press('End'); await keyword.pressSequentially('ABC', { delay: 20 });
  await expect(keyword).toHaveValue('前端开发实习生ABC'); await expect(keyword).toBeFocused();
  await page.evaluate(() => {
    const input = document.querySelector('input[placeholder="例如：前端开发实习生"]');
    input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '前端工程师');
    input.dispatchEvent(new InputEvent('input', { bubbles: true, data: '工程师', inputType: 'insertCompositionText', isComposing: true }));
    input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '工程师' }));
    input.dispatchEvent(new InputEvent('input', { bubbles: true, data: '工程师', inputType: 'insertText' }));
  });
  await expect(keyword).toHaveValue('前端工程师');
  await expect.poll(async () => page.evaluate(async () => (await (await import('/src/utils/jobsStore.ts')).readJobs('local-guest')).search.keyword)).toBe('前端工程师');
  await page.evaluate(() => { window.__failJobSave = true; });
  await keyword.fill('保存失败也保留输入');
  await expect(page.getByRole('alert')).toContainText('当前输入仍保留在页面');
  await expect(keyword).toHaveValue('保存失败也保留输入');
  await page.reload(); await expect(keyword).toHaveValue('前端工程师');
  console.log('PASS: rapid typing, mid-string caret, Chinese composition, deletion, filters, reload, heartbeat focus, and failed-save draft preservation');
} finally { await browser.close(); await server.close(); }
