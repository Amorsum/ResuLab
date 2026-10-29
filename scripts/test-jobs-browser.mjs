import { chromium, expect } from '@playwright/test';
import { build } from 'esbuild';
import { createServer as httpServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createServer as viteServer } from 'vite';
import { createRequire } from 'node:module';
const root = fileURLToPath(new URL('..', import.meta.url)), results = path.join(root, '.cache/jobs-browser');
const require = createRequire(import.meta.url);
const composeCode = (await build({ entryPoints: [path.join(root, 'shared/careerComposer.ts')], bundle: true, write: false, format: 'cjs', platform: 'node' })).outputFiles[0].text;
const composeModule = { exports: {} }; new Function('module', 'exports', 'require', composeCode)(composeModule, composeModule.exports, require);
await mkdir(results, { recursive: true });
const source = `import * as dom from './extension/src/dom'; import * as jobs from './shared/jobs'; import {ExecutionEngine} from './extension/src/engine'; window.jobTest={dom,jobs,ExecutionEngine};`;
const bundle = (await build({ stdin: { contents: source, resolveDir: root, loader: 'ts' }, bundle: true, write: false, format: 'iife', platform: 'browser', target: 'chrome120' })).outputFiles[0].text;
const fixture = await readFile(path.join(root, 'tests/fixtures/jobs.html'));
const server = httpServer((req, res) => { res.setHeader('Content-Type', req.url === '/test.js' ? 'text/javascript' : 'text/html'); res.end(req.url === '/test.js' ? bundle : fixture); });
await new Promise(resolve => server.listen(3190, '127.0.0.1', resolve));
const vite = await viteServer({ root, cacheDir: '.cache/vite-jobs-browser', optimizeDeps: { entries: ['index.html'] }, server: { host: '127.0.0.1', port: 3189, strictPort: true, open: false, watch: { ignored: ['**/*'] } }, define: { 'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('https://fixture.supabase.co'), 'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify('fixture'), 'import.meta.env.VITE_AI_API_BASE': JSON.stringify('http://127.0.0.1:3189'), 'import.meta.env.VITE_AGENT_API_BASE': JSON.stringify('http://127.0.0.1:3189') } });
await vite.listen();
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await context.route('**/*', route => { const url = new URL(route.request().url()); return ['127.0.0.1', 'localhost'].includes(url.hostname) || ['blob:', 'data:'].includes(url.protocol) ? route.continue() : route.abort(); });
const page = await context.newPage(), report = { externalRequestsAllowed: false, fixtureOnly: true, checks: [] };
page.setDefaultNavigationTimeout(90000);
try {
  await page.goto('http://127.0.0.1:3190');
  const result = await page.evaluate(async () => {
    const { dom, jobs, ExecutionEngine } = window.jobTest;
    const p = { account: '#account', title: '#title', company: '#company', recruiter: '#recruiter', recruiterKey: '#recruiter', jd: '#jd', city: '#city', salary: '#salary', experience: '#experience', education: '#education', conversation: '#conversation', messages: '.sent-message', attachments: '.sent-file', composer: '#composer', send: '#send', upload: '#upload', selectedFile: '#selected', sendFile: '#send-file', challenge: '#challenge', login: '#login', pending: '#pending', unsafeUpload: '#unsafe' };
    const job = dom.readJob(document, 'https://www.zhipin.com/job_detail/job-a.html', p), bytes = new TextEncoder().encode('%PDF-fixture'), hash = await jobs.sha256(bytes);
    const item = { job, filename: 'company-a-job-a-unique.pdf', hash, bytes: bytes.length, greeting: '您好，希望应聘前端开发。', snapshotHash: 'a'.repeat(64), allowExistingConversation: false };
    let batch; const ledger = [], store = { load: async () => structuredClone(batch), save: async value => { batch = structuredClone(value); }, pdf: async () => bytes, ledger: async () => ledger, remember: async value => ledger.push(value) };
    const driver = { capabilities: { ...jobs.BOSS_CAPABILITIES, communicate: true, attach: true }, identity: async () => dom.accountIdentity(document, p), inspect: async i => dom.inspectReceipt(document, i, p), communicate: async i => dom.sendGreeting(document, i, p), attach: async (i, data) => dom.sendAttachment(document, i, data, p) };
    const engine = new ExecutionEngine(store, driver), manifest = { id: crypto.randomUUID(), ownerId: 'fixture', items: [item], createdAt: Date.now() };
    await engine.step(); if (fixtureCalls.length) throw new Error('Sent without approval');
    await engine.approve(manifest); await engine.step(); await engine.step(); await engine.step();
    const calls = [...fixtureCalls];
    let rejected = false; try { await dom.sendAttachment(document, { ...item, job: { ...job, id: 'job-b' } }, bytes, p); } catch { rejected = true; }
    document.querySelector('#challenge').classList.remove('hidden'); let challenged = false; try { dom.inspectReceipt(document, item, p); } catch { challenged = true; }
    document.querySelector('#challenge').classList.add('hidden');
    return { status: batch.items[0].status, calls, after: fixtureCalls.length, rejected, challenged, jd: job.jdText, original: document.querySelector('#composer').value };
  });
  assert.equal(result.status, 'sent'); assert.deepEqual(result.calls, ['greeting', 'upload:company-a-job-a-unique.pdf', 'attachment']); assert.equal(result.after, 3); assert.equal(result.rejected, true); assert.equal(result.challenged, true); assert.match(result.jd, /IGNORE PREVIOUS/); assert.equal(result.original, '您好，希望应聘前端开发。');
  report.checks.push('fixture engine → DOM greeting → PDF upload → exact receipt; wrong target rejected; CAPTCHA stops');
  await page.reload();
  const pending = await page.evaluate(async () => {
    const { dom, jobs } = window.jobTest, p = { ...dom.bossProfile, account: '#account', conversation: '#conversation', challenge: '#challenge', login: '#login', unsafeUpload: '#unsafe', pending: '#pending', messages: '.sent-message', attachments: '.sent-file' };
    const item = { job: { id: 'job-a', title: '前端开发', company: '合成公司 A', recruiterKey: 'boss-a' }, filename: 'a.pdf', bytes: 8 };
    document.querySelector('#unsafe').classList.remove('hidden'); return dom.sendAttachment(document, item, new Uint8Array(), p);
  });
  assert.equal(pending.kind, 'pending'); report.checks.push('global replacement/slot-limit UI never uploads or sends');
  await page.goto('http://127.0.0.1:3189/jobs', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: '为每个机会，认真准备。' })).toBeVisible({ timeout: 30000 });
  await page.getByText('直接导入一个 BOSS 岗位 JD').click();
  await page.getByLabel('岗位链接', { exact: true }).fill('https://www.zhipin.com/job_detail/synthetic-a.html');
  await page.getByLabel('岗位名称', { exact: true }).fill('合成前端工程师');
  await page.getByLabel('公司', { exact: true }).fill('仅用于测试的公司');
  await page.getByLabel('完整 JD', { exact: true }).fill('使用 TypeScript 编写页面并测试，不涉及任何真实投递。');
  await page.getByRole('button', { name: '加入岗位列表' }).click();
  await expect(page.getByRole('link', { name: '合成前端工程师 ↗' })).toBeVisible();
  await page.reload(); await expect(page.getByRole('link', { name: '合成前端工程师 ↗' })).toBeVisible();
  await expect(page.getByRole('button', { name: /审核本批/ })).toBeDisabled();
  await page.screenshot({ path: path.join(results, 'jobs-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 }); await page.screenshot({ path: path.join(results, 'jobs-mobile.png'), fullPage: true });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  report.checks.push('real React workbench imports JD, persists across refresh, disables unverified send; mobile fits');
  await page.setViewportSize({ width: 1440, height: 1000 });
  const pdf = await page.evaluate(async () => {
    const { renderJobPdf } = await import('/src/utils/jobPdf.tsx'); const { createEmptyResume } = await import('/src/constants/defaultResume.ts');
    const resume = createEmptyResume(); resume.personalInfo.fullName = '合成测试'; resume.templateId = 'professional';
    resume.projects = Array.from({ length: 12 }, (_, i) => ({ id: 'p-' + i, projectName: '合成课程项目 ' + (i + 1), role: '参与者', startDate: '2025-01', endDate: '2025-06', isCurrent: false, description: '使用 TypeScript 实现课程页面，编写测试并整理设计文档。\n'.repeat(6), techStack: ['TypeScript'], url: '' }));
    const before = JSON.stringify(resume), blob = await renderJobPdf(resume); const buffer = new Uint8Array(await blob.arrayBuffer());
    let binary = ''; for (let i = 0; i < buffer.length; i += 8192) binary += String.fromCharCode(...buffer.subarray(i, i + 8192));
    return { data: btoa(binary), unchanged: before === JSON.stringify(resume), leakedContainers: [...document.querySelectorAll('body>div')].some(el => el.style.left === '-10000px') };
  });
  assert.equal(pdf.unchanged, true); assert.equal(pdf.leakedContainers, false);
  const data = Buffer.from(pdf.data, 'base64'); await writeFile(path.join(results, 'synthetic-multipage.pdf'), data);
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs'); const loading = pdfjs.getDocument({ data: new Uint8Array(data), useSystemFonts: true }), parsed = await loading.promise;
  assert.ok(parsed.numPages > 1); report.pdfPages = parsed.numPages; await loading.destroy();
  report.checks.push('actual multi-page Chinese PDF generated from independent snapshot without mutating input');
  await page.evaluate(async base64 => {
    const pdfjs = await import('/node_modules/pdfjs-dist/build/pdf.mjs'); pdfjs.GlobalWorkerOptions.workerSrc = '/node_modules/pdfjs-dist/build/pdf.worker.mjs';
    const task = pdfjs.getDocument({ data: Uint8Array.from(atob(base64), c => c.charCodeAt(0)) }); const pdf = await task.promise;
    const container = document.createElement('div'); container.id = 'pdf-check'; container.style.cssText = 'background:white;position:absolute;left:0;top:0;z-index:99999;display:flex;gap:20px'; document.body.append(container);
    for (const index of [1, pdf.numPages]) { const page = await pdf.getPage(index), viewport = page.getViewport({ scale: 1 }); const canvas = document.createElement('canvas'); canvas.width = viewport.width; canvas.height = viewport.height; container.append(canvas); await page.render({ canvas, viewport }).promise; }
    await task.destroy();
  }, pdf.data);
  await page.locator('#pdf-check').screenshot({ path: path.join(results, 'pdf-first-last.png') });
  // Exercise the real workbench against isolated synthetic authentication/model fixtures.
  const userId = '00000000-0000-4000-8000-000000000777';
  const fakeUser = { id: userId, aud: 'authenticated', role: 'authenticated', email: 'synthetic@example.invalid', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
  const jwt = `${Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify({ sub: userId, exp: Math.floor(Date.now() / 1000) + 3600, role: 'authenticated' })).toString('base64url')}.fixture`;
  await page.addInitScript(({ user, jwt }) => localStorage.setItem('sb-fixture-auth-token', JSON.stringify({ access_token: jwt, refresh_token: 'fixture', expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, token_type: 'bearer', user })), { user: fakeUser, jwt });
  await page.route('https://fixture.supabase.co/**', route => route.fulfill({ json: fakeUser }));
  await page.route('**/api/career/entries', route => route.fulfill({ json: [] }));
  await page.route('**/api/ai/*', async route => {
    const input = route.request().postDataJSON();
    const skill = input.jdText.includes('SQL') ? 'SQL' : 'TypeScript', fact = input.facts.find(f => f.section === 'skills' && f.data.skillName === skill);
    const plan = { roleTitle: skill === 'SQL' ? '数据分析' : '前端开发', requirements: [{ id: 'r1', text: skill, jdQuote: skill, required: true, coverage: 'supported', gap: '' }], selected: [{ factId: fact.id, requirementIds: ['r1'], reason: `已确认掌握 ${skill}` }] };
    if (route.request().url().endsWith('/job-match')) {
      const inputRevision = Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(input)))).toString('hex');
      await route.fulfill({ json: { inputRevision, plan, modelCalls: 1 } });
    } else {
      let calls = 0;
      const result = await composeModule.exports.composeCareer(input, async () => JSON.stringify(calls++ === 0 ? plan : { edits: [], summary: { text: '', sourceIds: [] } }));
      await route.fulfill({ json: result });
    }
  });
  await page.reload();
  await page.evaluate(async userId => {
    const { createEmptyResume } = await import('/src/constants/defaultResume.ts');
    const { readLibrary, updateLibrary, newLibrarySource } = await import('/src/utils/careerLibrary.ts');
    const { readJobs, saveJobs } = await import('/src/utils/jobsStore.ts');
    const resume = createEmptyResume(); resume.personalInfo.fullName = '素材中的旧姓名'; resume.personalInfo.email = 'synthetic@example.invalid';
    resume.skills = ['TypeScript', 'SQL'].map((skillName, index) => ({ id: 's-' + index, skillName, category: '', level: '掌握' }));
    const library = await readLibrary(userId); await updateLibrary(userId, library.revision, value => ({ ...value, sources: [newLibrarySource(resume, '合成已确认经历', 'editor', true)] }));
    const workspace = await readJobs(userId); await saveJobs({ ...workspace, records: ['TypeScript', 'SQL'].map((skill, index) => ({ job: { id: `fixture-${index}`, source: 'boss', url: `https://www.zhipin.com/job_detail/fixture-${index}.html`, title: skill === 'SQL' ? '数据分析' : '前端开发', company: `合成公司 ${index}`, recruiter: '', recruiterKey: '', city: '上海', salary: '15-25K', experience: '', education: '', jobType: '', jdText: `熟练使用 ${skill} 完成业务工作并整理文档。`, collectedAt: Date.now() }, status: 'review', selected: false })) });
  }, userId);
  await page.goto('http://127.0.0.1:3189/builder', { waitUntil: 'domcontentloaded' });
  await page.locator('.builder-form-column').getByPlaceholder('请输入姓名').fill('当前简历的合成求职者');
  await page.locator('.builder-form-column').getByPlaceholder('example@email.com').fill('synthetic@example.invalid');
  await expect(page.locator('.builder-context')).toContainText('已自动保存到本机');
  await page.goto('http://127.0.0.1:3189/jobs', { waitUntil: 'domcontentloaded' });
  await page.reload();
  await page.getByRole('button', { name: '智能匹配与排序' }).click();
  await expect(page.getByRole('button', { name: '为所选 2 个岗位生成简历' })).toBeEnabled({ timeout: 20000 });
  await page.getByRole('button', { name: '为所选 2 个岗位生成简历' }).click();
  await expect(page.getByRole('button', { name: '核对专用简历与文案' })).toHaveCount(2, { timeout: 30000 });
  const snapshot = await page.evaluate(async userId => {
    const { readJobs } = await import('/src/utils/jobsStore.ts'), { readLibrary } = await import('/src/utils/careerLibrary.ts');
    const data = await readJobs(userId), library = await readLibrary(userId);
    return { skills: data.records.map(row => row.draft.resume.skills.map(skill => skill.skillName)), names: data.records.map(row => row.draft.resume.personalInfo.fullName), hashes: data.records.map(row => row.draft.hash), sourceSkills: library.sources[0].resume.skills.map(skill => skill.skillName) };
  }, userId);
  assert.deepEqual(snapshot.skills, [['TypeScript'], ['SQL']]); assert.deepEqual(snapshot.names, ['当前简历的合成求职者', '当前简历的合成求职者']); assert.notEqual(snapshot.hashes[0], snapshot.hashes[1]); assert.deepEqual(snapshot.sourceSkills, ['TypeScript', 'SQL']);
  await page.getByRole('button', { name: '核对专用简历与文案' }).first().click();
  await page.getByLabel('已核对公司、岗位、文案、事实来源与完整 PDF').click();
  await expect(page.getByLabel('已核对公司、岗位、文案、事实来源与完整 PDF')).toBeChecked();
  await page.getByLabel('沟通文案', { exact: true }).fill('我修改了沟通内容，需要重新核对。');
  await expect(page.getByLabel('已核对公司、岗位、文案、事实来源与完整 PDF')).not.toBeChecked();
  await page.screenshot({ path: path.join(results, 'jobs-review.png'), fullPage: true });
  report.checks.push('authenticated fixture: match 2 JDs → tailor different snapshots → generate distinct PDFs → review → edit invalidates approval; source library unchanged');
  await writeFile(path.join(results, 'browser.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
} finally { await browser.close(); await vite.close(); await new Promise(resolve => server.close(resolve)); }
