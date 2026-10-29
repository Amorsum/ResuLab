const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function harness() {
  let history;
  const cache = new Map();
  const react = {
    useCallback: callback => callback,
    useRef: value => ({ current: value }),
    useReducer(reducer, initial) { history ??= initial; return [history, event => { history = reducer(history, event); }]; },
  };
  function load(file) {
    file = path.resolve(__dirname, '..', file);
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} }; cache.set(file, module);
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
    new Function('require', 'module', 'exports', code)(name => name === 'react' ? react : !name.startsWith('.') ? require(name) : load(path.resolve(path.dirname(file), name.replace(/\.js$/, '') + '.ts')), module, module.exports);
    return module.exports;
  }
  const { createEmptyResume } = load('src/constants/defaultResume.ts');
  const { resumeReducer } = load('src/context/resumeReducer.ts');
  const { useResumeWithUndo } = load('src/context/useResumeWithUndo.ts');
  const { snapshotFromResume, stableStringify } = load('shared/agent.ts');
  const initial = { ...createEmptyResume(), selfEvaluation: '合成原文' };
  const change = { id: 'change-undo', target: { section: 'selfEvaluation', field: 'selfEvaluation' }, before: initial.selfEvaluation, after: '合成建议', reason: '用于撤销回归', sources: [{ kind: 'resume', refId: 'resume:selfEvaluation::selfEvaluation', quote: initial.selfEvaluation }], needsConfirmation: true };
  const application = { type: 'APPLY_AGENT_CHANGES', payload: { baseSnapshot: stableStringify(snapshotFromResume(initial)), changes: [change] } };
  return { initial, application, render: () => useResumeWithUndo(resumeReducer, initial) };
}

test('initializing or reselecting the current template adds no undo entry', () => {
  const h = harness();
  h.render().dispatch({ type: 'SET_TEMPLATE', payload: h.initial.templateId });
  assert.equal(h.render().state, h.initial);
  assert.equal(h.render().canUndo, false);
});
test('opening another document clears history and smart-fit stays within a single undo entry', () => {
  const h = harness();
  h.render().dispatch({ type: 'SET_LAYOUT', payload: { fontSize: 12, lineHeight: 14, pageMargin: 5 } });
  h.render().undo(); assert.equal(h.render().state, h.initial);
  h.render().dispatch(h.application); assert.equal(h.render().canUndo, true);
  h.render().dispatch({ type: 'LOAD_RESUME', payload: { ...h.initial, selfEvaluation: '另一份简历' } }, true);
  assert.equal(h.render().canUndo, false); assert.equal(h.render().canRedo, false);
});

test('a whole career application is exactly one undo and redo entry', () => {
  const h = harness(), initial = h.initial;
  const row = id => ({ fact: { id, section: 'certificates', sourceTitle: '奖项', doNotClaim: '', data: { id, name: '竞赛奖项', issuer: '学校', date: '' } }, origin: { entryId: 'entry', revision: 1, factId: id }, action: 'append' });
  h.render().dispatch({ type: 'APPLY_CAREER', payload: { base: JSON.stringify(initial), rows: [row('award-1'), row('award-2')] } });
  assert.equal(h.render().state.certificates.length, 2);
  h.render().undo(); assert.equal(h.render().state, initial); assert.equal(h.render().canUndo, false);
  h.render().redo(); assert.equal(h.render().state.certificates.length, 2);
});

test('a duplicate template selection after Agent apply does not intercept one-batch undo', () => {
  const h = harness();
  h.render().dispatch(h.application);
  const applied = h.render().state;
  assert.equal(applied.selfEvaluation, '合成建议');
  h.render().dispatch({ type: 'SET_TEMPLATE', payload: applied.templateId });
  h.render().undo();
  assert.equal(h.render().state, h.initial);
  assert.equal(h.render().canUndo, false);
  h.render().dispatch({ type: 'SET_TEMPLATE', payload: h.initial.templateId });
  assert.equal(h.render().canRedo, true);
  h.render().redo();
  assert.equal(h.render().state, applied);
});

test('actual layout changes remain distinct from the Agent batch in undo history', () => {
  const h = harness();
  h.render().dispatch(h.application);
  h.render().dispatch({ type: 'SET_TEMPLATE', payload: 'modern' });
  h.render().undo();
  assert.equal(h.render().state.templateId, h.initial.templateId);
  assert.equal(h.render().state.selfEvaluation, '合成建议');
  h.render().undo();
  assert.equal(h.render().state, h.initial);
});
