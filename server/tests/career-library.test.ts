import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { database, fixtureApp, ownerA, ownerB, claim, getRun, testConfig } from './helpers.js';
import { entryDetailsSchema, entryFacts, type CareerEntry } from '../../shared/careerEntries.js';
import { executeRun } from '../src/engine.js';
import { openAIProvider } from '../src/provider.js';
import { verifyCareerResult } from '../../shared/careerComposer.js';
import type { Store } from '../src/store.js';
import type { ModelProvider } from '../src/provider.js';
const entryId = '10000000-0000-4000-8000-000000000001';
const input = () => ({ id: entryId, title: '课程平台', kind: 'competition', rawText: '使用 TypeScript 实现课程平台查询接口，提交演示项目', details: entryDetailsSchema.parse({}),
  status: 'confirmed', doNotClaim: '仅负责查询接口，未主导整个项目', groupId: 'competition-one', migrationKey: null, relatedEntryId: null,
  facts: [{ id: 'primary', section: 'projects', sourceTitle: '课程平台', doNotClaim: '', data: { id: 'primary', projectName: '课程平台', role: '竞赛 · 成员', startDate: '2026-01', endDate: '', isCurrent: false, description: '使用 TypeScript 实现课程平台查询接口，提交演示项目', techStack: ['TypeScript'], url: '' } }] });
async function setup(directory?: string) {
  const ctx = await database(directory);
  for (const file of ['202610240002_legacy_web.sql', '202610260001_career_library.sql']) await ctx.db.exec(await readFile(new URL(`../../supabase/migrations/${file}`, import.meta.url), 'utf8'));
  return { ...ctx, app: fixtureApp(ctx.store) };
}
const headers = (owner = 'owner-a') => ({ Authorization: `Bearer ${owner}`, 'Content-Type': 'application/json' });
async function save(store: Store) { return store.rpc<CareerEntry>('career_save_entry', { p_owner: ownerA, p_entry: input(), p_revision: 0, p_confirm: true }); }
const requestRun = (entry: CareerEntry, idempotencyKey = 'career-create-001') => ({ idempotencyKey, target: { mode: 'jd', text: '负责 TypeScript 查询接口开发' }, entries: [{ id: entry.id, revision: entry.revision }], selection: { selectedIds: [], lockedIds: [], excludedIds: [] } });

test('career entries enforce ownership, revisions, explicit confirmation and immutable history', async () => {
  const { app, db, store } = await setup();
  try {
    assert.equal((await app.request('/api/career/entries')).status, 401);
    let response = await app.request('/api/career/entries', { method: 'POST', headers: headers(), body: JSON.stringify({ entry: input(), expectedRevision: 0, confirm: true }) });
    assert.equal(response.status, 201); const entry = await response.json() as CareerEntry; assert.equal(entry.revision, 1);
    assert.deepEqual(await (await app.request('/api/career/entries', { headers: headers('owner-b') })).json(), []);
    response = await app.request(`/api/career/entries/${entry.id}`, { method: 'PATCH', headers: headers('owner-b'), body: JSON.stringify({ entry: input(), expectedRevision: 1, confirm: true }) });
    assert.equal(response.status, 404);
    const changed = await store.rpc<CareerEntry>('career_save_entry', { p_owner: ownerA, p_entry: { ...input(), rawText: '修正后的事实' }, p_revision: 1, p_confirm: false });
    assert.equal(changed.status, 'draft'); assert.equal(changed.revision, 2);
    const replay = await store.rpc<CareerEntry>('career_save_entry', { p_owner: ownerA, p_entry: { ...input(), rawText: '修正后的事实' }, p_revision: 1, p_confirm: false });
    assert.equal(replay.revision, 2);
    await assert.rejects(store.rpc('career_save_entry', { p_owner: ownerA, p_entry: input(), p_revision: 1, p_confirm: true }), /其他设备/);
    assert.equal((await db.query<{ n: number }>('select count(*)::int n from career_entry_revisions')).rows[0].n, 2);
    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${ownerB}',false)`);
    assert.equal((await db.query('select * from career_entry_revisions')).rows.length, 0);
    await assert.rejects(db.query('update career_entries set revision=3'), /permission denied/);
    await db.exec('reset role');
    const revisions = await app.request(`/api/career/entries/${entryId}/revisions`, { headers: headers() });
    assert.equal((await revisions.json() as unknown[]).length, 2);
    assert.equal((await app.request(`/api/career/entries/${entryId}/revisions`, { headers: headers('owner-b') })).status, 404);
  } finally { await db.close(); }
});

