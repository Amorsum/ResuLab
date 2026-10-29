import { chromium, expect as baseExpect } from '@playwright/test';
import { fork } from 'node:child_process';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(import.meta.url), esbuild = createRequire(path.join(root, 'workers/node_modules/wrangler/package.json'))('esbuild');
function load(file) { const code = esbuild.buildSync({ entryPoints: [path.join(root, file)], bundle: true, platform: 'node', format: 'cjs', write: false }).outputFiles[0].text; const m = { exports: {} }; new Function('module', 'exports', 'require', code)(m, m.exports, require); return m.exports; }
const entriesModule = load('shared/careerEntries.ts'), career = load('shared/career.ts'), composer = load('shared/careerComposer.ts');
const results = path.join(root, '.cache/career-workspace'); await mkdir(results, { recursive: true });
const expect = baseExpect.configure({ timeout: 15000 });
const fixtureConfig = { root, build: { outDir: path.join(results, 'dist'), emptyOutDir: true, minify: false, reportCompressedSize: false }, define: {
  'import.meta.env.DEV': 'true',
  'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('https://fixture.supabase.co'), 'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify('fixture'),
  'import.meta.env.VITE_AGENT_API_BASE': JSON.stringify('https://career.fixture.invalid'), 'import.meta.env.VITE_AI_API_BASE': JSON.stringify('https://ai.fixture.invalid'),
  'import.meta.env.VITE_CAREER_STORAGE': JSON.stringify('local'),
} };
// Exercise the bundled app without a running development dependency optimizer.
const fixtureEntry = path.join(results, 'frontend.mjs');
await writeFile(fixtureEntry, `import {build,preview} from 'vite'; const config=${JSON.stringify(fixtureConfig)}; await build(config); const server=await preview({...config,preview:{host:'127.0.0.1',port:3196,strictPort:true,open:false}}); process.send('ready'); process.on('message',message=>{if(message==='stop'){server.httpServer.close(()=>process.exit(0));server.httpServer.closeAllConnections();}});`);
const frontend = fork(fixtureEntry, [], { cwd: root, stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
await new Promise((resolve, reject) => { frontend.once('message', resolve); frontend.once('exit', code => reject(new Error(`Fixture frontend exited: ${code}`))); });
await fetch('http://127.0.0.1:3196/library', { signal: AbortSignal.timeout(30000) }).then(async response => { assert.equal(response.status, 200); assert.match(await response.text(), /id="root"/); });
console.log('Career fixture frontend ready');
const browser = await chromium.launch({ headless: true });
const errors = [];
let activePage;
const failedRequests = [];
const requests = new Set();
try {
  const context = await browser.newContext();
  let modelConfigured = false;
  await context.route('**/*', r => new URL(r.request().url()).hostname === '127.0.0.1' ? r.continue() : r.request().url().endsWith('/api/health') ? r.fulfill({ json: { dependencies: { modelConfigured }, model: { id: modelConfigured ? 'fixture-writer' : null } } }) : r.abort());
  const page = await context.newPage(); activePage = page; page.on('pageerror', e => errors.push(e.message));
  page.on('request', request => requests.add(request.url()));
  page.on('requestfinished', request => requests.delete(request.url()));
  page.on('requestfailed', request => failedRequests.push({ url: request.url(), error: request.failure()?.errorText }));
  page.setDefaultNavigationTimeout(60000);
  page.setDefaultTimeout(15000);
  page.on('console', m => { if (m.type() === 'error') console.error('browser:', m.text()); });
  await page.goto('http://127.0.0.1:3196/library', { waitUntil: 'commit' });
  await expect(page.getByRole('heading', { name: '经历工作台', exact: true })).toBeVisible();
  const modelStatus = page.getByRole('region', { name: 'Agent 模型状态', exact: true });
  await expect(modelStatus).toContainText('尚未配置模型服务');
  await modelStatus.getByRole('button', { name: '模型配置说明', exact: true }).click();
  await expect(modelStatus).toContainText('server/.env');
  await expect(modelStatus).toContainText('MODEL_API_KEY');
  await modelStatus.getByRole('button', { name: '收起配置说明', exact: true }).click();
  await page.getByRole('button', { name: '从当前简历拆分导入', exact: true }).click();
  const importPreview = page.getByRole('region', { name: '当前简历拆分预览', exact: true });
  await expect(importPreview).toBeInViewport();
  await expect(importPreview).toBeFocused();
  await expect(importPreview).toContainText('当前简历暂无可导入的经历');
  await expect(importPreview.getByRole('button', { name: '确认导入', exact: true })).toHaveCount(0);
  await expect(page.locator('#materials')).toContainText('当前简历暂无可导入的经历');
  await page.screenshot({ path: path.join(results, 'import-empty.png') });
  await importPreview.getByRole('button', { name: '关闭预览', exact: true }).click();
  await page.getByRole('button', { name: '记一笔 / 完整填写', exact: true }).click();
  const editor = page.locator('section[aria-label="经历录入"]');
  const editorDialog = page.getByRole('dialog', { name: '记录新经历' });
  await expect(editorDialog).toBeVisible();
  await expect(editorDialog.getByRole('heading', { name: '记录新经历' })).toBeFocused();
  await editor.getByLabel('名称', { exact: true }).fill('校园课程平台');
  await editor.getByRole('textbox', { name: '原始记录', exact: true }).fill('参与竞赛，使用 TypeScript 实现查询接口，提交可演示项目');
  await page.reload({ waitUntil: 'commit' });
  await page.getByRole('button', { name: '记一笔 / 完整填写', exact: true }).click();
  await expect(page.getByRole('textbox', { name: '原始记录', exact: true })).toHaveValue(/TypeScript/);
  await editor.getByRole('button', { name: '保存草稿', exact: true }).click();
  await expect(page.locator('#materials')).toContainText('草稿 · 待核对');
  const editButton = page.locator('#materials').getByRole('button', { name: '编辑 / 核对', exact: true });
  await editButton.click();
  const editDialog = page.getByRole('dialog', { name: '编辑与核对 · 校园课程平台' });
  await expect(editDialog).toBeVisible();
  await expect(editDialog.getByRole('heading', { name: '编辑与核对 · 校园课程平台' })).toBeFocused();
  const desktopBox = await editDialog.boundingBox();
  assert.ok(desktopBox && Math.abs(desktopBox.x + desktopBox.width / 2 - 640) < 2 && desktopBox.y > 0, 'desktop editor is centered in the viewport');
  await editor.getByRole('textbox', { name: '原始记录', exact: true }).fill('暂存的编辑内容');
  await page.keyboard.press('Escape');
  await expect(editDialog).toHaveCount(0);
  await expect(editButton).toBeFocused();
  await editButton.click();
  await expect(editor.getByRole('textbox', { name: '原始记录', exact: true })).toHaveValue('暂存的编辑内容');
  await editor.getByRole('textbox', { name: '原始记录', exact: true }).fill('参与竞赛，使用 TypeScript 实现查询接口，提交可演示项目');
  await page.screenshot({ path: path.join(results, 'edit-dialog-desktop.png') });
  await editor.getByRole('button', { name: '完整填写', exact: true }).click();
  await editor.getByLabel('个人具体行动', { exact: true }).fill('使用 TypeScript 实现课程平台查询接口');
  await editor.getByLabel('交付物与已知成果', { exact: true }).fill('提交可演示项目，未统计用户数量');
  await editor.getByRole('button', { name: '将完整填写整理为事实', exact: true }).click();
  await editor.getByRole('button', { name: '我已核对事实，确认保存', exact: true }).click();
  await expect(page.locator('#materials')).toContainText('已确认');
  await page.getByLabel('目标岗位名称', { exact: true }).fill('后端开发实习生');
  await page.locator('#target').getByRole('checkbox', { name: '校园课程平台 · 项目', exact: true }).check();
  await expect(page.getByRole('button', { name: 'Agent 分析并推荐经历', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: '原文填入当前简历 · 预览', exact: true })).toBeEnabled();
  modelConfigured = true;
  await modelStatus.getByRole('button', { name: '刷新模型状态', exact: true }).click();
  await expect(modelStatus).toContainText('fixture-writer');
  await expect(page.getByRole('button', { name: 'Agent 分析并推荐经历', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '原文填入当前简历 · 预览', exact: true }).click();
  await page.getByRole('button', { name: '确认整批填入', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: '已整批填入' })).toBeVisible();
  await page.getByRole('button', { name: '原文填入当前简历 · 预览', exact: true }).click();
  await expect(page.getByRole('region', { name: '填入简历预览' }).getByLabel('应用方式')).toHaveValue('skip');
  await page.getByRole('button', { name: '取消预览', exact: true }).click();
  await page.getByRole('button', { name: '撤销上一批简历修改', exact: true }).click();
  const persisted = await page.evaluate(() => JSON.parse(localStorage.getItem('resulab_resume') || localStorage.getItem('resulab-resume') || 'null'));
  // Persisted state is also verified after the provider's debounce, below via the actual editor.
  for (const size of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }, { width: 375, height: 812 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(size);
    const overflow = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth, nodes: [...document.querySelectorAll('main *')].filter(n => n.getBoundingClientRect().right > innerWidth + 1).map(n => ({ tag: n.tagName, class: n.className, right: n.getBoundingClientRect().right })).slice(0, 12) }));
    if (overflow.scroll > overflow.width + 1) { await page.screenshot({ path: path.join(results, 'overflow.png'), fullPage: true }); console.log('overflow', overflow); }
    assert.ok(overflow.scroll <= overflow.width + 1);
    if ([1440,390].includes(size.width)) await page.screenshot({ path: path.join(results, `guest-${size.width}.png`), fullPage: true });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await editButton.click();
  await expect(page.getByRole('dialog', { name: '编辑与核对 · 校园课程平台' })).toBeVisible();
  const mobileBox = await editDialog.boundingBox();
  assert.ok(mobileBox && mobileBox.x === 0 && mobileBox.y === 0 && mobileBox.width === 390 && mobileBox.height === 844, 'mobile editor fills the viewport');
  await page.screenshot({ path: path.join(results, 'edit-dialog-mobile.png') });
  await editor.getByRole('button', { name: '关闭', exact: true }).click();
  await expect(editButton).toBeFocused();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: '确认选材并创建岗位版本', exact: true }).click();
  await expect(page).toHaveURL(/\/builder/);
  await expect(page.locator('.builder-context')).toContainText('后端开发实习生');
  if (await page.getByRole('button', { name: '关闭引导', exact: true }).isVisible()) await page.getByRole('button', { name: '关闭引导', exact: true }).click();
  await page.evaluate(() => { const original = Storage.prototype.setItem; window.__restoreStorage = () => { Storage.prototype.setItem = original; }; Storage.prototype.setItem = function(key, value) { if (this === localStorage && key.startsWith('resulab.current:')) throw new DOMException('storage full', 'QuotaExceededError'); return original.call(this, key, value); }; });
  await page.locator('input[placeholder="请输入姓名"]:visible').fill('备份测试姓名');
  await expect(page.locator('.builder-context').getByRole('alert')).toContainText('本机存储不可用');
  const [backupDownload] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '导出当前简历备份' }).click()]);
  const backupText = await readFile(await backupDownload.path(), 'utf8');
  assert.equal(JSON.parse(backupText).documents[0].resume.personalInfo.fullName, '备份测试姓名');
  await page.evaluate(() => window.__restoreStorage());
  await page.getByRole('button', { name: '重试本机保存' }).click();
  await expect(page.locator('.builder-context')).toContainText('已自动保存到本机');
  await page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => { const request = indexedDB.open('resulab-resume-documents', 1); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    await new Promise((resolve, reject) => { const tx = db.transaction('documents', 'readwrite'), store = tx.objectStore('documents'), request = store.getAll(); request.onsuccess = () => { const row = request.result.find(item => item.resume.personalInfo.fullName === '备份测试姓名'); if (!row) { tx.abort(); return; } row.revision++; store.put(row); }; tx.oncomplete = resolve; tx.onerror = tx.onabort = () => reject(tx.error || new Error('missing fixture document')); });
    db.close();
  });
  await page.locator('input[placeholder="请输入姓名"]:visible').fill('冲突保留姓名');
  await expect(page.locator('.builder-context').getByRole('alert')).toContainText('其他页面已更新');
  await expect(page.getByRole('button', { name: '重试本机保存' })).toHaveCount(0);
  const [conflictDownload] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '导出当前简历备份' }).click()]);
  assert.equal(JSON.parse(await readFile(await conflictDownload.path(), 'utf8')).documents[0].resume.personalInfo.fullName, '冲突保留姓名');
  await page.getByRole('navigation', { name: '主导航', exact: true }).getByRole('link', { name: '经历库', exact: true }).click();
  await expect(page.locator('#materials article.career-source')).toHaveCount(1);
  const beforeImport = await page.locator('#materials article.career-source').count();
  await page.getByRole('button', { name: '从当前简历拆分导入', exact: true }).click();
  await expect(importPreview).toBeInViewport();
  await expect(importPreview).toContainText('找到 1 段经历');
  await expect(importPreview).toContainText('校园课程平台');
  await expect(page.locator('#materials article.career-source')).toHaveCount(beforeImport);
  await page.screenshot({ path: path.join(results, 'import-populated.png') });
  await importPreview.getByRole('button', { name: '确认导入', exact: true }).click();
  await expect(page.locator('#materials article.career-source')).toHaveCount(beforeImport + 1);
  await page.getByRole('button', { name: '从当前简历拆分导入', exact: true }).click();
  await importPreview.getByRole('button', { name: '确认导入', exact: true }).click();
  await expect(page.locator('#materials article.career-source')).toHaveCount(beforeImport + 1);
  await context.close();

  const auth = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const user = { id: '00000000-0000-4000-8000-000000000888', aud: 'authenticated', role: 'authenticated', email: 'career@example.invalid', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
  const jwt = `${Buffer.from('{}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: user.id, exp: Math.floor(Date.now()/1000)+3600 })).toString('base64url')}.fixture`;
  await auth.addInitScript(({ user, jwt }) => localStorage.setItem('sb-fixture-auth-token', JSON.stringify({ access_token: jwt, refresh_token: 'fixture', expires_at: Math.floor(Date.now()/1000)+3600, token_type: 'bearer', user })), { user, jwt });
  const fact = { id: 'primary', section: 'projects', sourceTitle: '竞赛平台', doNotClaim: '', data: { id: 'primary', projectName: '竞赛平台', role: '竞赛成员', startDate: '', endDate: '', isCurrent: false, description: '使用 TypeScript 实现查询接口并交付竞赛演示项目', techStack: ['TypeScript'], url: '' } };
  let cloud = [{ ...entriesModule.entryInputSchema.parse({ id: '10000000-0000-4000-8000-000000000001', title: '竞赛平台', kind: 'competition', rawText: fact.data.description, details: {}, facts: [fact], status: 'confirmed', doNotClaim: '', groupId: '', migrationKey: null, relatedEntryId: null }), ownerId: user.id, revision: 1, createdAt: 1, updatedAt: 1 }];
  let task = null, writes = 0, versions = 0, failUpload = false;
  await auth.route('**/*', async route => {
    const url = new URL(route.request().url()), method = route.request().method(), body = route.request().postDataJSON();
    if (url.hostname === '127.0.0.1') return route.continue();
    if (url.hostname === 'fixture.supabase.co') return route.fulfill({ json: url.pathname.includes('/auth/') ? user : [] });
    if (url.hostname !== 'career.fixture.invalid') return route.abort();
    if (url.pathname === '/api/health') return route.fulfill({ json: { dependencies: { modelConfigured: true }, model: { id: 'fixture-writer' } } });
    const p = url.pathname.replace('/api/career', '');
    if (p === '/entries' && method === 'GET') return route.fulfill({ json: cloud });
    if (p.startsWith('/entries') && method !== 'GET') {
      if (failUpload) return route.fulfill({ status: 503, json: { error: { message: '合成网络故障' } } });
      const entry = { ...body.entry, ownerId: user.id, revision: body.expectedRevision+1, createdAt: 1, updatedAt: Date.now() }; cloud = [...cloud.filter(e => e.id !== entry.id), entry];
      return route.fulfill({ json: entry });
    }
    if (p === '/runs' && method === 'GET') return route.fulfill({ json: [] });
    if (p === '/runs' && method === 'POST') {
      const facts = entriesModule.entryFacts(cloud), plan = { roleTitle: '后端开发实习生', requirements: [{ id: 'r', text: '接口开发', jdQuote: '后端开发实习生', required: false, coverage: 'supported', gap: '' }], selected: [{ factId: facts[0].id, requirementIds: ['r'], reason: '真实查询接口贡献' }] };
      task = { runId: '20000000-0000-4000-8000-000000000001', status: 'awaiting_input', usage: { calls: 1, elapsedMs: 1, inputTokens: 100, outputTokens: 100 }, context: { version: 2, target: body.target, entries: cloud, phase: 'selection', plan, selection: { ...body.selection, selectedIds: [facts[0].id] } } };
      return route.fulfill({ json: { runId: task.runId } });
    }
    if (p.endsWith('/supplements')) {
      const { ownerId, revision, createdAt, updatedAt, ...entry } = cloud[0];
      return route.fulfill({ json: { entry: { ...entry, rawText: '新的补充事实' } } });
    }
    if (p.endsWith('/selection')) {
      writes++; const facts = entriesModule.entryFacts(task.context.entries), plan = entriesModule.selectedCareerPlan(task.context.plan, body.selection);
      const input = { jdText: load('shared/targetJob.ts').jobTarget(task.context.target.text, task.context.target.mode).text, facts };
      task.context.selection = body.selection; task.context.phase = 'review'; task.status = 'completed';
      task.context.result = { id: task.runId, inputRevision: await career.careerRevision(input, true), skillVersion: load('shared/resumeWritingSkill.ts').RESUME_WRITER_VERSION, createdAt: Date.now(), plan,
        ...composer.assembleCareer({ edits: [], summary: { text: '', sourceIds: [] } }, facts, plan, false), modelCalls: 1, needsMoreFacts: false };
      return route.fulfill({ json: { runId: task.runId } });
    }
    if (p.startsWith('/runs/') && method === 'GET') return route.fulfill({ json: task });
    if (p === '/validate-sources') return route.fulfill({ json: { valid: true } });
    if (p === '/versions' && method === 'GET') return route.fulfill({ json: [] });
    if (p === '/versions') { versions++; return route.fulfill({ json: { id: '30000000-0000-4000-8000-000000000001' } }); }
    return route.fulfill({ status: 404, json: { error: { message: '合成接口不存在' } } });
  });
  const signed = await auth.newPage(); signed.on('pageerror', e => errors.push(e.message));
  activePage = signed;
  await signed.goto('http://127.0.0.1:3196/library', { waitUntil: 'commit' });
  await expect(signed.locator('#materials')).toContainText('竞赛平台');
  await signed.locator('#materials').getByRole('button', { name: '编辑 / 核对', exact: true }).click();
  await signed.getByRole('textbox', { name: '原始记录', exact: true }).fill('尚未提交的个人修改');
  await signed.getByRole('button', { name: '关闭', exact: true }).click();
  await signed.getByLabel('目标岗位名称', { exact: true }).fill('后端开发实习生');
  await signed.getByRole('button', { name: 'Agent 分析并推荐经历', exact: true }).click();
  await expect(signed.locator('#review')).toContainText('等待确认选材'); assert.equal(writes, 0);
  await signed.reload({ waitUntil: 'commit' }); await expect(signed.locator('#review')).toContainText('等待确认选材'); assert.equal(writes, 0);
  await signed.getByText('补充某段经历的事实（可跳过）', { exact: true }).click();
  await signed.getByLabel('补充到哪段经历').selectOption(cloud[0].id);
  await signed.getByLabel('实际行动、方法或交付物').fill('新补充的内容');
  await signed.getByRole('button', { name: '将补充放入待核对草稿' }).click();
  await expect(signed.getByRole('textbox', { name: '原始记录', exact: true })).toHaveValue('新的补充事实');
  await signed.getByRole('button', { name: '关闭', exact: true }).click();
  await signed.locator('#materials').getByRole('button', { name: '编辑 / 核对', exact: true }).click();
  await expect(signed.getByRole('textbox', { name: '原始记录', exact: true })).toHaveValue('尚未提交的个人修改');
  await signed.getByRole('button', { name: '关闭', exact: true }).click();
  await signed.getByRole('button', { name: '确认选材，按岗位写作', exact: true }).click();
  await expect(signed.getByRole('button', { name: '确认并创建独立岗位版本', exact: true })).toBeEnabled(); assert.equal(writes, 1);
  await signed.screenshot({ path: path.join(results, 'agent-review.png'), fullPage: true });
  await signed.getByRole('button', { name: '确认并创建独立岗位版本', exact: true }).click();
  await expect(signed).toHaveURL(/\/builder/); assert.equal(versions, 1);
  await signed.goto('http://127.0.0.1:3196/library', { waitUntil: 'commit' });
  failUpload = true;
  await signed.getByRole('button', { name: '记一笔 / 完整填写', exact: true }).click();
  const signedEditor = signed.locator('section[aria-label="经历录入"]');
  await signedEditor.getByLabel('名称', { exact: true }).fill('网络失败时的材料'); await signedEditor.getByRole('textbox', { name: '原始记录', exact: true }).fill('这个记录必须留在本机');
  await signedEditor.getByRole('button', { name: '保存草稿', exact: true }).click();
  await expect(signed.locator('#materials')).toContainText('待上传'); await signed.reload({ waitUntil: 'commit' }); await expect(signed.locator('#materials')).toContainText('这个记录必须留在本机');
  assert.deepEqual(errors, []);
  await writeFile(path.join(results, 'result.json'), JSON.stringify({ passed: true, scenarios: ['visible empty import preview', 'populated import confirmation and repeat deduplication', 'guest draft refresh', 'manual facts', 'append duplicate skip', 'one batch undo', 'local version', 'mobile/landscape overflow', 'agent selection pause', 'task refresh', 'review/cloud version', 'failed upload recovery'], pageErrors: errors }, null, 2));
  console.log(`PASS: guest and signed career workflows, mobile/landscape, durable task review, offline drafts. Screenshots: ${results}`);
} catch (error) {
  if (activePage && !activePage.isClosed()) {
    await activePage.screenshot({ path: path.join(results, 'failure.png') }).catch(() => {});
    await writeFile(path.join(results, 'failure.json'), JSON.stringify({ message: error.message, pageErrors: errors, failedRequests, pending: [...requests], html: await activePage.content().catch(() => '') }, null, 2));
  }
  throw error;
} finally {
  await browser.close();
  frontend.send('stop');
  await new Promise(resolve => frontend.once('exit', resolve));
}
