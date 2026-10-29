import { chromium, expect } from '@playwright/test';
import { createServer } from 'vite';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const output = path.join(root, '.cache/resume-templates');
await mkdir(output, { recursive: true });
const html = '<html><head><meta name="viewport" content="width=device-width, initial-scale=1" /></head><body style="margin:0;background:#e8edf2"><div id="fixture"></div><script type="module" src="/@id/__x00__virtual:resume-check"></script></body></html>';
const entry = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import '/src/index.css';
import Base from '/src/templates/TemplateBase.tsx';
import Classic from '/src/templates/classic/ClassicTemplate.tsx';
import Modern from '/src/templates/modern/ModernTemplate.tsx';
import Minimal from '/src/templates/minimal/MinimalTemplate.tsx';
import Professional from '/src/templates/professional/ProfessionalTemplate.tsx';
import { createPdfBlob } from '/src/utils/pdfExport.ts';
import * as pdfjs from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;
const templates = { classic: Classic, modern: Modern, minimal: Minimal, professional: Professional };
const root = createRoot(document.getElementById('fixture'));
window.renderResume = (data, scale) => root.render(React.createElement(Base, { scale, transformOrigin: 'top left' }, React.createElement(templates[data.templateId], { data })));
window.exportResume = async () => {
  const bytes = new Uint8Array(await (await createPdfBlob(document.querySelector('.a4-preview'))).arrayBuffer());
  const loading = pdfjs.getDocument({ data: bytes.slice() });
  const pdf = await loading.promise;
  const proof = [];
  for (let number = 1; number <= pdf.numPages; number++) {
    const page = await pdf.getPage(number);
    const viewport = page.getViewport({ scale: 794 / page.getViewport({ scale: 1 }).width });
    const canvas = document.createElement('canvas');
    canvas.width = 794; canvas.height = 1123;
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    const pixels = canvas.getContext('2d').getImageData(0, 0, 794, 1123).data;
    let ink = 0, edgeInk = 0;
    for (let y = 0; y < 1123; y++) for (let x = 0; x < 794; x++) {
      const offset = (y * 794 + x) * 4;
      if (pixels[offset] + pixels[offset + 1] + pixels[offset + 2] < 450) {
        ink++;
        if (number > 1 && y === 40) edgeInk++;
      }
    }
    proof.push({ ink, edgeInk, png: canvas.toDataURL('image/png') });
  }
  await loading.destroy();
  return { bytes: Array.from(bytes), proof };
};
`;
const dependencies = Object.keys(JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')).dependencies);
const server = await createServer({ root, cacheDir: '.cache/vite-resume-templates', optimizeDeps: { noDiscovery: true, entries: [], include: [...dependencies, 'react-dom/client', 'react/jsx-runtime', '@tauri-apps/api/core'] }, server: { host: '127.0.0.1', port: 3193, strictPort: true, open: false }, plugins: [{
  name: 'resume-check-only',
  resolveId(id) { if (id === 'virtual:resume-check') return '\0virtual:resume-check'; },
  load(id) { if (id === '\0virtual:resume-check') return entry; },
  configureServer(dev) { dev.middlewares.use('/__resume-check', async (_req, res) => { res.setHeader('Content-Type', 'text/html'); res.end(await dev.transformIndexHtml('/__resume-check', html)); }); },
}], define: {
  'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('https://fixture.supabase.co'),
  'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify('fixture'),
} });

function fixture(templateId, long = false) {
  const longWord = 'ContinuousEnglishWithoutSpaces'.repeat(5);
  return {
    templateId, accentColor: '#2563eb', fontFamily: 'yahei', fontSize: 14, lineHeight: 22, pageMargin: 15, lastModified: 0,
    personalInfo: { fullName: '林知远', gender: '男', birthYear: '1998', birthMonth: '6', phone: '138 0000 0000', email: long ? `${longWord}@example.invalid` : 'zhiyuan.lin@example.invalid', city: '上海', avatar: `data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="90" height="120"><rect width="90" height="120" fill="#dce5ee"/><circle cx="45" cy="42" r="21" fill="#8094aa"/><path d="M10 120v-16a35 35 0 0 1 70 0v16" fill="#8094aa"/></svg>').toString('base64')}`, jobTitle: '前端开发工程师', yearsOfExperience: '3' },
    jobIntention: { desiredPosition: '高级前端工程师', desiredCity: '上海 / 杭州', expectedSalary: '面议', jobType: '全职', availableDate: '两周内到岗' },
    education: [{ id: 'edu', schoolName: long ? `示例大学计算机科学与技术学院${longWord}` : '示例大学', degree: '本科', major: '计算机科学与技术', startDate: '2017-09', endDate: '2021-06', isCurrent: false, gpa: '3.7 / 4.0', description: '主修数据结构、软件工程与计算机网络。' }],
    workExperience: Array.from({ length: long ? 5 : 1 }, (_, i) => ({ id: `work-${i}`, companyName: long ? `示例科技有限公司企业研发与数字化服务事业群${longWord}` : '示例科技有限公司', position: '前端开发工程师', city: '上海', startDate: '2021-07', endDate: '', isCurrent: true, description: long ? ('负责企业协作平台的前端开发，推进复杂表单、数据管理与组件建设。\n'.repeat(5)) : '负责企业协作平台的前端开发与组件建设。', highlights: ['将重复业务流程整理为可复用组件，提升跨团队协作效率。', '优化页面加载与交互体验，完善异常提示与可访问性。'] })),
    projects: [{ id: 'proj', projectName: long ? `协作平台重构项目${longWord}` : '企业协作平台重构', role: '前端负责人', startDate: '2023-03', endDate: '2024-01', isCurrent: false, description: '梳理核心操作流程，建立统一的表单与权限组件。', techStack: ['React', 'TypeScript', 'Vite'], url: `https://example.invalid/${long ? longWord : 'portfolio'}` }],
    skills: [{ id: 's1', skillName: long ? longWord : 'React / TypeScript', level: '熟练', category: '前端开发' }, { id: 's2', skillName: 'HTML / CSS', level: '熟练', category: '前端开发' }, { id: 's3', skillName: 'Git / 测试 / 构建', level: '掌握', category: '工程实践' }],
    certificates: [{ id: 'cert', name: '软件设计师', issuer: '示例颁发机构', date: '2022-11' }],
    languages: [{ id: 'lang', language: '英语', level: '熟练', score: 'CET-6 580' }],
    socialLinks: [{ id: 'social', platform: '作品集', url: `https://example.invalid/${long ? longWord : 'work'}` }],
    selfEvaluation: '关注产品体验与工程质量，能够将复杂需求拆解为清晰、可维护的实现。',
  };
}

