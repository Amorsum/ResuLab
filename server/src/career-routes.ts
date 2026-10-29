import { Hono } from 'hono';
import { z } from 'zod';
import { entryInputSchema, entryFacts, selectionSchema, selectionFacts, selectedCareerPlan, type CareerEntry, type CareerRunContext } from '../../shared/careerEntries.js';
import { CAREER_SECTIONS, parseCareerInput, parseCareerFact } from '../../shared/career.js';
import { jobTarget } from '../../shared/targetJob.js';
import { sha256, type RunView } from '../../shared/agent.js';
import { PROTOCOL_VERSION } from '../../shared/agent.schema.js';
import { AgentError } from './errors.js';
import { publicView, type RunRecord } from './store.js';
import type { AppDependencies } from './app.js';
import { projectRoutes } from './project-routes.js';

const keySchema = z.string().min(8).max(128).regex(/^[A-Za-z0-9._:-]+$/);
const refsSchema = z.array(z.object({ id: z.string().uuid(), revision: z.number().int().positive() }).strict()).min(1).max(160);
const targetSchema = z.object({ mode: z.enum(['role', 'jd']), text: z.string().trim().min(1).max(12000) }).strict();
const saveSchema = z.object({ entry: entryInputSchema, expectedRevision: z.number().int().nonnegative(), confirm: z.boolean().default(false) }).strict();
const stripEntry = (entry: CareerEntry) => { const { ownerId: _o, revision: _r, createdAt: _c, updatedAt: _u, ...input } = entry; return input; };

