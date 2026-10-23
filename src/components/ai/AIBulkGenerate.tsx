import { useId, useRef, useState } from 'react';
import { useAI } from '../../hooks/useAI';
import { useResume } from '../../hooks/useResume';
import { useAIContext } from '../../hooks/useAIContext';
import { hasImportChanges, IMPORT_LABELS, IMPORT_SECTIONS, importRevision, prepareAIImport, type AIImportPlan } from '../../utils/aiImport';

const FIELD_LABELS: Record<string, string> = {
  fullName: '姓名', gender: '性别', birthYear: '出生年', birthMonth: '出生月', phone: '电话', email: '邮箱', city: '城市', jobTitle: '职位', yearsOfExperience: '工作年限',
  desiredPosition: '期望职位', desiredCity: '期望城市', expectedSalary: '期望薪资', jobType: '工作性质', availableDate: '到岗时间',
  schoolName: '学校', degree: '学历', major: '专业', startDate: '开始日期', endDate: '结束日期', isCurrent: '至今', gpa: '绩点', description: '描述',
  companyName: '公司', position: '职位', highlights: '亮点', projectName: '项目', role: '角色', techStack: '技术栈', url: '链接',
  skillName: '技能', level: '水平', category: '类别', name: '名称', issuer: '颁发机构', date: '日期', language: '语言', score: '成绩', platform: '平台',
};

