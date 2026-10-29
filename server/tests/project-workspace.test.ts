import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { zipSync, strToU8 } from 'fflate';
import { database, fixtureApp, ownerA, ownerB, claim, testConfig } from './helpers.js';
import { parseProjectZip, repositorySpec, readProjectRepository } from '../src/project-materials.js';
import { executeRun } from '../src/engine.js';
import { AgentError } from '../src/errors.js';
import type { ModelProvider } from '../src/provider.js';
import type { ProjectSession, ProjectMaterial } from '../../shared/project.js';
import { validateProjectDraft, projectChunks, groundProjectEvidence } from '../src/project-engine.js';

let databaseResult: Awaited<ReturnType<typeof database>>;
const archive = () => zipSync({ 'team/README.md': strToU8('# 团队项目\n使用 TypeScript 实现查询接口。\n文档计划部署，未实际上线。'), 'team/src/query.ts': strToU8('export const query = () => [];'), 'team/.env': strToU8('private=value'), 'team/node_modules/foo.js': strToU8('dependency') });
before(async () => { databaseResult = await database(); for (const file of ['../../supabase/migrations/202610240002_legacy_web.sql', '../../supabase/migrations/202610260001_career_library.sql', '../migrations/project-workspace.sql']) await databaseResult.db.exec(await readFile(new URL(file, import.meta.url), 'utf8')); });
after(async () => { await databaseResult?.db.close(); });
const request = async (path: string, body?: unknown, method = 'POST', token = 'owner-a') => fixtureApp(databaseResult.store).request('/api/career/projects' + path, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
async function create() {
  const response = await fixtureApp(databaseResult.store).request('/api/career/projects/materials/upload?name=team.zip', { method: 'POST', headers: { Authorization: 'Bearer owner-a', 'Content-Type': 'application/zip', 'Idempotency-Key': crypto.randomUUID() }, body: archive() });
  assert.equal(response.status, 201, await response.clone().text()); const material = await response.json() as ProjectMaterial;
  const body = { materialId: material.id, sessionId: crypto.randomUUID(), idempotencyKey: crypto.randomUUID() };
  const created = await request('/sessions', body); assert.equal(created.status, 201, await created.clone().text());
  const session = await created.json() as ProjectSession; return { material, session, body };
}
const provider: ModelProvider = { async generate(_run, _step, schema, instruction, data, _signal, validate) {
  const input = data as { files?: { path: string }[]; draft?: unknown };
  const value = instruction.includes('"findings"') ? { projectName: '团队项目', summary: '项目提供查询接口，部署仍是计划。', findings: [{ text: '文档说明使用 TypeScript 实现查询接口，个人贡献未知', kind: 'documentation', path: 'team/README.md', startLine: 2, endLine: 2, quote: '使用 TypeScript 实现查询接口。' }], unknowns: ['需确认本人负责范围'] } : { projectName: '团队项目', role: '成员', summary: '团队协作的查询接口项目', bullets: ['使用 TypeScript 完成查询接口实现。'], techStack: ['TypeScript'] };
  if (input.files) assert.ok(input.files.some(f => f.path.endsWith('README.md')));
  const parsed = schema.parse(value); validate?.(parsed); return parsed;
} };
async function run() { const next = await claim(databaseResult.store); assert.equal(next?.kind, 'project_analysis'); await executeRun(next!, databaseResult.store, provider, testConfig(), new AbortController().signal); }
test('ZIP screens credentials/dependencies, rejects traversal, refuses unsupported repository URLs and oversized selection', () => {
  const m = parseProjectZip(archive(), 'team.zip'); assert.equal(m.files.length, 2); assert.equal(m.excluded, 2);
  const withSecrets = parseProjectZip(zipSync({ 'README.md': strToU8('项目说明'), 'secrets.json': strToU8('{"token":"private"}'), '.npmrc': strToU8('token=private'), 'id_ed25519': strToU8('private') }), 'secrets.zip');
  assert.deepEqual(withSecrets.files.map(file => file.path), ['README.md']); assert.equal(withSecrets.excluded, 3);
  assert.throws(() => parseProjectZip(zipSync({ '../escape.ts': strToU8('bad') }), 'bad.zip'), /不安全/);
  assert.throws(() => repositorySpec('http://127.0.0.1/private'), /仅支持/);
  assert.throws(() => repositorySpec('https://github.com/owner/repo/tree/main'), /根链接/);
  assert.throws(() => projectChunks({ ...m, files: [{ path: 'huge.ts', text: 'x'.repeat(72001), chars: 72001, selected: true }] }, ['huge.ts']), /72,000/);
  const many = Array.from({ length: 201 }, (_, i) => ({ path: `src/${i}.ts`, text: 'a', chars: 1, selected: true }));
  assert.throws(() => projectChunks({ ...m, files: many }, many.map(f => f.path)), /200 个文件/);
});
test('project import, owner isolation, idempotency, evidence, contribution, draft, confirmation and material deletion', async () => {
  const { material, session, body } = await create();
  assert.deepEqual(await (await request('/sessions', body)).json(), session);
  assert.equal((await request(`/sessions/${session.id}`, undefined, 'GET', 'owner-b')).status, 404);
  assert.deepEqual(await (await request('/sessions', undefined, 'GET', 'owner-b')).json(), []);
  assert.equal((await request(`/sessions/${session.id}/analyze`, { expectedRevision: session.revision, idempotencyKey: crypto.randomUUID() })).status, 202);
  await run(); let s = await (await request(`/sessions/${session.id}`, undefined, 'GET')).json() as ProjectSession;
  assert.equal(s.step, 2); assert.equal(s.evidence[0].quote, '使用 TypeScript 实现查询接口。'); assert.ok(s.understanding?.unknowns.length);
  assert.equal((await request(`/sessions/${s.id}/confirm`, { expectedRevision: s.revision, idempotencyKey: crypto.randomUUID() })).status, 400);
  s = await (await request(`/sessions/${s.id}`, { expectedRevision: s.revision, idempotencyKey: crypto.randomUUID(), answers: { role: '团队成员', actions: '我使用 TypeScript 完成查询接口', outcomes: '' } }, 'PATCH')).json() as ProjectSession;
  const stale = await request(`/sessions/${s.id}`, { expectedRevision: s.revision - 1, idempotencyKey: crypto.randomUUID(), understandingCorrection: 'stale' }, 'PATCH'); assert.equal(stale.status, 409);
  await request(`/sessions/${s.id}/draft`, { expectedRevision: s.revision, idempotencyKey: crypto.randomUUID() }); await run();
  s = await (await request(`/sessions/${s.id}`, undefined, 'GET')).json() as ProjectSession; assert.equal(s.step, 3);
  const completeDraft = s.draft!;
  const edited = await request(`/sessions/${s.id}`, { expectedRevision: s.revision, idempotencyKey: crypto.randomUUID(), draft: { ...completeDraft, projectName: '', bullets: [''] } }, 'PATCH');
  assert.equal(edited.status, 200); s = await edited.json() as ProjectSession;
  const incomplete = await request(`/sessions/${s.id}/confirm`, { expectedRevision: s.revision, idempotencyKey: crypto.randomUUID() }); assert.equal(incomplete.status, 400);
  s = await (await request(`/sessions/${s.id}`, { expectedRevision: s.revision, idempotencyKey: crypto.randomUUID(), draft: completeDraft }, 'PATCH')).json() as ProjectSession;
  const confirmation = { expectedRevision: s.revision, idempotencyKey: crypto.randomUUID() };
  const confirmed = await request(`/sessions/${s.id}/confirm`, confirmation); assert.equal(confirmed.status, 200, await confirmed.clone().text());
  const result = await confirmed.json() as { session: ProjectSession; entry: CareerEntryLike }; assert.equal(result.entry.status, 'confirmed'); assert.equal(result.entry.projectEvidence.length, 1);
  const duplicate = await request(`/sessions/${s.id}/confirm`, confirmation); assert.equal(duplicate.status, 200, await duplicate.clone().text());
  const deleted = await request(`/materials/${material.id}/delete`, { expectedRevision: 1, idempotencyKey: crypto.randomUUID() }); assert.equal(deleted.status, 200, await deleted.clone().text());
  s = await (await request(`/sessions/${s.id}`, undefined, 'GET')).json() as ProjectSession; assert.equal(s.materialDeleted, true); assert.equal(s.evidence.length, 0); assert.ok(s.draft);
  const m = await (await request(`/materials/${material.id}`, undefined, 'GET')).json() as ProjectMaterial; assert.equal(m.files.length, 0);
});
interface CareerEntryLike { status: string; projectEvidence: unknown[] }
test('cancel revokes leases so an already claimed executor cannot write a late result', async () => {
  const { session } = await create(); await request(`/sessions/${session.id}/analyze`, { expectedRevision: session.revision, idempotencyKey: crypto.randomUUID() });
  const next = await claim(databaseResult.store); assert.ok(next);
  const cancelled = await request(`/sessions/${session.id}/cancel`, { expectedRevision: session.revision, idempotencyKey: crypto.randomUUID() }); assert.equal(cancelled.status, 200);
  await executeRun(next!, databaseResult.store, provider, testConfig(), new AbortController().signal);
  const s = await (await request(`/sessions/${session.id}`, undefined, 'GET')).json() as ProjectSession; assert.equal(s.status, 'idle'); assert.equal(s.understanding, undefined);
});
test('reusing an operation key for a different project session is rejected', async () => {
  const first = await create(), second = await create(), opKey = crypto.randomUUID();
  const body = { expectedRevision: 1, idempotencyKey: opKey, understandingCorrection: '人工修正' };
  assert.equal((await request(`/sessions/${first.session.id}`, body, 'PATCH')).status, 200);
  assert.equal((await request(`/sessions/${second.session.id}`, body, 'PATCH')).status, 409);
});
test('numeric results and personal leadership need user confirmation, not README claims', () => {
  const s = { answers: { role: '成员', actions: '开发接口', outcomes: '' }, evidence: [{ quote: '项目使用 TypeScript，支持1000人' }] } as ProjectSession;
  assert.throws(() => validateProjectDraft({ projectName: '项目', role: '成员', summary: '', bullets: ['主导项目服务1000人'], techStack: [] }, s), /未确认/);
});
test('project evidence derives exact lines from a unique quote, preserves blank lines, and rejects forged or ambiguous quotes', () => {
  const text = '\n\n第一行\n第二行包含证据\n\n最后一行';
  const material = { id: crypto.randomUUID(), name: 'test', source: 'zip' as const, url: '', commit: '', files: [{ path: 'README.md', text, chars: text.length, selected: true }], excluded: 0, createdAt: 0 };
  const parts = projectChunks(material, ['README.md']).chunks[0];
  assert.equal(parts[0].text, text);
  const finding = { text: '说明', kind: 'documentation' as const, path: 'README.md', startLine: 1, endLine: 1, quote: '第二行包含证据' };
  const grounded = groundProjectEvidence(finding, parts); assert.equal(grounded.startLine, 4); assert.equal(grounded.endLine, 4);
  assert.throws(() => groundProjectEvidence({ ...finding, quote: '伪造内容' }, parts), /不在输入/);
  assert.throws(() => groundProjectEvidence({ ...finding, quote: '重复', startLine: 99, endLine: 99 }, [{ path: 'README.md', startLine: 1, text: '重复\n重复' }]), /不唯一/);
});
test('GitHub resolves a pinned SHA and uses the official API media type before its bounded archive redirect', async () => {
  const sha = 'a'.repeat(40), requests: string[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input); requests.push(url);
    if (url.includes('api.github.com')) assert.equal(new Headers(init?.headers).get('Accept'), 'application/vnd.github+json');
    if (url.endsWith('/owner/repo')) return Response.json({ default_branch: 'main', private: false });
    if (url.endsWith('/branches/main')) return Response.json({ commit: { sha } });
    if (url.endsWith(`/zipball/${sha}`)) return new Response(null, { status: 302, headers: { Location: `https://codeload.github.com/owner/repo/legacy.zip/${sha}` } });
    return new Response(archive());
  };
  const m = await readProjectRepository('https://github.com/owner/repo', fetcher); assert.equal(m.commit, sha); assert.equal(m.source, 'github'); assert.equal(requests.length, 4);
  await assert.rejects(readProjectRepository('https://github.com/owner/repo', async () => new Response(null, { status: 401 })), /匿名下载/);
});
test('material upload retries are idempotent and reject a different archive under the same key', async () => {
  const key = crypto.randomUUID();
  const upload = (bytes: Uint8Array) => fixtureApp(databaseResult.store).request('/api/career/projects/materials/upload?name=team.zip', { method: 'POST', headers: { Authorization: 'Bearer owner-a', 'Content-Type': 'application/zip', 'Idempotency-Key': key }, body: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer });
  const first = await upload(archive()); assert.equal(first.status, 201); const original = await first.json() as ProjectMaterial;
  const unattached = await (await request('/materials/unattached', undefined, 'GET')).json() as { id: string }[]; assert.ok(unattached.some(item => item.id === original.id));
  const other = await (await request('/materials/unattached', undefined, 'GET', 'owner-b')).json() as { id: string }[]; assert.ok(!other.some(item => item.id === original.id));
  const retry = await upload(archive()); assert.equal(retry.status, 201); assert.equal((await retry.json() as ProjectMaterial).id, original.id);
  const conflict = await upload(zipSync({ 'different.md': strToU8('不同材料') })); assert.equal(conflict.status, 409);
});
test('retry of a failed analysis resumes verified completed chunks without paying for them again', async () => {
  const zip = zipSync({ 'README.md': strToU8('README evidence\n' + 'a'.repeat(15000)), 'src/app.ts': strToU8('source evidence\n' + 'b'.repeat(15000)) });
  const upload = await fixtureApp(databaseResult.store).request('/api/career/projects/materials/upload?name=chunks.zip', { method: 'POST', headers: { Authorization: 'Bearer owner-a', 'Content-Type': 'application/zip', 'Idempotency-Key': crypto.randomUUID() }, body: zip });
  assert.equal(upload.status, 201); const material = await upload.json() as ProjectMaterial;
  const created = await request('/sessions', { materialId: material.id, sessionId: crypto.randomUUID(), idempotencyKey: crypto.randomUUID() });
  let session = await created.json() as ProjectSession;
  await request(`/sessions/${session.id}/analyze`, { expectedRevision: session.revision, idempotencyKey: crypto.randomUUID() });
  const first = await claim(databaseResult.store); let calls = 0;
  const failing: ModelProvider = { async generate(_run, _step, schema, _instruction, data, _signal, validate) {
    calls++; if (calls === 2) throw new AgentError('MODEL_UPSTREAM_ERROR', '合成故障', 502, true);
    const part = (data as { files: { path: string; startLine: number; text: string }[] }).files[0];
    const quote = part.text.split('\n')[0], result = schema.parse({ projectName: '分块项目', summary: '项目说明', findings: [{ text: '材料说明', kind: 'documentation', path: part.path, startLine: 1, endLine: 1, quote }], unknowns: [] }); validate?.(result); return result;
  } };
  await executeRun(first!, databaseResult.store, failing, testConfig(), new AbortController().signal);
  session = await (await request(`/sessions/${session.id}`, undefined, 'GET')).json() as ProjectSession; assert.equal(session.status, 'failed');
  const restarted = await request(`/sessions/${session.id}/analyze`, { expectedRevision: session.revision, idempotencyKey: crypto.randomUUID() }); assert.equal(restarted.status, 202);
  const resumed = await claim(databaseResult.store); assert.equal(resumed?.project_context?.partials.length, 1); calls = 0;
  const continuing: ModelProvider = { async generate(_run, _step, schema, _instruction, data, _signal, validate) {
    calls++; const part = (data as { files: { path: string; startLine: number; text: string }[] }).files[0];
    const result = schema.parse({ projectName: '分块项目', summary: '项目说明', findings: [{ text: '代码说明', kind: 'implementation', path: part.path, startLine: 1, endLine: 1, quote: part.text.split('\n')[0] }], unknowns: [] }); validate?.(result); return result;
  } };
  await executeRun(resumed!, databaseResult.store, continuing, testConfig(), new AbortController().signal);
  session = await (await request(`/sessions/${session.id}`, undefined, 'GET')).json() as ProjectSession; assert.equal(session.status, 'completed'); assert.equal(session.evidence.length, 2); assert.equal(calls, 1);
});