export function careerRoutes(deps: AppDependencies) {
  const app = new Hono<{ Variables: { userId: string } }>();
  const modelRequired = () => {
    if (!deps.modelReady) throw new AgentError('CONFIG_MISSING', deps.config.NODE_ENV === 'production'
      ? 'Agent 后端尚未配置模型服务，请联系服务维护者' : '本地 Agent 后端尚未配置模型服务，请查看页面的“模型配置说明”；无需在选材列表中选择模型', 503);
  };
  app.use('*', async (c, next) => {
    const token = /^Bearer (\S+)$/i.exec(c.req.header('Authorization') || '');
    if (!token) throw new AgentError('UNAUTHENTICATED', '请先登录', 401);
    c.set('userId', await deps.authenticate(token[1]));
    if (!deps.store) throw new AgentError('CONFIG_MISSING', '云端经历库尚未配置', 503);
    await next();
  });
  const rpc = <T>(name: string, args: Record<string, unknown>) => deps.store!.rpc<T>(name, args);
  const list = (owner: string) => rpc<CareerEntry[]>('career_list_entries', { p_owner: owner });
  const read = async (owner: string, id: string) => {
    const r = await rpc<RunRecord>('agent_get_run', { p_owner: owner, p_run: z.string().uuid().parse(id) });
    if (r.kind !== 'career_tailor') throw new AgentError('RUN_NOT_FOUND', '任务不存在', 404);
    return r;
  };
  const resolve = async (owner: string, refs: z.infer<typeof refsSchema>) => {
    const all = await list(owner);
    if (new Set(refs.map(r => r.id)).size !== refs.length) throw new AgentError('INVALID_INPUT', '经历不能重复', 400);
    return refs.map(ref => {
      const e = all.find(e => e.id === ref.id && e.revision === ref.revision && e.status === 'confirmed');
      if (!e) throw new AgentError('SOURCE_CHANGED', '经历已变化或尚未确认，请重新选择', 409);
      return e;
    });
  };
  const json = async (c: { req: { json: () => Promise<unknown> } }) => {
    try { return await c.req.json(); } catch { throw new AgentError('INVALID_JSON', '请求必须为合法 JSON', 400); }
  };
  const checkKey = (c: { req: { header: (name: string) => string | undefined } }, key: string) => {
    if (c.req.header('Idempotency-Key') && c.req.header('Idempotency-Key') !== key) throw new AgentError('INVALID_INPUT', '幂等键不一致', 400);
  };
  app.get('/entries', async c => c.json(await list(c.get('userId'))));
  app.get('/entries/:id/revisions', async c => c.json(await rpc('career_list_revisions', { p_owner: c.get('userId'), p_entry: z.string().uuid().parse(c.req.param('id')) })));
  async function save(owner: string, value: unknown, id?: string) {
    const input = saveSchema.parse(value);
    if (!input.confirm && input.entry.status === 'confirmed') input.entry.status = 'draft';
    if (id && input.entry.id !== id) throw new AgentError('INVALID_INPUT', '经历编号不一致', 400);
    return rpc<CareerEntry>('career_save_entry', { p_owner: owner, p_entry: input.entry, p_revision: input.expectedRevision, p_confirm: input.confirm });
  }
  app.post('/entries', async c => c.json(await save(c.get('userId'), await json(c)), 201));
  app.patch('/entries/:id', async c => c.json(await save(c.get('userId'), await json(c), z.string().uuid().parse(c.req.param('id')))));
  // A clarification is an editable proposal, never a confirmed fact or implicit ownership change.
  app.post('/runs/:id/supplements', async c => {
    const input = z.object({ entryId: z.string().uuid(), expectedRevision: z.number().int().positive(), text: z.string().trim().min(1).max(2000) }).strict().parse(await json(c));
    const r = await read(c.get('userId'), c.req.param('id'));
    if (r.status !== 'awaiting_input') throw new AgentError('STATE_CONFLICT', '请在选材阶段补充经历', 409);
    const e = (await list(c.get('userId'))).find(e => e.id === input.entryId && r.career_context!.entries.some(s => s.id === e.id));
    if (!e || e.revision !== input.expectedRevision) throw new AgentError('SOURCE_CHANGED', '经历已变化，请刷新', 409);
    return c.json({ entry: { ...stripEntry(e), status: 'draft', rawText: `${e.rawText}\n补充（待确认）：${input.text}`.slice(0, 20000) }, expectedRevision: e.revision });
  });
  app.get('/runs', async c => c.json(await rpc('career_list_runs', { p_owner: c.get('userId') })));
  app.post('/runs', async c => {
    modelRequired();
    const input = z.object({ target: targetSchema, entries: refsSchema, selection: selectionSchema, idempotencyKey: keySchema }).strict().parse(await json(c));
    checkKey(c, input.idempotencyKey);
    const entries = await resolve(c.get('userId'), input.entries);
    const context: CareerRunContext = { version: 2, target: input.target, entries, selection: input.selection, phase: 'recommend' };
    selectionFacts(entries, context.selection);
    parseCareerInput({ jdText: jobTarget(input.target.text, input.target.mode).text, facts: entryFacts(entries) });
    const hash = await sha256({ ...input, idempotencyKey: undefined });
    const view: RunView = { protocolVersion: PROTOCOL_VERSION, runId: crypto.randomUUID(), status: 'queued', resumeRevision: hash,
      steps: [], requirements: [], evidence: [], questions: [], changes: [], usage: { calls: 0, inputTokens: null, outputTokens: null, estimatedCost: null, currency: deps.config.MODEL_CURRENCY, elapsedMs: 0, waitingMs: 0 } };
    return c.json(await rpc('career_create_run', { p_owner: c.get('userId'), p_key: input.idempotencyKey, p_hash: hash, p_context: context, p_view: view, p_max_pending: deps.config.MAX_PENDING_RUNS_PER_USER }), 202);
  });
  app.get('/runs/:id', async c => {
    const r = await read(c.get('userId'), c.req.param('id')), view = publicView(r);
    return c.json({ runId: r.id, status: r.status, context: r.career_context, error: view.error, usage: view.usage });
  });
  app.post('/runs/:id/:action', async c => {
    const action = z.enum(['selection', 'retry', 'cancel']).parse(c.req.param('action'));
    const input = z.object({ idempotencyKey: keySchema, selection: selectionSchema.optional(), entries: refsSchema.optional(), useOriginal: z.boolean().optional() }).strict().parse(await json(c));
    checkKey(c, input.idempotencyKey);
    const r = await read(c.get('userId'), c.req.param('id')), context = structuredClone(r.career_context!);
    if (action === 'selection') {
      if (!input.selection || !context.plan) throw new AgentError('INVALID_INPUT', '请提供选材清单', 400);
      if (input.entries) context.entries = await resolve(c.get('userId'), input.entries);
      selectionFacts(context.entries, input.selection);
      if (r.career_context!.entries.some(old => !context.entries.some(e => e.id === old.id && e.revision === old.revision)))
        throw new AgentError('SOURCE_CHANGED', '来源版本已变化，请重新发起推荐并核对', 409);
      context.selection = input.selection; context.phase = 'write'; context.useOriginal = input.useOriginal ?? false;
      context.plan = selectedCareerPlan(context.plan, context.selection);
      if (!context.useOriginal) modelRequired();
    }
    return c.json(await rpc('career_mutate_run', { p_owner: c.get('userId'), p_run: r.id, p_kind: action, p_key: input.idempotencyKey, p_hash: await sha256(input), p_expected: r.career_context, p_context: context }), 202);
  });
  app.post('/validate-sources', async c => {
    const refs = refsSchema.parse(await json(c)); await resolve(c.get('userId'), refs); return c.json({ valid: true });
  });
  app.post('/versions', async c => {
    const input = z.object({ idempotencyKey: keySchema, title: z.string().trim().min(1).max(120), entries: refsSchema,
      selectedIds: z.array(z.string().max(160)).max(160), resume: z.record(z.unknown()) }).strict().parse(await json(c));
    checkKey(c, input.idempotencyKey);
    const entries = await resolve(c.get('userId'), input.entries);
    const selection = { selectedIds: input.selectedIds, lockedIds: [], excludedIds: [] };
    selectionFacts(entries, selection);
    // Revalidate content fields. Personal data is saved but never forwarded to the model.
    for (const section of CAREER_SECTIONS) {
      const rows = z.array(z.record(z.unknown())).max(160).parse(input.resume[section]);
      input.resume[section] = rows.map(row => parseCareerFact({ id: row.id, section, data: row, sourceTitle: '岗位版本', doNotClaim: '' }).data);
    }
    delete input.resume._cloudId; delete input.resume._careerSave;
    if (JSON.stringify(input.resume).length > 2500000) throw new AgentError('INPUT_TOO_LARGE', '简历过大', 400);
    return c.json(await rpc('career_save_version', { p_owner: c.get('userId'), p_key: input.idempotencyKey, p_hash: await sha256({ title: input.title, resume: input.resume }), p_title: input.title, p_data: input.resume, p_context: { entries, selection } }), 201);
  });
  app.post('/versions/import', async c => {
    const input = z.object({ idempotencyKey: keySchema, title: z.string().trim().min(1).max(120), resume: z.record(z.unknown()) }).strict().parse(await json(c));
    checkKey(c, input.idempotencyKey);
    for (const section of CAREER_SECTIONS) input.resume[section] = z.array(z.record(z.unknown())).max(160).parse(input.resume[section])
      .map(row => parseCareerFact({ id: row.id, section, data: row, sourceTitle: '导入副本', doNotClaim: '' }).data);
    delete input.resume._cloudId; delete input.resume.careerOrigins;
    const { lastModified: _time, ...stable } = input.resume;
    return c.json(await rpc('career_save_version', { p_owner: c.get('userId'), p_key: input.idempotencyKey, p_hash: await sha256({ title: input.title, resume: stable }), p_title: input.title, p_data: input.resume, p_context: { entries: [], selection: { selectedIds: [] } } }), 201);
  });
  app.get('/versions', async c => c.json(await rpc('career_list_versions', { p_owner: c.get('userId') })));
  app.get('/versions/:id', async c => c.json(await rpc('career_get_version', { p_owner: c.get('userId'), p_id: z.string().uuid().parse(c.req.param('id')) })));
  app.route('/projects', projectRoutes(deps));
  return app;
}
