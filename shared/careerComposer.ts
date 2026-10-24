import {
  CAREER_SECTIONS, careerEnsure as ensure, careerObject as object, careerText as text, careerSources, careerRevision,
  type CareerInput, type CareerPlan, type CareerFact, type CareerSource, type CareerSnapshot, type CareerResult, type CareerEdit,
  CareerValidationError,
} from './career.js';
import { cosmeticContent, RESUME_WRITER_VERSION, RESUME_WRITING_RULES } from './resumeWritingSkill.js';

export const selectionInstruction = `${RESUME_WRITING_RULES}
先分析JD并选材，暂不改写简历。返回严格JSON：
{"roleTitle":"目标岗位","requirements":[{"id":"req-1","text":"具体要求","jdQuote":"JD逐字引用","required":true,"coverage":"supported","gap":""}],"selected":[{"factId":"给定事实id","requirementIds":["req-1"],"reason":"此材料中具体哪项事实支持该要求"}]}。
coverage只能是supported、partial、missing。最多15项要求，每项必须有JD原文引句；真实缺口用partial/missing并说明缺什么，不能把学习、迁移能力或关键词巧合算成直接经验。supported必须有入选材料支持，missing不能关联已入选材料；无相关证据可以selected为空。
只从facts选择ID，不输出data或改写后的材料，不猜测ID。最多选4项工作、4项项目、3项教育、16项技能、3项证书、3项语言；每条至少对应一项要求。少而精，勿把所有经历照搬；对岗位无关且不能说明迁移价值的材料不入选。`;

export function parseCareerPlan(value: unknown, input: CareerInput): CareerPlan {
  const raw = object(value, '$', ['roleTitle', 'requirements', 'selected']);
  const roleTitle = text(raw.roleTitle, '$.roleTitle', 120, 1);
  ensure(Array.isArray(raw.requirements) && raw.requirements.length > 0 && raw.requirements.length <= 15, 'requirement_count', '$.requirements');
  const requirements = raw.requirements.map((value, i) => {
    const path = `$.requirements[${i}]`, req = object(value, path, ['id', 'text', 'jdQuote', 'required', 'coverage', 'gap']);
    const jdQuote = text(req.jdQuote, path + '.jdQuote', 2000, 1);
    ensure(input.jdText.includes(jdQuote), 'jd_quote_mismatch', path + '.jdQuote');
    ensure(typeof req.required === 'boolean', 'invalid_boolean', path + '.required');
    ensure(['supported', 'partial', 'missing'].includes(String(req.coverage)), 'invalid_coverage', path + '.coverage');
    return { id: text(req.id, path + '.id', 100, 1), text: text(req.text, path + '.text', 1000, 1), jdQuote, required: req.required,
      coverage: req.coverage as 'supported' | 'partial' | 'missing', gap: text(req.gap, path + '.gap', 1000, req.coverage === 'supported' ? 0 : 1) };
  });
  const ids = new Set(requirements.map((req) => req.id));
  ensure(ids.size === requirements.length, 'duplicate_requirement', '$.requirements');
  ensure(Array.isArray(raw.selected) && raw.selected.length <= 33, 'selection_count', '$.selected');
  const known = new Map(input.facts.map((fact) => [fact.id, fact]));
  const counts: Record<string, number> = {}, limits: Record<string, number> = { workExperience: 4, projects: 4, education: 3, skills: 16, certificates: 3, languages: 3 };
  const selected = raw.selected.map((value, i) => {
    const path = `$.selected[${i}]`, item = object(value, path, ['factId', 'requirementIds', 'reason']);
    const factId = text(item.factId, path + '.factId', 160, 1), fact = known.get(factId);
    ensure(fact, 'unknown_fact', path + '.factId');
    counts[fact.section] = (counts[fact.section] || 0) + 1;
    ensure(counts[fact.section] <= limits[fact.section], 'section_budget', path + '.factId');
    ensure(Array.isArray(item.requirementIds) && item.requirementIds.length > 0 && item.requirementIds.length <= 15, 'requirement_links', path + '.requirementIds');
    const links = item.requirementIds.map((id) => text(id, path + '.requirementIds', 100, 1));
    ensure(new Set(links).size === links.length && links.every((id) => ids.has(id)), 'unknown_requirement', path + '.requirementIds');
    ensure(links.every((id) => requirements.find((req) => req.id === id)!.coverage !== 'missing'), 'missing_cannot_have_evidence', path + '.requirementIds');
    return { factId, requirementIds: links, reason: text(item.reason, path + '.reason', 1200, 1) };
  });
  ensure(new Set(selected.map((item) => item.factId)).size === selected.length, 'duplicate_selection', '$.selected');
  for (const req of requirements) if (req.coverage === 'supported') ensure(selected.some((item) => item.requirementIds.includes(req.id)), 'supported_without_evidence', '$.requirements');
  return { roleTitle, requirements, selected };
}

