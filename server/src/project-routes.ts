import { Hono } from 'hono';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { sha256, type RunView } from '../../shared/agent.js';
import { PROTOCOL_VERSION } from '../../shared/agent.schema.js';
import { entryDetailsSchema, entryInputSchema, type CareerEntry } from '../../shared/careerEntries.js';
import { parseCareerFact } from '../../shared/career.js';
import { projectAnswersSchema, projectDraftEditSchema, projectDescription, hasProjectContribution, type ProjectMaterial, type ProjectSession, type ProjectRunContext } from '../../shared/project.js';
import { parseProjectZip, readProjectRepository, repositorySpec } from './project-materials.js';
import { projectChunks, validateProjectDraft, groundProjectEvidence } from './project-engine.js';
import { AgentError } from './errors.js';
import type { AppDependencies } from './app.js';
import type { RunRecord } from './store.js';

const key = z.string().min(8).max(128).regex(/^[\w.:-]+$/), id = z.string().uuid();
const operation = z.object({ expectedRevision: z.number().int().positive(), idempotencyKey: key }).strict();
export function projectRoutes(deps: AppDependencies) {
  const app = new Hono<{ Variables: { userId: string } }>();
  const rpc = <T>(name: string, args: Record<string, unknown>) => deps.store!.rpc<T>(name, args);
  const get = <T>(owner: string, kind: string, value: string) => rpc<T>('career_project_get', { p_owner: owner, p_kind: kind, p_id: id.parse(value) });
  const put = async <T>(owner: string, kind: string, value: { id: string }, expected: number, opKey: string, input: unknown) => rpc<T>('career_project_put', { p_owner: owner, p_kind: kind, p_id: value.id, p_payload: value, p_expected: expected, p_key: opKey, p_hash: await sha256({ kind, id: value.id, input }) });
  const activeReaders = new Set<string>(), reads = new Map<string, number[]>();
  app.get('/operations/:key', async c => c.json(await rpc('career_project_operation_get', { p_owner: c.get('userId'), p_key: key.parse(c.req.param('key')) })));
  async function material(owner: string, opKey: string, hash: string, read: () => Promise<ProjectMaterial>) {
    const replay = await rpc<ProjectMaterial | null>('career_project_replay', { p_owner: owner, p_key: opKey, p_hash: hash });
    if (replay) return replay;
    if (activeReaders.has(owner)) throw new AgentError('RUN_LIMIT', '正在读取项目，请等待当前读取完成', 429, true);
    const times = (reads.get(owner) || []).filter(t => Date.now() - t < 600000);
    if (times.length >= 10) throw new AgentError('RUN_LIMIT', '读取次数过多，请稍后重试', 429, true);
    if (await rpc<number>('career_project_material_count', { p_owner: owner }) >= 20) throw new AgentError('RUN_LIMIT', '最多保留 20 份项目材料，请先清理不用的材料', 429);
    reads.set(owner, [...times, Date.now()]); activeReaders.add(owner);
    try { const value = await read(); return await rpc<ProjectMaterial>('career_project_put', { p_owner: owner, p_kind: 'material', p_id: value.id, p_payload: value, p_expected: 0, p_key: opKey, p_hash: hash }); }
    finally { activeReaders.delete(owner); }
  }
  app.post('/materials/upload', async c => {
    const opKey = key.parse(c.req.header('Idempotency-Key'));
    const bytes = new Uint8Array(await c.req.arrayBuffer()), name = String(c.req.query('name') || '项目.zip');
    const hash = await sha256({ kind: 'zip', name, digest: createHash('sha256').update(bytes).digest('hex') });
    return c.json(await material(c.get('userId'), opKey, hash, async () => parseProjectZip(bytes, name)), 201);
  });
  app.post('/materials/repository', async c => {
    const input = z.object({ url: z.string().max(2000), idempotencyKey: key }).strict().parse(await c.req.json());
    const hash = await sha256({ kind: 'repository', url: repositorySpec(input.url).url });
    return c.json(await material(c.get('userId'), input.idempotencyKey, hash, () => readProjectRepository(input.url)), 201);
  });
  app.get('/materials/unattached', async c => c.json(await rpc('career_project_unattached_materials', { p_owner: c.get('userId') })));
  app.get('/materials/:id', async c => c.json(await get<ProjectMaterial>(c.get('userId'), 'material', c.req.param('id'))));
  app.post('/materials/:id/delete', async c => {
    const input = operation.parse(await c.req.json());
    return c.json(await rpc('career_project_delete_material', { p_owner: c.get('userId'), p_material: id.parse(c.req.param('id')), p_key: input.idempotencyKey, p_hash: await sha256({ id: c.req.param('id'), ...input }) }));
  });
  app.get('/sessions', async c => c.json(await rpc('career_project_list', { p_owner: c.get('userId'), p_kind: 'session' })));
  app.post('/sessions', async c => {
    const input = z.object({ materialId: id, sessionId: id, idempotencyKey: key }).strict().parse(await c.req.json());
    const m = await get<ProjectMaterial>(c.get('userId'), 'material', input.materialId);
    if (m.deleted) throw new AgentError('SOURCE_CHANGED', '材料已删除，请重新导入', 409);
    const session: ProjectSession = { id: input.sessionId, revision: 0, title: m.name, materialId: m.id, selectedPaths: m.files.filter(f => f.selected).map(f => f.path), step: 1, status: 'idle', evidence: [], answers: { role: '', actions: '', outcomes: '' }, understandingCorrection: '', entryId: crypto.randomUUID(), createdAt: Date.now(), updatedAt: Date.now() };
    return c.json(await put<ProjectSession>(c.get('userId'), 'session', session, 0, input.idempotencyKey, input), 201);
  });
  app.get('/sessions/:id', async c => c.json(await get<ProjectSession>(c.get('userId'), 'session', c.req.param('id'))));
  app.post('/sessions/:id/copy', async c => {
    const input = operation.extend({ sessionId: id, selectedPaths: z.array(z.string().max(500)).max(10000).optional(), answers: projectAnswersSchema.optional(), understandingCorrection: z.string().max(4000).optional(), draft: projectDraftEditSchema.optional(), step: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional() }).strict().parse(await c.req.json());
    const original = await get<ProjectSession>(c.get('userId'), 'session', c.req.param('id'));
    const copy: ProjectSession = { ...original, id: input.sessionId, revision: 0, title: `${original.title.slice(0, 110)} · 副本`, entryId: crypto.randomUUID(), status: 'idle', savedEntryRevision: undefined, proposal: undefined, runId: undefined, error: undefined, answers: input.answers || original.answers, understandingCorrection: input.understandingCorrection ?? original.understandingCorrection, draft: input.draft || original.draft, selectedPaths: input.selectedPaths || original.selectedPaths, createdAt: Date.now(), updatedAt: Date.now() };
    if (input.expectedRevision !== original.revision || JSON.stringify(copy.selectedPaths) !== JSON.stringify(original.selectedPaths)) copy.analysisStale = true;
    return c.json(await put<ProjectSession>(c.get('userId'), 'session', copy, 0, input.idempotencyKey, { original: original.id, input }), 201);
  });
  app.patch('/sessions/:id', async c => {
    const input = operation.extend({ selectedPaths: z.array(z.string().max(500)).max(10000).optional(), answers: projectAnswersSchema.optional(), understandingCorrection: z.string().max(4000).optional(), draft: projectDraftEditSchema.optional(), step: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(), proposal: z.enum(['accept', 'reject', 'undo']).optional() }).strict().parse(await c.req.json());
    const s = await get<ProjectSession>(c.get('userId'), 'session', c.req.param('id'));
    if (input.selectedPaths) {
      const m = await get<ProjectMaterial>(c.get('userId'), 'material', s.materialId);
      if (new Set(input.selectedPaths).size !== input.selectedPaths.length || input.selectedPaths.some(path => !m.files.some(f => f.path === path))) throw new AgentError('INVALID_INPUT', '选材包含不存在或重复的文件', 400);
      if (JSON.stringify(input.selectedPaths) !== JSON.stringify(s.selectedPaths) && s.understanding) s.analysisStale = true;
      s.selectedPaths = input.selectedPaths;
    }
    if (input.answers) s.answers = input.answers;
    if (input.understandingCorrection !== undefined) s.understandingCorrection = input.understandingCorrection;
    if (input.draft) { s.previousDraft = s.draft; s.draft = input.draft; delete s.proposal; }
    if (input.step) { if (input.step >= 2 && !s.understanding || input.step === 3 && !s.draft) throw new AgentError('STATE_CONFLICT', '请先完成前一步', 409); s.step = input.step; }
    if (input.proposal === 'accept' && s.proposal) { s.previousDraft = s.draft; s.draft = s.proposal; delete s.proposal; }
    if (input.proposal === 'reject') delete s.proposal;
    if (input.proposal === 'undo' && s.previousDraft) { const current = s.draft; s.draft = s.previousDraft; s.previousDraft = current; delete s.proposal; }
    return c.json(await put<ProjectSession>(c.get('userId'), 'session', s, input.expectedRevision, input.idempotencyKey, input));
  });
  app.post('/sessions/:id/cancel', async c => {
    const input = operation.parse(await c.req.json());
    return c.json(await rpc('career_project_cancel', { p_owner: c.get('userId'), p_session: id.parse(c.req.param('id')), p_expected: input.expectedRevision, p_key: input.idempotencyKey, p_hash: await sha256({ session: c.req.param('id'), action: 'cancel', ...input }) }));
  });
  app.post('/sessions/:id/confirm', async c => {
    const input = operation.parse(await c.req.json()), owner = c.get('userId'), s = await get<ProjectSession>(owner, 'session', c.req.param('id'));
    if (!s.draft || !hasProjectContribution(s.answers)) throw new AgentError('INVALID_INPUT', '请先补充你本人的角色与具体行动，或继续保留为草稿', 400);
    if (!s.draft.projectName.trim() || !s.draft.bullets.length || s.draft.bullets.some(b => !b.trim())) throw new AgentError('INVALID_INPUT', '请填写项目名称和至少一条完整贡献；空贡献可以删除', 400);
    if (projectDescription(s.draft).length > 4000) throw new AgentError('INVALID_INPUT', '项目简述与贡献合计超过 4000 字，请精简后再保存经历', 400);
    if (s.analysisStale) throw new AgentError('SOURCE_CHANGED', '选材已变化，请重新分析并核对', 409);
    validateProjectDraft(s.draft, s);
    const m = await get<ProjectMaterial>(owner, 'material', s.materialId);
    const entry = entryInputSchema.parse({ id: s.entryId, title: s.draft.projectName, kind: 'project', rawText: `个人角色：${s.answers.role}\n个人行动：${s.answers.actions}\n成果：${s.answers.outcomes}\n理解纠正：${s.understandingCorrection}`, details: entryDetailsSchema.parse({ role: s.draft.role, action: s.answers.actions, outcome: s.answers.outcomes, url: m.url }), status: 'confirmed', doNotClaim: '项目材料只证明项目实现；个人职责和实际成果以用户确认记录为准。', relatedEntryId: null, groupId: s.id, migrationKey: `project:${s.id}`, projectEvidence: s.evidence.map(e => ({ materialId: e.materialId, evidenceId: e.id, path: e.path, startLine: e.startLine, endLine: e.endLine })), facts: [parseCareerFact({ id: 'project', section: 'projects', sourceTitle: s.title, doNotClaim: '', data: { id: 'project', projectName: s.draft.projectName, role: s.draft.role, startDate: '', endDate: '', isCurrent: false, description: projectDescription(s.draft), techStack: s.draft.techStack, url: m.url } })] });
    return c.json(await rpc('career_project_confirm', { p_owner: owner, p_session: s.id, p_expected: input.expectedRevision, p_entry: entry, p_key: input.idempotencyKey, p_hash: await sha256({ session: s.id, ...input, action: 'confirm' }) }));
  });
  app.post('/sessions/:id/:action', async c => {
    if (!deps.modelReady) throw new AgentError('CONFIG_MISSING', '尚未配置模型服务，项目材料已保留，可配置后继续', 503);
    const action = z.enum(['analyze', 'draft', 'rewrite']).parse(c.req.param('action'));
    const input = operation.extend({ instruction: z.string().trim().min(1).max(2000).optional(), field: z.string().regex(/^(summary|role|projectName|bullet:[0-4])$/).optional() }).strict().parse(await c.req.json());
    const owner = c.get('userId'), s = await get<ProjectSession>(owner, 'session', c.req.param('id'));
    const m = await get<ProjectMaterial>(owner, 'material', s.materialId); if (m.deleted) throw new AgentError('SOURCE_CHANGED', '原始材料已删除，请重新导入', 409);
    const { chunks } = projectChunks(m, s.selectedPaths);
    if (action !== 'analyze' && !s.understanding) throw new AgentError('STATE_CONFLICT', '请先分析项目', 409);
    if (action !== 'analyze' && s.analysisStale) throw new AgentError('SOURCE_CHANGED', '选材已变化，请重新分析项目', 409);
    if (action === 'rewrite' && (!s.draft || !input.instruction || !input.field)) throw new AgentError('INVALID_INPUT', '请选择段落并填写修改要求', 400);
    const inputSignature = await sha256({ materialId: m.id, commit: m.commit, selectedPaths: s.selectedPaths, answers: s.answers });
    const context: ProjectRunContext = { sessionId: s.id, sessionRevision: s.revision, action, partials: [], inputSignature, instruction: input.instruction, field: input.field };
    if (action === 'analyze' && s.runId && ['failed', 'idle'].includes(s.status)) {
      const previous = await rpc<RunRecord>('agent_get_run', { p_owner: owner, p_run: s.runId });
      const old = previous.project_context;
      if (previous.kind === 'project_analysis' && previous.status === 'failed' && old?.action === 'analyze' && old.inputSignature === inputSignature && old.partials.length <= chunks.length) {
        try {
          context.partials = old.partials.map((part, index) => ({ ...part, findings: part.findings.map(f => groundProjectEvidence(f, chunks[index])) }));
        } catch { context.partials = []; }
      }
    }
    const hash = await sha256({ session: s.id, ...input, action });
    const view: RunView = { protocolVersion: PROTOCOL_VERSION, runId: crypto.randomUUID(), status: 'queued', resumeRevision: hash, steps: [], requirements: [], evidence: [], questions: [], changes: [], usage: { calls: 0, inputTokens: null, outputTokens: null, elapsedMs: 0, waitingMs: 0, estimatedCost: null, currency: deps.config.MODEL_CURRENCY } };
    return c.json(await rpc('career_project_enqueue', { p_owner: owner, p_session: s.id, p_expected: input.expectedRevision, p_key: input.idempotencyKey, p_hash: hash, p_context: context, p_view: view, p_max_pending: deps.config.MAX_PENDING_RUNS_PER_USER }), 202);
  });
  return app;
}
