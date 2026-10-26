import { useEffect, useId, useRef, useState } from 'react';
import { useAI } from '../../hooks/useAI';
import { useResume } from '../../hooks/useResume';
import { useAIContext } from '../../hooks/useAIContext';
import { hasImportChanges, IMPORT_LABELS, IMPORT_SECTIONS, importRevision, prepareAIImport, type AIImportPlan } from '../../utils/aiImport';
import { MAX_RESUME_TEXT, readResumeFile, type ResumeFileText } from '../../utils/resumeFile';

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
  const [reading, setReading] = useState(false), [readProgress, setReadProgress] = useState('');
  const [fileSource, setFileSource] = useState(''), [fileWarning, setFileWarning] = useState('');
  const [pendingFile, setPendingFile] = useState<ResumeFileText | null>(null);
  const reader = useRef<AbortController | null>(null);
  const readLock = useRef(false);
  useEffect(() => () => reader.current?.abort(), []);
  const busy = useRef(false);
  const latestResume = useRef(resume.resume);
  latestResume.current = resume.resume;

  const accessError = checkAccess('generate');

  const useFile = (file: ResumeFileText, append = false) => {
    const text = append ? `${rawText.trim()}\n\n${file.text}` : file.text;
    if (text.length > MAX_RESUME_TEXT) { setError('合并后的文字超过 60000 字，请精简当前输入再追加。'); return; }
    setRawText(text); setFileSource(file.name); setFileWarning(file.warning); setPendingFile(null); setError(null);
    setNotice('文件已在本地读取。请核对文本，再点击“提取并预览”。');
  };
  const handleFile = async (file: File) => {
    if (busy.current || readLock.current) return;
    readLock.current = true; setReading(true); setError(null); setNotice(''); setPendingFile(null);
    const controller = new AbortController(); reader.current = controller;
    let timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 60000);
    try {
      const result = await readResumeFile(file, controller.signal, setReadProgress);
      if (rawText.trim()) setPendingFile(result); else useFile(result);
    } catch (err) { setError(timedOut ? '读取超过 60 秒，原输入保留。请缩小文件或转换格式后重试。' : err instanceof Error ? err.message : '读取失败，原输入保留。'); }
    finally { clearTimeout(timeout); setReading(false); setReadProgress(''); readLock.current = false; }
  };

  const handleGenerate = async () => {
    if (busy.current || readLock.current || pendingFile) return;
    if (accessError) { setError(accessError); return; }
    busy.current = true;
    setNotice('');
    setError(null);
    setLoading(true);

    try {
      const result = await generateResume(rawText, fileSource ? 'resume-import' : undefined);

      const next = prepareAIImport(result, latestResume.current, Boolean(fileSource));
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
    setFileSource(''); setFileWarning(''); setPendingFile(null);
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
          className="ai-bulk-trigger w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl
            bg-gradient-to-r from-primary-500 to-primary-600 text-white font-medium
            hover:from-primary-600 hover:to-primary-700
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
        <div className="ai-bulk-panel border border-primary-200 rounded-xl overflow-hidden bg-white shadow-sm">
          <div className="px-4 py-3 bg-primary-50 border-b border-primary-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-primary-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
              </svg>
              <span className="font-medium text-sm text-primary-700">AI 智能填写简历</span>
            </div>
            <button
              onClick={() => { setIsOpen(false); setPlan(null); setError(null); }}
              disabled={loading || reading} aria-label="关闭智能填写" className="min-h-11 min-w-11 text-primary-700 disabled:opacity-50"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="p-4 space-y-3">
            <p className="text-xs text-gray-500">
              导入已有简历，或粘贴经历文本。AI 整理后先核对，确认才会填入编辑器。
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
            <div className="rounded-lg border border-dashed border-primary-200 bg-primary-50 p-3 space-y-2">
              <label className="text-sm font-medium text-primary-700 block">导入已有简历
                <input type="file" accept=".pdf,.docx,.txt,.md" disabled={loading || reading} className="block w-full mt-2 text-xs file:mr-3 file:rounded-md file:border-0 file:bg-white file:px-3 file:py-2 file:text-primary-700" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void handleFile(file); }} />
              </label>
              <p className="text-xs text-gray-600">PDF、Word（.docx）、TXT / Markdown，最大 10 MB，PDF 最多 20 页。扫描版需先做文字识别。</p>
              <p className="text-xs text-gray-600">文件在浏览器本地读取；点击提取后，仅下方文本发送给当前配置的 AI。</p>
            </div>
            {reading && <div role="status" className="text-xs text-primary-700">{readProgress}<button className="min-h-11 px-3 underline" onClick={() => reader.current?.abort()}>停止读取</button></div>}
            {pendingFile && <div className="rounded-lg border border-amber-200 p-3 text-sm space-y-2"><p>已读取 {pendingFile.name}，共 {pendingFile.text.length} 字。当前输入已有内容，选择如何导入：</p><div className="flex flex-wrap gap-2"><button className="btn-secondary" onClick={() => useFile(pendingFile, true)}>追加到当前文本</button><button className="btn-secondary" onClick={() => useFile(pendingFile)}>替换输入文本</button><button className="btn-ghost" onClick={() => setPendingFile(null)}>保留当前输入</button></div><p className="text-xs text-gray-500">此处只修改输入文本，不会更改编辑器中的简历。</p></div>}
            {fileSource && <p className="text-xs text-gray-600 break-all">文件来源：{fileSource} · {rawText.length} 字</p>}
            {fileWarning && <p className="text-xs text-amber-800">{fileWarning}</p>}
            <label htmlFor={textInputId} className="sr-only">原始经历文本</label>
            <textarea id={textInputId}
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder={
                '粘贴简历正文，或选择上方文件。\n\n例如：计算机专业在读，参与校园二手交易平台课程项目，负责商品列表和筛选页面，提交了课程报告。'
              }
              rows={6}
              maxLength={MAX_RESUME_TEXT}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg
                focus:ring-2 focus:ring-primary-400 focus:border-transparent
                resize-none placeholder-gray-300"
              disabled={loading || reading || Boolean(pendingFile)}
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

            {plan && <button onClick={() => { setPlan(null); setError(null); }} className="min-h-11 px-3 text-sm text-primary-700">返回修改</button>}
            <div className="flex gap-2">
              <button
                onClick={plan ? confirmImport : handleGenerate}
                disabled={loading || reading || Boolean(pendingFile) || rawText.trim().length < 20 || Boolean(plan && importRevision(resume.resume) !== plan.baseRevision)}
                className="flex-1 min-h-11 px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg
                  hover:bg-primary-700 disabled:bg-gray-300 disabled:cursor-not-allowed
                  transition-colors flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    {fileSource ? 'AI 正在整理简历内容…' : 'AI 正在生成…'}
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                    </svg>
                    {plan ? '确认追加导入' : fileSource ? '提取并预览' : '生成并预览'}
                  </>
                )}
              </button>

              <button
                onClick={() => { setIsOpen(false); setPlan(null); setError(null); }}
                className="min-h-11 px-4 py-2 text-sm text-gray-600 hover:text-gray-700 transition-colors"
                disabled={loading || reading}
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