export const writingInstruction = `${RESUME_WRITING_RULES}
根据已入选材料实际写作，返回严格JSON：
{"edits":[{"factId":"入选事实id","field":"description","after":"岗位相关的新表述","reason":"具体改善方式","sourceIds":["source-1"]}],"summary":{"text":"可留空的岗位摘要","sourceIds":["source-1"]}}。
仅可改education.description、workExperience.description/highlights、projects.description；highlights.after为最多5项的字符串数组（每项最多260字），其他after是最多2200字的字符串。每个目标只改一次，最多20项。
每项修改的sourceIds必须来自该fact自身；跨公司、跨项目事实不能移植。只选择目录ID，不抄写引文。after中的每个数字字面量必须原样出现在所选sourceIds的quote中，不转换单位、数字或百分比。
不要返回未改的字段；只改标点、空格或分行会被拒绝。摘要最多360字，仅引用入选事实；没有独立价值时text为空且sourceIds为空。不得输出新经历、技能、公司、日期、职务或其他额外键，这些由系统从原材料回填。`;

function resolveSources(value: unknown, catalog: CareerSource[], path: string, factId?: string): CareerSource[] {
  ensure(Array.isArray(value) && value.length <= 20, 'source_count', path);
  const ids = value.map((id) => text(id, path, 100, 1));
  ensure(new Set(ids).size === ids.length, 'duplicate_source', path);
  return ids.map((id) => {
    const source = catalog.find((source) => source.id === id);
    ensure(source && (!factId || source.factId === factId), 'source_ownership', path);
    return { ...source };
  });
}
function checkNumbers(value: string | string[], sources: CareerSource[], path: string) {
  const numbers = (s: string) => s.match(/\d+(?:[.,]\d+)*(?:%|％)?/g) ?? [];
  const known = new Set(numbers(sources.map((source) => source.quote).join('\n')));
  ensure(numbers(Array.isArray(value) ? value.join('\n') : value).every((number) => known.has(number)), 'unsupported_number', path);
}
export function assembleCareer(value: unknown, facts: CareerFact[], plan: CareerPlan) {
  const selected = plan.selected.map((item) => facts.find((fact) => fact.id === item.factId)!);
  const catalog = careerSources(selected);
  const raw = object(value, '$', ['edits', 'summary']);
  ensure(Array.isArray(raw.edits) && raw.edits.length <= 20, 'edit_count', '$.edits');
  const targets = new Set<string>();
  const edits: CareerEdit[] = raw.edits.map((value, index) => {
    const path = `$.edits[${index}]`, edit = object(value, path, ['factId', 'field', 'after', 'reason', 'sourceIds']);
    const factId = text(edit.factId, path + '.factId', 160, 1), fact = selected.find((fact) => fact.id === factId);
    ensure(fact, 'unselected_fact', path + '.factId');
    const field = edit.field;
    ensure((field === 'description' && ['education', 'workExperience', 'projects'].includes(fact.section)) || (field === 'highlights' && fact.section === 'workExperience'), 'target_not_allowed', path + '.field');
    const target = `${factId}:${field}`;
    ensure(!targets.has(target), 'duplicate_target', path); targets.add(target);
    const before = (fact.data as unknown as Record<string, string | string[]>)[field];
    let after: string | string[];
    if (field === 'highlights') {
      ensure(Array.isArray(edit.after) && edit.after.length > 0 && edit.after.length <= 5, 'after_type', path + '.after');
      after = edit.after.map((value, i) => text(value, `${path}.after[${i}]`, 260, 1));
    } else after = text(edit.after, path + '.after', 2200, 1);
    const sources = resolveSources(edit.sourceIds, catalog, path + '.sourceIds', factId);
    ensure(sources.length > 0, 'source_required', path + '.sourceIds');
    checkNumbers(after, sources, path + '.after');
    ensure(cosmeticContent(before) !== cosmeticContent(after), 'cosmetic_only_change', path + '.after');
    return { factId, field, before: structuredClone(before), after, reason: text(edit.reason, path + '.reason', 1200, 1), sources };
  });
  const summary = object(raw.summary, '$.summary', ['text', 'sourceIds']);
  const summaryText = text(summary.text, '$.summary.text', 360);
  const summarySources = resolveSources(summary.sourceIds, catalog, '$.summary.sourceIds');
  ensure(summaryText.trim() ? summarySources.length > 0 : summarySources.length === 0, 'summary_sources', '$.summary');
  checkNumbers(summaryText, summarySources, '$.summary.text');
  const snapshot: CareerSnapshot = { education: [], workExperience: [], projects: [], skills: [], certificates: [], languages: [], selfEvaluation: summaryText };
  for (const fact of selected) {
    const item = structuredClone(fact.data);
    for (const edit of edits.filter((edit) => edit.factId === fact.id)) Object.assign(item, { [edit.field]: structuredClone(edit.after) });
    (snapshot[fact.section] as typeof item[]).push(item);
  }
  snapshot.workExperience.sort((a, b) => b.startDate.localeCompare(a.startDate));
  snapshot.education.sort((a, b) => b.startDate.localeCompare(a.startDate));
  return { snapshot, edits, summarySources };
}