test('career selection and immutable snapshots survive a database restart and a reclaimed writing lease', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'resulab-career-'));
  let ctx = await setup(directory);
  try {
    const entry = await save(ctx.store), body = requestRun(entry), facts = entryFacts([entry]);
    const response = await ctx.app.request('/api/career/runs', { method: 'POST', headers: headers(), body: JSON.stringify(body) });
    const { runId } = await response.json() as { runId: string };
    const lease = (await claim(ctx.store))!;
    const context = { ...lease.career_context!, phase: 'selection', plan: { roleTitle: '后端开发', requirements: [{ id: 'r', text: '查询接口', jdQuote: '查询接口', required: true, coverage: 'missing', gap: '等待人工选材' }], selected: [] } };
    await ctx.store.rpc('career_checkpoint', { p_run: runId, p_token: lease.lease_token, p_view: lease.run_view, p_stage: 1, p_status: 'awaiting_input', p_context: context });
    await ctx.db.close();
    const reopened = await database(directory, false); ctx = { ...reopened, app: fixtureApp(reopened.store) };
    const restored = await getRun(ctx.store, runId); assert.equal(restored.status, 'awaiting_input'); assert.equal(restored.career_context!.entries[0].revision, 1);
    assert.equal(await claim(ctx.store), null);
    const selected = { selectedIds: [facts[0].id], lockedIds: [facts[0].id], excludedIds: [] };
    const confirmed = await ctx.app.request(`/api/career/runs/${runId}/selection`, { method: 'POST', headers: headers(), body: JSON.stringify({ idempotencyKey: 'career-resume-select', selection: selected, useOriginal: true }) });
    assert.equal(confirmed.status, 202);
    const abandoned = (await claim(ctx.store))!;
    await ctx.db.query("update agent_runs set lease_expires_at=now()-interval '1 second' where id=$1", [runId]);
    const reclaimed = (await claim(ctx.store))!; assert.notEqual(reclaimed.lease_token, abandoned.lease_token);
    const noModel: ModelProvider = { generate: async () => { throw new Error('原文写作不得调用模型'); } };
    await executeRun(reclaimed, ctx.store, noModel, testConfig(), new AbortController().signal);
    const finished = await getRun(ctx.store, runId); assert.equal(finished.status, 'completed'); assert.equal(finished.career_context!.result!.snapshot.projects.length, 1);
    await verifyCareerResult(finished.career_context!.result, { jdText: body.target.text, facts }, true);
    await assert.rejects(ctx.store.rpc('career_checkpoint', { p_run: runId, p_token: abandoned.lease_token, p_view: abandoned.run_view, p_stage: 2, p_status: 'completed', p_context: abandoned.career_context }), /执行权/);
  } finally { await ctx.db.close(); await rm(directory, { recursive: true, force: true }); }
});