await server.listen();
const browser = await chromium.launch({ headless: true });
const failures = [], results = [];
let pdfExports = 0;
try {
  const context = await browser.newContext();
  await context.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  const page = await context.newPage();
  page.on('pageerror', error => { failures.push(error.message); console.error(error.message); });
  await page.goto('http://127.0.0.1:3193/__resume-check', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => Boolean(window.renderResume), { timeout: 60000 });
  const templatesToCheck = process.argv.includes('--editor-only') ? [] : process.argv.includes('--classic-only') ? ['classic'] : ['classic', 'modern', 'minimal', 'professional'];
  for (const template of templatesToCheck) {
    console.log(`Checking ${template}…`);
    for (const width of [1440, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const mode of ['normal', 'long', 'compact', 'relaxed']) {
        const data = fixture(template, mode !== 'normal');
        if (mode === 'compact') { Object.assign(data, { fontSize: 18, lineHeight: 12, pageMargin: 25, fontFamily: 'songti' }); data.personalInfo.fullName += '（多语言姓名与超长标题排版检查）'; }
        if (mode === 'relaxed') Object.assign(data, { fontSize: 12, lineHeight: 28, pageMargin: 5, fontFamily: 'kaiti' });
        const scale = Math.min(1, (width - 24) / 794);
        await page.evaluate(({ data, scale }) => window.renderResume(data, scale), { data, scale });
        await expect(page.locator('[data-resume-source] .resume-sheet')).toHaveClass(new RegExp(`resume-${template}`));
        await page.evaluate(() => document.fonts.ready);
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const metrics = await page.evaluate(() => {
          const source = document.querySelector('[data-resume-source]');
          const bounds = source.getBoundingClientRect(), scale = bounds.width / 794;
          const outside = [...source.querySelectorAll('*')].filter(el => {
            const r = el.getBoundingClientRect();
            return r.width && (r.left < bounds.left - 1 || r.right > bounds.right + 1);
          }).map(el => el.className);
          const slices = [...document.querySelectorAll('[data-resume-page]')].map(el => ({ start: +el.dataset.sourceStart, end: +el.dataset.sourceEnd }));
          const cuts = [], textRects = [], walker = document.createTreeWalker(source, NodeFilter.SHOW_TEXT), range = document.createRange();
          let node;
          while ((node = walker.nextNode())) {
            if (!node.textContent.trim()) continue;
            range.selectNodeContents(node);
            for (const rect of range.getClientRects()) {
              if (!rect.width || !rect.height) continue;
              textRects.push({ left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, text: node.textContent.slice(0, 20) });
              const top = (rect.top - bounds.top) / scale, bottom = (rect.bottom - bounds.top) / scale;
              for (const slice of slices.slice(0, -1)) if (top + .3 < slice.end && bottom - .3 > slice.end) cuts.push(node.textContent.slice(0, 30));
            }
          }
          const textOverlaps = [];
          for (let i = 0; i < textRects.length; i++) for (let j = i + 1; j < textRects.length; j++) {
            const a = textRects[i], b = textRects[j];
            if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > scale && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > scale) textOverlaps.push([a.text, b.text]);
          }
          for (const img of source.querySelectorAll('img')) {
            const rect = img.getBoundingClientRect(), top = (rect.top - bounds.top) / scale, bottom = (rect.bottom - bounds.top) / scale;
            for (const slice of slices.slice(0, -1)) if (top + .3 < slice.end && bottom - .3 > slice.end) cuts.push('photo');
          }
          const collisions = [...source.querySelectorAll('.resume-entry-heading')].filter(el => {
            const title = el.querySelector('h3').getBoundingClientRect(), date = el.querySelector('.resume-date')?.getBoundingClientRect();
            return date && title.right > date.left + 1 && title.bottom > date.top + 1 && title.top < date.bottom - 1;
          });
          return { pages: slices.length, height: source.scrollHeight, end: slices.at(-1).end, outside, cuts, textOverlaps, collisions: collisions.length, horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1 };
        });
        assert.deepEqual(metrics.outside, [], `${template}/${width}/${mode} overflows`);
        assert.deepEqual(metrics.cuts, [], `${template}/${width}/${mode} cuts text`);
        assert.deepEqual(metrics.textOverlaps, [], `${template}/${width}/${mode} overlapping text`);
        assert.equal(metrics.collisions, 0, `${template}/${width}/${mode} title/date overlap`);
        assert.equal(metrics.horizontalOverflow, false, `${template}/${width}/${mode} horizontal scrollbar`);
        assert.ok(metrics.end >= metrics.height, 'all content included');
        if (width === 1440) console.log(`  ${mode}: ${metrics.pages} pages, source ${metrics.height}px`);
        if (mode === 'normal' && metrics.pages !== 1) await page.screenshot({ path: path.join(output, `${template}-unexpected-pagination.png`), fullPage: true });
        if (mode === 'normal') assert.equal(metrics.pages, 1, `${template} ordinary fixture fits one page`);
        results.push({ template, width, mode, ...metrics });
        if (width === 1440 && mode === 'normal' || width === 390 && mode === 'compact') await page.screenshot({ path: path.join(output, `${template}-${width}-${mode}.png`), fullPage: true });
        if (width === 1440 && mode === 'long') {
          for (let i = 0; i < metrics.pages; i++) await page.locator('[data-resume-page]').nth(i).screenshot({ path: path.join(output, `${template}-browser-page-${i + 1}.png`) });
          const { bytes, proof } = await page.evaluate(() => window.exportResume());
          await writeFile(path.join(output, `${template}-multipage.pdf`), Buffer.from(bytes));
          const pdfText = Buffer.from(bytes).toString('latin1');
          const pageCount = (pdfText.match(/\/Type \/Page\b/g) || []).length;
          assert.equal(pageCount, metrics.pages, `${template} PDF matches preview page count`);
          for (let i = 0; i < proof.length; i++) {
            await writeFile(path.join(output, `${template}-pdf-page-${i + 1}.png`), Buffer.from(proof[i].png.split(',')[1], 'base64'));
            assert.ok(proof[i].ink > 200, `${template} PDF page ${i + 1} has visible content`);
            assert.equal(proof[i].edgeInk, 0, `${template} PDF page ${i + 1} has no glyph residue at continuation edge`);
          }
          pdfExports++;
        }
      }
    }
  }
  for (const templateId of ['classic', 'modern', 'minimal', 'professional']) {
    const data = fixture(templateId);
    data.fontFamily = 'fangsong';
    Object.assign(data, { education: [], workExperience: [], projects: [], skills: [], certificates: [], languages: [], selfEvaluation: '', socialLinks: [] });
    Object.keys(data.personalInfo).forEach(key => data.personalInfo[key] = '');
    Object.keys(data.jobIntention).forEach(key => data.jobIntention[key] = '');
    data.jobIntention.availableDate = '仅填写到岗时间';
    await page.evaluate(data => window.renderResume(data, .35), data);
    await expect(page.locator('[data-resume-source]')).toContainText('仅填写到岗时间');
    await expect(page.locator('[data-resume-source] .resume-section')).toHaveCount(0);
    assert.equal(await page.locator('[data-resume-page]').count(), 1);
  }
  const socialOnly = fixture('classic');
  Object.keys(socialOnly.personalInfo).forEach(key => socialOnly.personalInfo[key] = '');
  Object.assign(socialOnly, { skills: [], languages: [] });
  await page.evaluate(data => window.renderResume(data, .35), socialOnly);
  await expect(page.locator('[data-resume-source] .resume-sidebar')).toContainText('https://example.invalid/work');
  // Full editor integration: the last page must scroll clear of the mobile toolbar.
  for (const width of [1440, 768, 390, 320]) {
    const editor = await context.newPage();
    await editor.setViewportSize({ width, height: 900 });
    await editor.addInitScript(data => { localStorage.setItem('resulab_data', JSON.stringify(data)); localStorage.setItem('resulab_onboarding_done', 'true'); }, fixture('classic', true));
    await editor.goto('http://127.0.0.1:3193/builder/classic', { waitUntil: 'domcontentloaded', timeout: 60000 });
    if (width < 1024) await editor.getByRole('button', { name: '预览简历', exact: true }).click();
    const preview = editor.locator('.a4-preview:visible');
    await expect(preview.locator('.resume-sheet').first()).toBeVisible();
    await editor.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await preview.locator('[data-resume-page]').last().scrollIntoViewIfNeeded();
    await editor.evaluate(() => {
      document.querySelectorAll('.preview-canvas, .builder-shell .overflow-y-auto').forEach(el => el.scrollTop = el.scrollHeight);
    });
    const lastPage = await preview.locator('[data-resume-page]').last().boundingBox();
    const canvasBounds = await editor.locator('.preview-canvas:visible').boundingBox();
    const bottomBar = width < 1024 ? await editor.locator('.mobile-builder-bar').boundingBox() : null;
    assert.ok(lastPage.y + lastPage.height <= (bottomBar?.y ?? 900) + 1, `last page scrolls above toolbar at ${width}`);
    assert.ok(lastPage.y + lastPage.height > canvasBounds.y + 40, `last page remains visible at maximum scroll at ${width}`);
    assert.ok(await editor.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `editor fits ${width}`);
    await editor.screenshot({ path: path.join(output, `editor-${width}.png`) });
    await editor.close();
  }
  assert.deepEqual(failures, []);
  await writeFile(path.join(output, 'results.json'), JSON.stringify(results, null, 2));
  console.log(`PASS: ${results.length} template/viewport/content combinations; no horizontal overflow, clipped lines or overlapping dates; ${pdfExports} PDFs match preview counts and have no blank pages or continuation-edge glyph residue; desktop/mobile editor integration. Screenshots and PDFs: ${output}`);
} finally { await browser.close(); await server.close(); }