export async function composeCareer(input: CareerInput, generate: (instruction: string, data: unknown) => Promise<string>): Promise<CareerResult> {
  let calls = 0, repaired = false;
  async function stage<T>(instruction: string, data: unknown, validate: (value: unknown) => T): Promise<T> {
    let repair = '';
    for (;;) {
      calls++;
      try {
        const response = await generate(instruction + repair, data);
        return validate(JSON.parse(response));
      } catch (error) {
        if (!(error instanceof SyntaxError || error instanceof CareerValidationError) || repaired || calls >= 3) throw error;
        repaired = true;
        const diagnostic = error instanceof CareerValidationError ? { rule: error.rule, path: error.path } : { rule: 'json_parse', path: '$' };
        repair = `\n上一次结果不合格，请重新输出完整JSON。诊断：${JSON.stringify(diagnostic)}。不要重复纯格式修改；事实和数字规则仍有效，无实质改进则省略该项。`;
      }
    }
  }
  const plan = await stage(selectionInstruction, input, (value) => parseCareerPlan(value, input));
  const selected = plan.selected.map((item) => input.facts.find((fact) => fact.id === item.factId)!);
  const assembled = selected.length ? await stage(writingInstruction, { jdText: input.jdText, plan, facts: selected, sourceCatalog: careerSources(selected) }, (value) => assembleCareer(value, input.facts, plan))
    : { snapshot: { education: [], workExperience: [], projects: [], skills: [], certificates: [], languages: [], selfEvaluation: '' } as CareerSnapshot, edits: [], summarySources: [] };
  return { id: crypto.randomUUID(), inputRevision: await careerRevision(input), skillVersion: RESUME_WRITER_VERSION, createdAt: Date.now(), plan, ...assembled, modelCalls: calls, needsMoreFacts: selected.length === 0 };
}

/** Rebuild the returned draft from local immutable facts before saving/opening it. */
export async function verifyCareerResult(value: unknown, input: CareerInput): Promise<CareerResult> {
  const raw = object(value, '$', ['id', 'inputRevision', 'skillVersion', 'createdAt', 'plan', 'snapshot', 'edits', 'summarySources', 'modelCalls', 'needsMoreFacts']);
  ensure(raw.inputRevision === await careerRevision(input), 'input_revision_mismatch', '$.inputRevision');
  ensure(raw.skillVersion === RESUME_WRITER_VERSION, 'skill_version_mismatch', '$.skillVersion');
  ensure(typeof raw.id === 'string' && /^[0-9a-f-]{36}$/i.test(raw.id), 'invalid_id', '$.id');
  ensure(typeof raw.createdAt === 'number' && Number.isFinite(raw.createdAt), 'invalid_timestamp', '$.createdAt');
  ensure(Number.isInteger(raw.modelCalls) && Number(raw.modelCalls) >= 1 && Number(raw.modelCalls) <= 3, 'call_budget', '$.modelCalls');
  const plan = parseCareerPlan(raw.plan, input);
  ensure(raw.needsMoreFacts === (plan.selected.length === 0), 'invalid_gap_state', '$.needsMoreFacts');
  const snapshot = object(raw.snapshot, '$.snapshot', [...CAREER_SECTIONS, 'selfEvaluation']);
  ensure(Array.isArray(raw.edits) && raw.edits.length <= 20 && Array.isArray(raw.summarySources), 'invalid_edits', '$.edits');
  for (const [index, edit] of raw.edits.entries()) {
    const item = object(edit, `$.edits[${index}]`, ['factId', 'field', 'before', 'after', 'reason', 'sources']);
    ensure(Array.isArray(item.sources) && item.sources.length <= 20, 'invalid_sources', `$.edits[${index}].sources`);
  }
  ensure(raw.summarySources.length <= 20, 'invalid_sources', '$.summarySources');
  const edits = raw.edits as CareerEdit[], summarySources = raw.summarySources as CareerSource[];
  const assembled = assembleCareer({ edits: edits.map((edit) => ({ factId: edit.factId, field: edit.field, after: edit.after, reason: edit.reason, sourceIds: edit.sources.map((source) => source.id) })), summary: { text: snapshot.selfEvaluation, sourceIds: summarySources.map((source) => source.id) } }, input.facts, plan);
  ensure(JSON.stringify(snapshot) === JSON.stringify(assembled.snapshot), 'snapshot_tampered', '$.snapshot');
  ensure(JSON.stringify(edits) === JSON.stringify(assembled.edits) && JSON.stringify(summarySources) === JSON.stringify(assembled.summarySources), 'sources_tampered', '$.edits');
  return { id: raw.id, inputRevision: raw.inputRevision as string, skillVersion: raw.skillVersion as string, createdAt: raw.createdAt, plan, ...assembled, modelCalls: raw.modelCalls as number, needsMoreFacts: raw.needsMoreFacts as boolean };
}
