import { chromium, expect as baseExpect } from '@playwright/test';
import { fork } from 'node:child_process';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { zipSync, strToU8, unzipSync } from 'fflate';
import path from 'node:path';
const resulab = process.argv.includes('--resulab-fixture'), term = resulab ? '简历' : '查询';
const expect = baseExpect.configure({ timeout: 30000 });
const root = process.cwd(), output = path.join(root, '.cache/project-workspace', ...(resulab ? ['resulab'] : [])); await mkdir(output, { recursive: true });
const real = process.argv.includes('--real-model');
const server = fork(path.join(root, 'server/scripts/project-preview.ts'), ['--synthetic-only', ...(real ? ['--real-model'] : [])], { cwd: path.join(root, 'server'), execArgv: ['--import', 'tsx'], stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
let browser, activePage;
try {
  await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error('Fixture startup timeout')), 60000); server.once('message', () => { clearTimeout(timer); resolve(); }); server.once('exit', code => { clearTimeout(timer); reject(new Error(`Fixture exited ${code}`)); }); });
  browser = await chromium.launch({ headless: true }); const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true }); const page = await context.newPage();
  activePage = page; page.setDefaultTimeout(20000); page.setDefaultNavigationTimeout(90000);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://127.0.0.1:3206/library/project', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: '从项目生成经历', exact: true })).toBeVisible();
  const sources = resulab ? Object.fromEntries(await Promise.all(['README.md', 'package.json', 'src/types/resume.ts', 'src/context/resumeReducer.ts', 'src/utils/pdfExport.ts', 'src/hooks/usePdfExport.ts'].map(async file => [`demo/${file}`, new Uint8Array(await readFile(path.join(root, file)))]))) : { 'demo/README.md': strToU8('# 合成团队查询项目\n使用 TypeScript 实现课程资料查询接口。\n团队有三名成员，部署仍为计划，尚无用户数据。'), 'demo/src/query.ts': strToU8('export const query = (items: string[]) => items.filter(Boolean);'), 'demo/.env': strToU8('DO_NOT_SEND=synthetic') };
  const archive = zipSync(sources);
  await page.locator('input[type=file]').setInputFiles({ name: 'team.zip', mimeType: 'application/zip', buffer: Buffer.from(archive) });
  await expect(page.getByRole('checkbox', { name: /^demo\/README.md/ })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: /demo\/\.env/ })).toHaveCount(0);
  await page.screenshot({ path: path.join(output, 'materials-desktop.png'), fullPage: true });
  await page.getByRole('button', { name: '分析所选材料', exact: true }).click();
  await expect(page.getByRole('heading', { name: '核对项目理解', exact: true })).toBeVisible({ timeout: 180000 });
  await page.getByLabel('你在项目中的角色是什么？哪些部分由你负责，哪些由团队其他成员完成？').fill(resulab ? '合成验收角色：项目成员，仅负责简历状态更新与 PDF 导出，其余模块不主张个人贡献。' : '团队成员，负责查询接口，其他模块由队友完成');
  await page.getByLabel('你本人完成了哪些具体实现、技术选择或问题处理？可以结合上面的文件说明。').fill(resulab ? '合成经历说明：使用 TypeScript 维护简历状态更新逻辑，连接 html2canvas 和 jsPDF 导出流程，选择可见预览页面，交付本地演示版本。' : '我使用 TypeScript 实现课程资料查询接口，对查询条件进行过滤，交付可演示版本。');
  await page.getByLabel('实际交付或验证到了哪一步？有可核实的效果或数据吗？不知道可以留空。').fill(resulab ? '仅用于本地合成验收，不主张线上用户量、性能收益或整个项目的作者身份。' : '已完成课程演示，未部署上线，没有实际用户数据。');
  await expect(page.getByRole('status').filter({ hasText: /^已保存$/ })).toBeVisible();
  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.getByLabel('你本人完成了哪些具体实现、技术选择或问题处理？可以结合上面的文件说明。')).toHaveValue(/TypeScript/);
  await page.getByRole('button', { name: '生成基础经历', exact: true }).click();
  await expect(page.getByRole('heading', { name: '编辑基础经历', exact: true })).toBeVisible({ timeout: 180000 });
  const generatedName = await page.getByLabel('项目名称', { exact: true }).inputValue();
  await page.getByLabel('项目名称', { exact: true }).fill(''); await expect(page.getByRole('button', { name: '确认事实并保存经历', exact: true })).toBeDisabled();
  await page.reload({ waitUntil: 'domcontentloaded' }); await expect(page.getByLabel('项目名称', { exact: true })).toHaveValue('');
  await page.getByLabel('项目名称', { exact: true }).fill(generatedName);
  const existingBullets = await page.getByRole('button', { name: /^删除贡献 \d+$/ }).count();
  if (existingBullets < 5) { await page.getByRole('button', { name: '新增贡献', exact: true }).click(); await expect(page.getByRole('button', { name: '确认事实并保存经历', exact: true })).toBeDisabled(); await page.getByRole('button', { name: `删除贡献 ${existingBullets + 1}`, exact: true }).click(); }
  const originalSummary = resulab ? '团队协作开发的简历制作和导出项目。' : '团队协作完成的课程资料查询项目。';
  await page.getByLabel('项目简述', { exact: true }).fill(originalSummary);
  await page.getByLabel('修改要求', { exact: true }).fill(resulab ? '缩短简述，突出简历制作背景，不新增部署或用户成果。' : '缩短简述，保留课程演示背景，不新增部署或用户成果。');
  await page.getByRole('button', { name: '仅重写所选段落', exact: true }).click();
  await expect(page.getByRole('button', { name: '采用候选改动', exact: true })).toBeVisible({ timeout: 180000 });
  await page.getByRole('button', { name: '采用候选改动', exact: true }).click();
  await expect(page.getByLabel('项目简述', { exact: true })).not.toHaveValue(originalSummary);
  await page.screenshot({ path: path.join(output, 'draft-desktop.png'), fullPage: true });
  for (const width of [768, 390, 375]) { await page.setViewportSize({ width, height: 844 }); await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await page.screenshot({ path: path.join(output, `draft-${width}.png`), fullPage: true }); }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: '确认事实并保存经历', exact: true }).click();
  await expect(page.getByRole('heading', { name: '填入前核对', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '确认填入当前简历', exact: true }).click();
  await expect(page).toHaveURL(/builder/); await expect(page.locator('[data-resume-source]').first()).toContainText(term);
  const form = page.locator('.builder-form-column');
  await page.getByRole('button', { name: '导出', exact: true }).click(); await page.getByRole('button', { name: 'PDF 文档 (.pdf)', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '导出前检查' })).toContainText('尚未填写姓名');
  await page.getByRole('dialog', { name: '导出前检查' }).getByRole('button', { name: '前往修改' }).first().click();
  await expect(form.getByPlaceholder('请输入姓名', { exact: true })).toBeFocused();
  await form.getByPlaceholder('请输入姓名', { exact: true }).fill('合成验收候选人');
  await form.getByPlaceholder('example@email.com', { exact: true }).fill('synthetic@example.invalid');
  await expect(page.locator('[data-resume-source]').first()).toContainText('合成验收候选人');
  for (const format of ['PDF', 'Word']) {
    await page.getByRole('button', { name: '导出', exact: true }).click();
    await page.getByRole('button', { name: format === 'PDF' ? 'PDF 文档 (.pdf)' : 'Word 文档 (.docx)', exact: true }).click();
    await expect(page.getByRole('dialog', { name: '导出前检查' })).toContainText('当前预览共');
    const waiting = page.waitForEvent('download'); await page.getByRole('button', { name: `确认导出 ${format}`, exact: true }).click();
    const download = await waiting, filename = path.join(output, format === 'PDF' ? 'project-resume.pdf' : 'project-resume.docx'); await download.saveAs(filename);
    const bytes = await readFile(filename);
    if (format === 'PDF') { if (bytes.subarray(0, 4).toString() !== '%PDF' || bytes.length < 1000) throw new Error('Invalid PDF export'); }
    else { const xml = new TextDecoder().decode(unzipSync(bytes)['word/document.xml']); if (!xml.includes('合成验收候选人') || !xml.includes(term)) throw new Error('Word lost name/project content'); }
  }
  await page.getByRole('link', { name: '管理简历', exact: true }).click(); await expect(page.getByRole('heading', { name: '我的简历', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '另存当前稿副本', exact: true }).click(); await expect(page.getByRole('status').filter({ hasText: '当前稿已独立保存' })).toBeVisible();
  await page.getByRole('button', { name: '复制', exact: true }).first().click();
  await expect(page.getByRole('status').filter({ hasText: '已创建独立副本' })).toBeVisible();
  await page.getByRole('button', { name: '归档', exact: true }).first().click();
  await page.getByLabel('查看已归档', { exact: true }).check();
  await expect(page.getByRole('button', { name: '恢复', exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: '恢复', exact: true }).first().click();
  await page.getByLabel('查看已归档', { exact: true }).uncheck();
  const backupDownload = page.waitForEvent('download'); await page.getByRole('button', { name: '导出简历备份', exact: true }).click(); const backup = await backupDownload; await backup.saveAs(path.join(output, 'documents-backup.json'));
  await page.getByLabel('导入简历备份', { exact: true }).setInputFiles(path.join(output, 'documents-backup.json')); await expect(page.getByRole('heading', { name: '备份导入预览', exact: true })).toBeVisible(); await page.getByRole('button', { name: '确认导入', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: '备份已恢复' })).toBeVisible();
  for (const width of [390, 375]) { await page.setViewportSize({ width, height: 844 }); await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: path.join(output, 'documents-desktop.png'), fullPage: true });
  // Two tabs must retain their own unsaved snapshots after a revision conflict and refresh.
  await page.goto('http://127.0.0.1:3206/builder', { waitUntil: 'domcontentloaded' });
  const otherTab = await page.context().newPage(); otherTab.on('pageerror', e => errors.push(e.message));
  await otherTab.goto('http://127.0.0.1:3206/builder', { waitUntil: 'domcontentloaded' });
  const phone = p => p.locator('.builder-form-column').getByPlaceholder('请输入手机号', { exact: true });
  await expect(phone(page)).toBeVisible(); await expect(phone(otherTab)).toBeVisible();
  await expect(page.locator('.builder-context')).toContainText('已自动保存到本机');
  await expect(otherTab.locator('.builder-context')).toContainText('已自动保存到本机');
  await phone(page).fill('10000000111'); await expect(page.locator('.builder-context')).toContainText('已自动保存到本机');
  await phone(otherTab).fill('10000000222'); await expect(otherTab.locator('.builder-context')).toContainText('版本冲突');
  await otherTab.reload({ waitUntil: 'domcontentloaded' }); await expect(phone(otherTab)).toHaveValue('10000000222');
  await expect(otherTab.locator('.builder-context')).toContainText('版本冲突');
  await otherTab.getByRole('link', { name: '管理简历', exact: true }).click();
  await otherTab.getByRole('button', { name: '另存当前稿副本', exact: true }).click();
  await expect(otherTab.getByRole('status').filter({ hasText: '当前稿已独立保存' })).toBeVisible();
  const phones = await otherTab.evaluate(() => new Promise((resolve, reject) => { const req = indexedDB.open('resulab-resume-documents'); req.onerror = () => reject(req.error); req.onsuccess = () => { const db = req.result, tx = db.transaction('documents', 'readonly'), all = tx.objectStore('documents').getAll(); tx.oncomplete = () => { db.close(); resolve(all.result.map(row => row.resume.personalInfo.phone)); }; tx.onerror = () => reject(tx.error); }; }));
  if (!phones.includes('10000000111') || !phones.includes('10000000222')) throw new Error('Concurrent tab edits were not preserved as separate documents');
  await page.reload({ waitUntil: 'domcontentloaded' }); await expect(phone(page)).toHaveValue('10000000111');
  await otherTab.close();
  const report = await fetch('http://127.0.0.1:3205/api/e2e/project-report').then(r => r.json());
  await writeFile(path.join(output, real ? 'real-model-report.json' : 'simulated-report.json'), JSON.stringify({ ...report, browserErrors: errors }, null, 2));
  if (errors.length) throw new Error(errors.join('\n'));
  console.log(`Project browser flow passed (${real ? 'real model' : 'simulated model'}).`);
} catch (e) { if (activePage) { await activePage.screenshot({ path: path.join(output, 'failure.png'), fullPage: true }).catch(() => {}); await writeFile(path.join(output, 'failure.html'), await activePage.content().catch(() => '')); } throw e; }
finally { await browser?.close(); server.send('stop'); await new Promise(resolve => { server.once('exit', resolve); setTimeout(() => { server.kill(); resolve(); }, 10000).unref(); }); }
