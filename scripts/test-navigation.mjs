import { chromium, expect } from '@playwright/test';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const root = fileURLToPath(new URL('..', import.meta.url));
const results = path.join(root, 'docs/competition/results/navigation');
await mkdir(results, { recursive: true });
const server = await createServer({ root, server: { host: '127.0.0.1', port: 3187, strictPort: true, open: false }, define: {
  'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('https://fixture.supabase.co'),
  'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify('fixture'),
} });
await server.listen();
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext();
  await context.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const home = () => page.getByRole('navigation', { name: '主导航', exact: true }).getByRole('link', { name: '首页 · 全部功能', exact: true });
  // First use on mobile must never trap the user behind an invisible tour target.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('http://127.0.0.1:3187/builder');
  await expect(page.getByRole('button', { name: '关闭引导' })).toBeVisible();
  await page.locator('.onboarding-exits').getByRole('link', { name: '返回首页' }).click();
  await expect(page.getByRole('heading', { name: '全部功能', exact: true })).toBeVisible();
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const route of ['/jobs', '/library', '/builder', '/my-resumes', '/account', '/register', '/reset-password', '/update-password', '/not-a-page']) {
      await page.goto('http://127.0.0.1:3187' + route);
      await expect(home()).toBeVisible();
      await expect(page.getByRole('navigation', { name: '主导航', exact: true }).getByRole('link')).toHaveCount(6);
      const navBounds = await page.locator('.app-navigation').boundingBox();
      assert.ok(navBounds.x >= 0 && navBounds.x + navBounds.width <= width + 1, route+' navigation fits '+width);
      await home().click();
      await expect(page).toHaveURL('http://127.0.0.1:3187/');
      await expect(home()).toHaveAttribute('aria-current', 'page');
    }
    await expect(page.locator('.feature-directory .workspace-actions > a')).toHaveCount(6);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    if ([1440,390].includes(width)) await page.screenshot({ path: path.join(results, `home-${width}.png`), fullPage: true });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.feature-directory').getByRole('link', { name: /打开岗位优化/ }).click();
  await expect(page.getByRole('dialog', { name: '针对岗位优化' })).toBeVisible();
  await page.getByRole('dialog').getByRole('link', { name: '返回首页' }).click();
  await expect(page).toHaveURL('http://127.0.0.1:3187/');
  await page.locator('.feature-directory').getByRole('link', { name: /查看本地版本/ }).click();
  await expect(page.locator('#versions')).toBeInViewport();
  await home().click();
  await page.getByRole('navigation', { name: '主导航', exact: true }).getByRole('link', { name: '简历编辑', exact: true }).click();
  await page.getByRole('button', { name: '预览简历', exact: true }).click();
  await page.getByRole('button', { name: '排版', exact: true }).click();
  await page.getByRole('button', { name: '极简模板', exact: true }).click();
  await expect(page.getByRole('button', { name: '极简模板', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: '关闭排版设置' }).click();
  await page.getByRole('button', { name: '导出', exact: true }).click();
  await expect(page.getByRole('button', { name: '导出 PDF', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '导出 Word', exact: true })).toBeVisible();
  await page.screenshot({ path: path.join(results, 'builder-mobile.png') });
  await home().click();
  await page.goto('http://127.0.0.1:3187/jobs');
  await page.screenshot({ path: path.join(results, 'jobs-mobile.png') });
  // Authenticated cloud/account pages use synthetic data; no account changes or network calls.
  const user = { id: '00000000-0000-4000-8000-000000000888', aud: 'authenticated', role: 'authenticated', email: 'navigation@example.invalid', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
  const jwt = `${Buffer.from(JSON.stringify({ alg: 'HS256' })).toString('base64url')}.${Buffer.from(JSON.stringify({ sub: user.id, exp: Math.floor(Date.now()/1000)+3600 })).toString('base64url')}.fixture`;
  await page.addInitScript(({ user, jwt }) => localStorage.setItem('sb-fixture-auth-token', JSON.stringify({ access_token: jwt, refresh_token: 'fixture', expires_at: Math.floor(Date.now()/1000)+3600, token_type: 'bearer', user })), { user, jwt });
  await page.route('https://fixture.supabase.co/**', route => route.fulfill({ json: route.request().url().includes('/auth/') ? user : [] }));
  for (const route of ['/my-resumes', '/account']) {
    await page.goto('http://127.0.0.1:3187'+route);
    await expect(page).toHaveURL('http://127.0.0.1:3187'+route);
    await expect(page.locator('.app-navigation a[aria-current="page"]')).toHaveCount(1);
    await home().click(); await expect(page).toHaveURL('http://127.0.0.1:3187/');
  }
  assert.deepEqual(errors, []);
  console.log('PASS: all routes return home at 320/390/768/1440px; feature directory; guest/login and authenticated navigation; onboarding/modal exits; local-version anchor; mobile templates and PDF/Word menus.');
} finally { await browser.close(); await server.close(); }
