const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const path = require('node:path');

test('cloud acknowledgements preserve concurrent edits, reject switched documents and never cross accounts', async () => {
  const build = require('esbuild').buildSync({ entryPoints: [path.join(__dirname, '../src/context/resumeReducer.ts')], bundle: true, format: 'cjs', platform: 'node', write: false }).outputFiles[0].text;
  const reducerModule = { exports: {} }; new Function('module', 'exports', 'require', build)(reducerModule, reducerModule.exports, require);
  for (const mode of ['edited', 'account', 'document', 'unchanged']) {
    let resume = { documentMeta: { id: 'original-document' }, personalInfo: { fullName: 'Synthetic' } }, user = { id: 'test-user' }, finish;
    const loaded = [], ref = { current: null };
    const deps = {
      react: { useRef: () => ref, useCallback: fn => fn },
      '../lib/supabase': { supabase: { from: () => ({ insert: () => ({ select: () => ({ single: () => new Promise(resolve => { finish = resolve; }) }) }) }) } },
      './useAuth': { useAuth: () => ({ user }) },
      './useResume': { useResume: () => ({ resume, loadResume: value => loaded.push(value), markCloudSaved: payload => { resume = reducerModule.exports.resumeReducer(resume, { type: 'ACK_CLOUD', payload }); } }) },
      '../context/ResumeContext': { STORAGE_KEY: 'test' },
    };
    const source = fs.readFileSync(path.join(__dirname, '../src/hooks/useCloudResumes.ts'), 'utf8');
    const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
    const module = { exports: {} };
    new Function('require', 'exports', code)(name => deps[name], module.exports);
    const pending = module.exports.useCloudResumes().saveResume();
    if (mode === 'edited') resume = { ...resume, personalInfo: { fullName: 'New edit' } };
    if (mode === 'account') user = { id: 'another-user' };
    if (mode === 'document') resume = { ...resume, documentMeta: { id: 'another-document' } };
    module.exports.useCloudResumes();
    finish({ data: { id: 'cloud-test-id', updated_at: '2026-10-27T00:00:00Z' }, error: null });
    assert.equal(await pending, 'cloud-test-id');
    assert.equal(loaded.length, 0);
    assert.equal(resume._cloudId, ['edited', 'unchanged'].includes(mode) ? 'cloud-test-id' : undefined);
    assert.equal(resume.personalInfo.fullName, mode === 'edited' ? 'New edit' : 'Synthetic');
  }
});
