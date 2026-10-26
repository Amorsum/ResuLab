import { test } from 'node:test';
import assert from 'node:assert/strict';
import { agentExamples, exampleSnapshot } from '../shared/agent.examples';
import { resumeRevision, snapshotFromResume } from '../shared/agent';
import { createEmptyResume } from '../src/constants/defaultResume';
import { applyAgentChanges, isFormattingOnlyChange, prepareAgentApplication } from '../src/utils/agentChanges';
import { AgentApiError, agentRequest } from '../src/utils/agentApi';

const sample = () => ({ ...createEmptyResume(), ...structuredClone(exampleSnapshot) });

test('formatting notice recognizes pasted whitespace and final punctuation without hiding rewritten content', () => {
  assert.equal(isFormattingOnlyChange({ before: '实现\u00a0Agent\u00a0Runtime，\n支持工具调\n用。', after: '实现 Agent Runtime，支持工具调用。' }), true);
  assert.equal(isFormattingOnlyChange({ before: '重视可靠性\n验证输出质量', after: '重视可靠性\n验证输出质量。' }), true);
  assert.equal(isFormattingOnlyChange({ before: '参与接口开发', after: '独立负责接口开发' }), false);
  assert.equal(isFormattingOnlyChange({ before: '耗时 11 秒', after: '耗时 3 秒' }), false);
  assert.equal(isFormattingOnlyChange({ before: ['开发接口', '编写测试'], after: ['开发接口\n编写测试'] }), false);
});
async function completed() { const state = sample(); return { state, run: { ...structuredClone(agentExamples.completed), resumeRevision: await resumeRevision(state) } }; }
test('snapshot excludes identity/layout; shared revision detects ordering and facts', async () => {
  const state = sample(); state.personalInfo.phone = 'private'; state.personalInfo.avatar = 'private';
  assert.equal(JSON.stringify(snapshotFromResume(state)).includes('private'), false);
  assert.equal(await resumeRevision(state), await resumeRevision({ ...state, fontSize: 18, lastModified: 1 }));
  assert.notEqual(await resumeRevision(state), await resumeRevision({ ...state, selfEvaluation: 'new fact' }));
  const two = { ...state, workExperience: [...state.workExperience, { ...state.workExperience[0], id: 'work-2' }] };
  assert.notEqual(await resumeRevision(two), await resumeRevision({ ...two, workExperience: [...two.workExperience].reverse() }));
});
test('selected changes apply as one immutable batch and cannot repeat', async () => {
  const { state, run } = await completed();
  const before = structuredClone(state);
  const plan = await prepareAgentApplication(state, run, ['change-1']);
  assert.deepEqual(state, before);
  const next = applyAgentChanges(state, plan);
  assert.equal(next.workExperience[0].description, run.changes[0].after);
  assert.equal(next.workExperience[0].id, state.workExperience[0].id);
  assert.equal(next.templateId, state.templateId);
  assert.equal(applyAgentChanges(next, plan), next);
  await assert.rejects(prepareAgentApplication(state, run, []));
});
test('before mismatch, missing item, invalid target and types reject whole batch', async () => {
  const { state, run } = await completed();
  for (const mutate of [
    (r: typeof run) => { r.changes[0].before = 'wrong'; },
    (r: typeof run) => { (r.changes[0].target as { itemId: string }).itemId = 'deleted'; },
    (r: typeof run) => { (r.changes[0].target as { field: string }).field = 'companyName'; },
    (r: typeof run) => { r.changes[0].after = ['wrong type']; },
    (r: typeof run) => { r.changes[0].needsConfirmation = false; },
  ]) {
    const invalid = structuredClone(run); mutate(invalid);
    await assert.rejects(prepareAgentApplication(state, invalid, ['change-1']));
  }
  const plan = await prepareAgentApplication(state, run, ['change-1']);
  const edited = { ...state, selfEvaluation: 'concurrent edit' };
  assert.equal(applyAgentChanges(edited, plan), edited);
  await assert.rejects(prepareAgentApplication(edited, run, ['change-1']));
});
test('subset choice validates only selected targets; duplicate targets are rejected', async () => {
  const { state, run } = await completed();
  run.changes.push({ ...run.changes[0], id: 'bad', before: 'wrong' });
  const plan = await prepareAgentApplication(state, run, ['change-1']);
  assert.equal(plan.changes.length, 1);
  await assert.rejects(prepareAgentApplication(state, run, ['change-1', 'bad']));
});
test('API uses authentication, validates schema, and does not leak upstream internals', async () => {
  const original = globalThis.fetch;
  const controller = new AbortController();
  try {
    globalThis.fetch = async (url, options) => {
      assert.equal(url, 'http://localhost:8788/api/agent/runs');
      assert.equal((options?.headers as Record<string, string>).Authorization, 'Bearer test-token');
      assert.equal(options?.signal, controller.signal);
      return new Response(JSON.stringify({ error: { message: 'secret-stack' }, requestId: 'trace-1' }), { status: 401 });
    };
    await assert.rejects(agentRequest('http://localhost:8788/', '/runs', 'test-token', controller.signal, {}), (e: unknown) => e instanceof AgentApiError && e.status === 401 && e.requestId === 'trace-1' && !e.message.includes('secret-stack'));
    globalThis.fetch = async () => new Response('{}');
    await assert.rejects(agentRequest('', '/runs/id', 'token', controller.signal), /协议/);
    globalThis.fetch = async () => new Response(JSON.stringify(agentExamples.completed));
    const result = await agentRequest('', '/runs/id', 'token', controller.signal);
    assert.equal(result.status, 'completed');
  } finally { globalThis.fetch = original; }
});
