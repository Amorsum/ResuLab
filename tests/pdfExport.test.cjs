const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function compile(file, dependencies, globals = {}) {
  const source = fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', ...Object.keys(globals), code)(name => {
    assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
    return dependencies[name];
  }, module, module.exports, ...Object.values(globals));
  return module.exports;
}

function harness(savePdf = async () => {}) {
  const slots = [], captures = [];
  let cursor = 0;
  const react = {
    useState(initial) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = initial;
      return [slots[i], value => { slots[i] = value; }];
    },
    useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; },
    useCallback(callback) { return callback; },
  };
  const { usePdfExport } = compile('src/hooks/usePdfExport.ts', {
    react,
    './useResume': { useResume: () => ({ resume: { personalInfo: { fullName: '合成样例' } } }) },
    '../utils/pdfExport': { exportToPdf: async (element, filename) => { captures.push({ element, filename }); await savePdf(); } },
    '../utils/docxExport': { exportToDocx: async () => {} },
  }, { getComputedStyle: element => ({ visibility: element.visibility }) });
  const alternate = { current: null };
  return { captures, alternate, render() { cursor = 0; return usePdfExport(alternate); } };
}

const preview = (width, height, visibility = 'visible') => ({ visibility, getBoundingClientRect: () => ({ width, height }) });

test('separate refs capture visible desktop after Agent mounts hidden mobile, then follow breakpoint changes', async () => {
  const h = harness();
  const api = h.render();
  const desktop = preview(873, 1235), hiddenMobile = preview(0, 0);
  api.previewRef.current = desktop;
  h.alternate.current = hiddenMobile;
  await api.exportPdf();
  assert.equal(h.captures[0].element, desktop);
  assert.equal(h.captures[0].filename, '合成样例_简历');
  api.previewRef.current = preview(0, 0);
  const mobile = preview(341, 483);
  h.alternate.current = mobile;
  await h.render().exportPdf();
  assert.equal(h.captures[1].element, mobile);
  // Returning to mobile editing unmounts its preview; never capture hidden desktop.
  h.alternate.current = null;
  await h.render().exportPdf();
  assert.equal(h.captures.length, 2);
  assert.match(h.render().error, /预览区域未就绪/);
});

test('dialog-hidden or unmounted previews cannot be captured', async () => {
  const h = harness();
  let api = h.render();
  await api.exportPdf();
  api.previewRef.current = preview(794, 1123, 'hidden');
  await api.exportPdf();
  assert.equal(h.captures.length, 0);
  api = h.render();
  assert.equal(api.isExporting, false);
  assert.match(api.error, /预览区域未就绪/);
});

test('rapid repeat export is single-flight and unlocks after completion', async () => {
  let finish;
  const h = harness(() => new Promise(resolve => { finish = resolve; }));
  const api = h.render();
  api.previewRef.current = preview(794, 1123);
  const pending = api.exportPdf();
  assert.equal(h.render().isExporting, true);
  await api.exportPdf();
  assert.equal(h.captures.length, 1);
  finish(); await pending;
  assert.equal(h.render().isExporting, false);
  const next = h.render().exportPdf();
  assert.equal(h.captures.length, 2);
  finish(); await next;
});

test('zero-sized canvas fails before constructing PDF and restores preview styles', async () => {
  let pdfCreated = false;
  const { exportToPdf } = compile('src/utils/pdfExport.ts', {
    html2canvas: { default: async () => ({ width: 0, height: 0 }) },
    jspdf: { jsPDF: class { constructor() { pdfCreated = true; } } },
    '@tauri-apps/api/core': {},
  }, { window: {} });
  const element = { style: { maxHeight: 'none', overflow: 'visible' } };
  await assert.rejects(exportToPdf(element, '合成样例'), /截图尺寸无效/);
  assert.equal(pdfCreated, false);
  assert.deepEqual(element.style, { maxHeight: 'none', overflow: 'visible' });
});

test('multi-page export captures full unscaled content and does not create a rounding-only blank page', async () => {
  let options, pages = 1, saved = false;
  const { exportToPdf } = compile('src/utils/pdfExport.ts', {
    html2canvas: { default: async (_element, settings) => { options = settings; return { width: 1588, height: 4492, toDataURL: () => 'data:image/jpeg;base64,synthetic' }; } },
    jspdf: { jsPDF: class { addImage() {} addPage() { pages++; } save() { saved = true; } } },
    '@tauri-apps/api/core': {},
  }, { window: {} });
  const element = { scrollHeight: 2246, style: { maxHeight: '', overflow: '' } };
  await exportToPdf(element, 'synthetic');
  assert.equal(options.height, 2246); assert.equal(options.width, 794);
  const clone = { style: {} }; options.onclone({}, clone);
  assert.equal(clone.style.transform, 'none'); assert.equal(clone.style.maxHeight, 'none');
  assert.equal(pages, 2); assert.equal(saved, true);
  assert.deepEqual(element.style, { maxHeight: '', overflow: '' });
});

test('page boundary moves to whitespace before glyphs and has a safe fallback for filled backgrounds', () => {
  const { whitespaceBreak } = compile('src/utils/pdfExport.ts', { html2canvas: {}, jspdf: {}, '@tauri-apps/api/core': {} }, { window: {} });
  const pixels = new Uint8ClampedArray(100 * 20 * 4).fill(255);
  for (let y = 15; y < 20; y++) for (let x = 10; x < 80; x++) pixels[(y * 100 + x) * 4] = 0;
  assert.equal(whitespaceBreak(pixels, 100, 20), 14);
  pixels.fill(0);
  assert.equal(whitespaceBreak(pixels, 100, 20), 20);
});