test('career tasks pause before writing, preserve locks, validate review and share durable budget', async () => {
  const { app, db, store } = await setup();
  try {
    const entry = await save(store), facts = entryFacts([entry]), body = requestRun(entry); body.selection.lockedIds = [facts[0].id] as never[]; body.selection.selectedIds = [facts[0].id] as never[];
    let response = await app.request('/api/career/runs', { method: 'POST', headers: headers(), body: JSON.stringify(body) });
    assert.equal(response.status, 202); const { runId } = await response.json() as { runId: string };
    const duplicate = await app.request('/api/career/runs', { method: 'POST', headers: headers(), body: JSON.stringify(body) }); assert.equal((await duplicate.json() as { runId: string }).runId, runId);
    let calls = 0;
    const provider = openAIProvider(testConfig(), store, (async (_url, init) => {
      calls++; const payload = JSON.parse(init!.body as string), data = JSON.parse(payload.messages[1].content);
      assert.equal(JSON.stringify(data).includes('personalInfo'), false);
      const value = calls === 1 ? { roleTitle: '后端开发', requirements: [{ id: 'req-1', text: '接口开发', jdQuote: 'TypeScript 查询接口开发', required: true, coverage: 'supported', gap: '' }], selected: [{ factId: facts[0].id, requirementIds: ['req-1'], reason: '有真实的查询接口开发贡献' }] }
        : { edits: [{ factId: facts[0].id, field: 'description', after: '使用 TypeScript 实现课程平台的查询接口，并以可演示项目交付竞赛成果', reason: '前置实现内容与交付物', sourceIds: [data.sourceCatalog.find((s: { field: string }) => s.field === 'description').id] }], summary: { text: '', sourceIds: [] } };
      return Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(value) } }], usage: { prompt_tokens: 100, completion_tokens: 100 } });
    }) as typeof fetch, () => {});
    await executeRun((await claim(store))!, store, provider, testConfig(), new AbortController().signal);
    let run = await getRun(store, runId); assert.equal(run.status, 'awaiting_input'); assert.equal(calls, 1); assert.equal(await claim(store), null);
    assert.equal((await app.request(`/api/agent/runs/${runId}`, { headers: headers() })).status, 404);
    assert.equal((await app.request(`/api/career/runs/${runId}`, { headers: headers('owner-b') })).status, 404);
    const confirm = { idempotencyKey: 'career-select-001', selection: run.career_context!.selection, useOriginal: false };
    response = await app.request(`/api/career/runs/${runId}/selection`, { method: 'POST', headers: headers(), body: JSON.stringify(confirm) }); assert.equal(response.status, 202);
    response = await app.request(`/api/career/runs/${runId}/selection`, { method: 'POST', headers: headers(), body: JSON.stringify(confirm) }); assert.equal(response.status, 202);
    await executeRun((await claim(store))!, store, provider, testConfig(), new AbortController().signal);
    run = await getRun(store, runId); assert.equal(run.status, 'completed'); assert.equal(calls, 2);
    await verifyCareerResult(run.career_context!.result, { jdText: body.target.text, facts }, true);
    assert.equal((await store.rpc<CareerEntry[]>('career_list_entries', { p_owner: ownerA }))[0].facts[0].data.id, 'primary');
  } finally { await db.close(); }
});

test('cancel fences late workers; stale sources block writing and version saves are idempotent', async () => {
  const { app, db, store } = await setup();
  try {
    const entry = await save(store), body = requestRun(entry);
    const response = await app.request('/api/career/runs', { method: 'POST', headers: headers(), body: JSON.stringify(body) }); const { runId } = await response.json() as { runId: string };
    const leased = (await claim(store))!;
    const cancelled = await app.request(`/api/career/runs/${runId}/cancel`, { method: 'POST', headers: headers(), body: JSON.stringify({ idempotencyKey: 'career-cancel-001' }) }); assert.equal(cancelled.status, 202);
    await assert.rejects(store.rpc('career_checkpoint', { p_run: runId, p_token: leased.lease_token, p_view: leased.run_view, p_stage: 1, p_status: 'completed', p_context: leased.career_context }), /执行权/);
    assert.equal((await getRun(store, runId)).career_context!.phase, 'cancelled');
    const context = { entries: [entry], selection: { selectedIds: [entryFacts([entry])[0].id], lockedIds: [], excludedIds: [] } };
    const args = { p_owner: ownerA, p_key: 'career-version-001', p_hash: 'one', p_title: '岗位版本', p_data: {}, p_context: context };
    const first = await store.rpc('career_save_version', args); assert.deepEqual(await store.rpc('career_save_version', args), first);
    const versions = await app.request('/api/career/versions', { headers: headers() }); assert.equal((await versions.json() as unknown[]).length, 1);
    const savedId = (first as { id: string }).id;
    assert.equal((await app.request(`/api/career/versions/${savedId}`, { headers: headers('owner-b') })).status, 404);
    await assert.rejects(store.rpc('career_save_version', { ...args, p_hash: 'different' }), /幂等键/);
    await store.rpc('career_save_entry', { p_owner: ownerA, p_entry: { ...input(), status: 'archived' }, p_revision: 1, p_confirm: false });
    await assert.rejects(store.rpc('career_check_sources', { p_owner: ownerA, p_context: context }), /重新核对选材/);
    await assert.rejects(store.rpc('career_save_version', { ...args, p_key: 'career-version-002' }), /重新核对选材/);
    assert.equal((await db.query<{ n: number }>('select count(*)::int n from resumes')).rows[0].n, 1);
  } finally { await db.close(); }
});
