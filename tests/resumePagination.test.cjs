const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const source = fs.readFileSync('src/utils/resumePagination.ts', 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const mod = { exports: {} };
new Function('module', 'exports', code)(mod, mod.exports);
const { paginateBands } = mod.exports;

test('short resumes stay on one A4 page, including exact-height content', () => {
  assert.deepEqual(paginateBands(1123, []), [{ start: 0, end: 1123, top: 0 }]);
  assert.equal(paginateBands(200, []).length, 1);
});

test('all source content survives pagination once, with safe line and image boundaries in both columns', () => {
  const bands = [];
  for (let y = 50; y < 4400; y += 24) bands.push({ top: y, bottom: y + 18 });
  bands.push({ top: 1010, bottom: 1130 }); // photo in a second column
  const pages = paginateBands(4500, bands);
  assert.equal(pages[0].start, 0);
  assert.equal(pages.at(-1).end, 4500);
  for (let i = 0; i < pages.length; i++) {
    const p = pages[i];
    assert.ok(p.end > p.start);
    assert.ok(p.top + p.end - p.start <= 1083);
    if (i) assert.equal(p.start, pages[i - 1].end);
    if (i < pages.length - 1) assert.ok(bands.every(b => !(b.top < p.end && b.bottom > p.end)));
  }
});

test('a nearby section boundary keeps its heading with following text', () => {
  const pages = paginateBands(1800, [{ top: 1000, bottom: 1100 }], [999]);
  assert.equal(pages[0].end, 999);
  assert.equal(pages[1].start, 999);
  assert.equal(pages[1].top, 40);
});

test('oversized protected regions still terminate and preserve every source coordinate', () => {
  const pages = paginateBands(3000, [{ top: 0, bottom: 3000 }]);
  assert.equal(pages.length, 3);
  assert.equal(pages.at(-1).end, 3000);
});
