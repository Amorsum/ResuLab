// Run with node --test tests/aiImport.test.cjs; uses existing TypeScript only.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
function loader(react) {
  const cache = new Map();
  function load(file) {
    file = path.resolve(__dirname, '..', file);
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} }; cache.set(file, module);
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
    new Function('require', 'module', 'exports', code)(name => name === 'react' ? react : load(path.resolve(path.dirname(file), `${name}.ts`)), module, module.exports);
    return module.exports;
  }
  return load;
}
const load = loader();
const { prepareAIImport, hasImportChanges } = load('src/utils/aiImport.ts');
const { createEmptyResume } = load('src/constants/defaultResume.ts');
const { resumeReducer } = load('src/context/resumeReducer.ts');
const action = payload => ({ type: 'IMPORT_AI_RESUME', payload });
test('empty resume: valid types, generated IDs, and layout isolation', () => {
  const state = createEmptyResume();
  const plan = prepareAIImport({ fontSize: 99, personalInfo: { fullName: '合成样例', avatar: 'bad', gender: 'invalid', unknown: 'bad' }, workExperience: [{ id: 'model-id', companyName: '测试公司', isCurrent: true, highlights: ['成果', 3] }], projects: [{ projectName: '项目', isCurrent: false, techStack: ['React', null] }] }, state);
  const result = resumeReducer(state, action(plan));
  assert.equal(result.workExperience[0].isCurrent, true);
  assert.equal(result.projects[0].isCurrent, false);
  assert.deepEqual(result.workExperience[0].highlights, ['成果']);
  assert.deepEqual(result.projects[0].techStack, ['React']);
  assert.notEqual(result.workExperience[0].id, 'model-id');
  assert.notEqual(result.workExperience[0].id, result.projects[0].id);
  assert.equal(result.personalInfo.avatar, ''); assert.equal(result.personalInfo.gender, '');
  assert.equal(result.personalInfo.unknown, undefined); assert.equal(result.fontSize, state.fontSize);
  assert.equal(state.workExperience.length, 0);
});
test('existing resume: preserve entries and deduplicate within and across batches', () => {
  const state = createEmptyResume();
  const raw = { education: [{ schoolName: '合成学校', isCurrent: true }, { schoolName: '合成学校', isCurrent: true }] };
  const first = prepareAIImport(raw, state);
  assert.equal(first.items.education.length, 1); assert.equal(first.skipped, 1);
  const existing = resumeReducer(state, action(first));
  const repeat = prepareAIImport(raw, existing);
  assert.equal(hasImportChanges(repeat), false); assert.equal(repeat.skipped, 2);
  const next = resumeReducer(existing, action(prepareAIImport({ education: [{ schoolName: '另一学校' }] }, existing)));
  assert.deepEqual(next.education[0], existing.education[0]); assert.equal(next.education.length, 2);
});
test('invalid model data cannot introduce unknown fields or invalid enums', () => {
  const state = createEmptyResume();
  for (const raw of [null, [], 'text']) assert.throws(() => prepareAIImport(raw, state));
  const plan = prepareAIImport({ skills: [null, {}, { skillName: 'React', level: '超级精通', secret: 'bad' }], languages: [{ language: '英语', level: 3 }], socialLinks: [{ platform: 'GitHub', url: 'https://example.com' }] }, state);
  const result = resumeReducer(state, action(plan));
  assert.equal(result.skills[0].level, '熟练'); assert.equal(result.skills[0].secret, undefined);
  assert.equal(result.languages[0].level, '良好'); assert.equal(result.socialLinks.length, 1);
  assert.equal(hasImportChanges(prepareAIImport({ projects: [{ isCurrent: true }] }, state)), false);
});
test('preview preparation is read-only and edited/reordered resumes reject whole batch', () => {
  const state = createEmptyResume();
  const before = JSON.stringify(state);
  const plan = prepareAIImport({ selfEvaluation: '合成评价', projects: [{ projectName: '项目' }] }, state);
  assert.equal(JSON.stringify(state), before);
  const edited = resumeReducer(state, { type: 'SET_SELF_EVALUATION', payload: '用户新内容' });
  assert.equal(resumeReducer(edited, action(plan)), edited);
  const result = resumeReducer(state, action(plan));
  assert.equal(resumeReducer(result, action(plan)), result);
  const two = resumeReducer(result, action(prepareAIImport({ projects: [{ projectName: '第二项目' }] }, result)));
  const pending = prepareAIImport({ selfEvaluation: '新评价' }, two);
  const reordered = resumeReducer(two, { type: 'MOVE_ITEM', section: 'projects', fromIndex: 0, toIndex: 1 });
  assert.equal(resumeReducer(reordered, action(pending)), reordered);
});
test('one batch uses one actual undo history entry; rejected imports do not consume history', () => {
  let current;
  const harness = loader({ useCallback: f => f, useRef: value => ({ current: value }), useReducer: (reducer, initial) => {
    current ??= initial;
    return [current, event => { current = reducer(current, event); }];
  } });
  const { useResumeWithUndo } = harness('src/context/useResumeWithUndo.ts');
  const state = createEmptyResume();
  const render = () => useResumeWithUndo(resumeReducer, state);
  const plan = prepareAIImport({ personalInfo: { fullName: '样例' }, projects: [{ projectName: '项目1' }, { projectName: '项目2' }], selfEvaluation: '评价' }, state);
  render().dispatch(action(plan));
  const imported = render().state;
  assert.equal(render().canUndo, true); assert.equal(imported.projects.length, 2);
  render().dispatch(action(plan));
  render().undo();
  assert.equal(render().state, state); assert.equal(render().canUndo, false);
  render().redo(); assert.equal(render().state, imported);
});
