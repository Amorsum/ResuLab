const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const path = require('node:path');

test('late cloud creation never overwrites edits or a switched account, but attaches ID to unchanged data', async () => {
  for (const mode of ['edited', 'account', 'unchanged']) {
    let resume = { personalInfo: { fullName: 'Synthetic' } }, user = { id: 'test-user' }, finish;
    const loaded = [], ref = { current: null };
    const deps = {
      react: { useRef: () => ref, useCallback: fn => fn },
      '../lib/supabase': { supabase: { from: () => ({ insert: () => ({ select: () => ({ single: () => new Promise(resolve => { finish = resolve; }) }) }) }) } },
      './useAuth': { useAuth: () => ({ user }) },
      './useResume': { useResume: () => ({ resume, loadResume: value => loaded.push(value) }) },
      '../context/ResumeContext': { STORAGE_KEY: 'test' },
    };
    const source = fs.readFileSync(path.join(__dirname, '../src/hooks/useCloudResumes.ts'), 'utf8');
    const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
    const module = { exports: {} };
    new Function('require', 'exports', code)(name => deps[name], module.exports);
    const pending = module.exports.useCloudResumes().saveResume();
    if (mode === 'edited') resume = { personalInfo: { fullName: 'New edit' } };
    if (mode === 'account') user = { id: 'another-user' };
    module.exports.useCloudResumes();
    finish({ data: { id: 'cloud-test-id' }, error: null });
    assert.equal(await pending, 'cloud-test-id');
    assert.equal(loaded.length, mode === 'unchanged' ? 1 : 0);
    if (loaded.length) assert.equal(loaded[0]._cloudId, 'cloud-test-id');
  }
});