export function AIBulkGenerate() {
  const textInputId = useId();
  const resume = useResume();
  const { generateResume } = useAI();
  const { checkAccess } = useAIContext();

  const [isOpen, setIsOpen] = useState(false);
  const [rawText, setRawText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [plan, setPlan] = useState<AIImportPlan | null>(null);
  const [notice, setNotice] = useState('');
  const busy = useRef(false);
  const latestResume = useRef(resume.resume);
  latestResume.current = resume.resume;

  const accessError = checkAccess('generate');

  const handleGenerate = async () => {
    if (busy.current) return;
    if (accessError) { setError(accessError); return; }
    busy.current = true;
    setNotice('');
    setError(null);
    setLoading(true);

    try {
      const result = await generateResume(rawText);

      const next = prepareAIImport(result, latestResume.current);
      if (!hasImportChanges(next)) throw new Error('没有可导入的新内容，重复或无效条目已跳过。');
      setPlan(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成失败');
    } finally {
      setLoading(false);
      busy.current = false;
    }
  };

  const confirmImport = () => {
    if (!plan || busy.current) return;
    if (importRevision(latestResume.current) !== plan.baseRevision) {
      setError('简历已变化，请返回重新生成后核对。'); return;
    }
    busy.current = true;
    resume.importAIResume(plan);
    setPlan(null); setIsOpen(false); setRawText('');
    setNotice('已追加导入，可用 Ctrl+Z 一次撤销本次全部修改。');
    busy.current = false;
  };

  return (
    <div className="mb-3">
      <p role="status" className="text-sm text-green-700">{notice}</p>
      {/* 触发按钮 */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl
            bg-gradient-to-r from-violet-500 to-purple-600 text-white font-medium
            hover:from-violet-600 hover:to-purple-700
            transition-all duration-200 shadow-sm hover:shadow-md"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
          </svg>
          AI 智能填写
          <svg className="w-4 h-4 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
        </button>
      )}

      {/* 展开面板 */}
      {isOpen && (
        <div className="border border-violet-200 rounded-xl overflow-hidden bg-white shadow-sm">
          <div className="px-4 py-3 bg-violet-50 border-b border-violet-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-violet-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
              </svg>
              <span className="font-medium text-sm text-violet-700">AI 智能填写简历</span>
            </div>
            <button
              onClick={() => { setIsOpen(false); setPlan(null); setError(null); }}
              disabled={loading} aria-label="关闭智能填写" className="min-h-11 min-w-11 text-violet-700 disabled:opacity-50"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="p-4 space-y-3">
            <p className="text-xs text-gray-500">
              粘贴你的职业经历、项目简介或个人介绍，AI 将自动提取信息并填入简历各栏目。
            </p>

            {plan ? <div className="space-y-3 text-sm">
              <h4 className="font-medium">核对待导入内容</h4>
              <p>确认后追加条目。以下基本信息、求职意向和自我评价将覆盖原值；模板和排版保持原样。</p>
              {(['personalInfo', 'jobIntention'] as const).map(section => Object.keys(plan[section]).length > 0 && <div key={section}>
                <h5 className="font-medium">{IMPORT_LABELS[section]}</h5>
                {Object.entries(plan[section]).map(([key, value]) => <div key={key} className="p-2 bg-gray-50 rounded break-words">
                  <p>{FIELD_LABELS[key]}</p><p>原值：{String((resume.resume[section] as unknown as Record<string, string>)[key]) || '（空）'}</p><p>新值：{value}</p>
                </div>)}
              </div>)}
              {IMPORT_SECTIONS.map(section => plan.items[section].length > 0 && <div key={section}>
                <h5 className="font-medium">{IMPORT_LABELS[section]}：追加 {plan.items[section].length} 条</h5>
                {plan.items[section].map(item => <pre key={item.id} className="mt-2 p-2 bg-gray-50 whitespace-pre-wrap break-words font-sans">{Object.entries(item).filter(([key]) => key !== 'id').map(([key, value]) => `${FIELD_LABELS[key]}：${Array.isArray(value) ? value.join('、') : typeof value === 'boolean' ? value ? '是' : '否' : value}`).join('\n')}</pre>)}
              </div>)}
              {plan.selfEvaluation && <div className="whitespace-pre-wrap break-words"><h5 className="font-medium">自我评价</h5><p>原文：{resume.resume.selfEvaluation || '（空）'}</p><p>新文：{plan.selfEvaluation}</p></div>}
              <p>跳过重复或无效条目：{plan.skipped} 条。请核实事实后确认。</p>
              {importRevision(resume.resume) !== plan.baseRevision && <p role="alert" className="text-red-700">简历已变更，请返回重新生成，避免覆盖新内容。</p>}
            </div> : <>
            <label htmlFor={textInputId} className="sr-only">原始经历文本</label>
            <textarea id={textInputId}
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder={
                '例如：\n\n李小明，3年Java后端开发经验，熟悉Spring Boot和MySQL。\n在腾讯做过电商系统，负责订单模块开发，日均处理10万+订单...'
              }
              rows={6}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg
                focus:ring-2 focus:ring-violet-400 focus:border-transparent
                resize-none placeholder-gray-300"
              disabled={loading}
            />

            </>}

            {error && (
              <div role="alert" className="flex items-start gap-2 p-2.5 bg-red-50 text-red-700 text-xs rounded-lg">
                <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                </svg>
                <span>{error}</span>
              </div>
            )}

            {plan && <button onClick={() => { setPlan(null); setError(null); }} className="min-h-11 px-3 text-sm text-violet-700">返回修改</button>}
            <div className="flex gap-2">
              <button
                onClick={plan ? confirmImport : handleGenerate}
                disabled={loading || !rawText.trim() || Boolean(plan && importRevision(resume.resume) !== plan.baseRevision)}
                className="flex-1 min-h-11 px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg
                  hover:bg-violet-700 disabled:bg-gray-300 disabled:cursor-not-allowed
                  transition-colors flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    AI 正在生成...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                    </svg>
                    {plan ? '确认追加导入' : '生成并预览'}
                  </>
                )}
              </button>

              <button
                onClick={() => { setIsOpen(false); setPlan(null); setError(null); }}
                className="min-h-11 px-4 py-2 text-sm text-gray-600 hover:text-gray-700 transition-colors"
                disabled={loading}
              >
                取消
              </button>
            </div>

            <p className="text-[10px] text-gray-400 text-center">
              AI 生成内容可能存在偏差，请仔细核对后使用
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
