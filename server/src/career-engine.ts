import { z } from 'zod';
import { careerRevision, careerSources, parseCareerInput, CareerValidationError } from '../../shared/career.js';
import { assembleCareer, parseCareerPlan, selectionInstruction, writingInstruction } from '../../shared/careerComposer.js';
import { entryFacts, selectedCareerPlan, selectionFacts, type CareerRunContext } from '../../shared/careerEntries.js';
import { jobTarget } from '../../shared/targetJob.js';
import { RESUME_WRITER_VERSION } from '../../shared/resumeWritingSkill.js';
import { factQuestions } from '../../shared/careerReadiness.js';
import { AgentError, safeError, ToolResultError } from './errors.js';
import type { RunRecord, Store } from './store.js';
import type { ModelProvider } from './provider.js';
import type { Config } from './config.js';

export async function executeCareerRun(initial: RunRecord, store: Store, provider: ModelProvider, config: Config, outer: AbortSignal) {
  let run = initial;
  const control = new AbortController(), signal = AbortSignal.any([outer, control.signal]);
  const timer = setInterval(() => { void store.rpc<boolean>('agent_renew_lease', { p_run: run.id, p_token: initial.lease_token, p_seconds: 90 })
    .then(ok => { if (!ok) control.abort(); }).catch(() => control.abort()); }, 15000);
  const checkpoint = async (context: CareerRunContext, stage: number, status: RunRecord['status']) => {
    signal.throwIfAborted();
    run = await store.rpc<RunRecord>('career_checkpoint', { p_run: run.id, p_token: initial.lease_token, p_view: run.run_view, p_stage: stage, p_status: status, p_context: context });
  };
  const checked = <T>(fn: () => T): T => {
    try { return fn(); } catch (error) { throw new ToolResultError('岗位结果未通过事实与来源校验', error instanceof CareerValidationError ? error.path : '$', error instanceof CareerValidationError ? error.rule : 'career_validation'); }
  };
  try {
    let context = structuredClone(run.career_context!);
    const input = parseCareerInput({ jdText: jobTarget(context.target.text, context.target.mode).text, facts: entryFacts(context.entries) });
    if (run.stage === 0) {
      run.run_view.steps = [{ id: 'career-select', tool: 'find_resume_evidence', status: 'running', attempt: 1, summary: '分析岗位并推荐经历' }];
      await checkpoint(context, 0, 'running');
      const allowed = { ...input, facts: input.facts.filter(f => !context.selection.excludedIds.includes(f.id)) };
      const raw = await provider.generate(run, 'career-select', z.unknown(), selectionInstruction + '\n同一groupId或relatedEntryId关联的竞赛过程与奖项属于同一事件，不重复计算独立证据。', { ...allowed, groups: context.entries.map(e => ({ entryId: e.id, groupId: e.groupId, relatedEntryId: e.relatedEntryId })) }, signal,
        value => { checked(() => parseCareerPlan(value, allowed)); });
      context.plan = checked(() => parseCareerPlan(raw, allowed));
      context.questions = factQuestions(allowed.facts);
      context.selection.selectedIds = [...new Set([...context.selection.lockedIds, ...context.plan.selected.map(s => s.factId)])];
      context.phase = 'selection';
      run.run_view.steps[0].status = 'completed'; run.run_view.steps[0].summary = '推荐已完成，等待用户确认选材';
      await checkpoint(context, 1, 'awaiting_input'); return;
    }
    if (context.phase !== 'write' || !context.plan) throw new AgentError('STATE_CONFLICT', '请先确认选材', 409);
    await store.rpc('career_check_sources', { p_owner: run.owner_id, p_context: context });
    const facts = selectionFacts(context.entries, context.selection), plan = selectedCareerPlan(context.plan, context.selection);
    const attempt = (run.run_view.steps.find(s => s.id === 'career-write')?.attempt || 0) + 1;
    run.run_view.steps = run.run_view.steps.filter(s => s.id !== 'career-write');
    run.run_view.steps.push({ id: 'career-write', tool: 'draft_resume_changes', status: 'running', attempt, summary: context.useOriginal ? '整理事实原文' : '根据已确认选材写作' });
    await checkpoint(context, 1, 'running');
    let assembled;
    if (context.useOriginal || !facts.length) assembled = assembleCareer({ edits: [], summary: { text: '', sourceIds: [] } }, input.facts, plan, false);
    else {
      const originals = context.entries.filter(e => facts.some(f => f.id.startsWith(e.id + ':'))).map(e => ({ entryId: e.id, rawText: e.rawText, details: e.details, doNotClaim: e.doNotClaim }));
      if (JSON.stringify(originals).length > 72000) throw new AgentError('INPUT_TOO_LARGE', '所选原始材料过多，请缩小选材范围后重试', 400);
      const raw = await provider.generate(run, 'career-write', z.unknown(), writingInstruction + '\noriginals为原始材料，仅帮助理解细节；新增事实必须先经用户确认，不能将未确认材料直接升级为个人贡献。', { jdText: input.jdText, plan, facts, originals, sourceCatalog: careerSources(facts) }, signal,
        value => { checked(() => assembleCareer(value, input.facts, plan, false)); });
      assembled = checked(() => assembleCareer(raw, input.facts, plan, false));
    }
    context.result = { id: run.id, inputRevision: await careerRevision(input, true), skillVersion: RESUME_WRITER_VERSION, createdAt: Date.now(), plan, ...assembled, modelCalls: run.run_view.usage.calls, needsMoreFacts: !facts.length };
    context.phase = 'review';
    const step = run.run_view.steps.find(s => s.id === 'career-write')!; step.status = 'completed'; step.summary = '已完成，等待用户核对应用';
    await checkpoint(context, 2, 'completed');
  } catch (error) {
    if (signal.aborted || (error instanceof AgentError && error.code === 'LEASE_LOST')) return;
    const e = safeError(error);
    run.run_view.error = { code: e.code, message: e.message, retryable: e.retryable && run.run_view.usage.calls < config.MAX_MODEL_CALLS_PER_RUN };
    try { await checkpoint(run.career_context!, run.stage, 'failed'); } catch { /* a cancelled or reclaimed run cannot commit */ }
  } finally { clearInterval(timer); }
}
