import { useState } from 'react';
import { useAI } from '../../hooks/useAI';
import { useResume } from '../../hooks/useResume';
import { useAIContext } from '../../hooks/useAIContext';

export function AIBulkGenerate() {
  const { loadResume, resume } = useResume();
  const { generateResume } = useAI();
  const { checkAccess } = useAIContext();

  const [isOpen, setIsOpen] = useState(false);
  const [rawText, setRawText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accessError = checkAccess('generate');
  const isDisabled = !!accessError || loading;

  const handleGenerate = async () => {
    if (accessError) {
      setError(accessError);
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const result = await generateResume(rawText);
      // AI 返回的数据可能不完整，与现有简历合并
      const merged = JSON.parse(JSON.stringify(resume));

      // 安全合并 personalInfo
      if (result.personalInfo && typeof result.personalInfo === 'object') {
        const safe: Record<string, string> = {};
        for (const [k, v] of Object.entries(result.personalInfo)) {
          safe[k] = typeof v === 'string' ? v : '';
        }
        merged.personalInfo = { ...merged.personalInfo, ...safe };
      }
      if (result.jobIntention && typeof result.jobIntention === 'object') {
        const safe: Record<string, string> = {};
        for (const [k, v] of Object.entries(result.jobIntention)) {
          if (['desiredPosition', 'desiredCity', 'expectedSalary', 'jobType', 'availableDate'].includes(k)) {
            safe[k] = typeof v === 'string' ? v : '';
          }
        }
        merged.jobIntention = { ...merged.jobIntention, ...safe };
      }
      if (typeof result.selfEvaluation === 'string') {
        merged.selfEvaluation = result.selfEvaluation;
      }

      // 安全数组合并：过滤非法数据，确保字段类型正确
      const arrayFields = ['education', 'workExperience', 'projects', 'skills', 'certificates', 'languages', 'socialLinks'] as const;
      for (const field of arrayFields) {
        const aiData = result[field];
        if (!Array.isArray(aiData) || aiData.length === 0) continue;

        // 过滤掉非对象、空对象
        const validItems = aiData
          .filter((item: unknown): item is Record<string, unknown> =>
            item !== null && typeof item === 'object' && !Array.isArray(item) && Object.keys(item as object).length > 0
          )
          .map((item) => {
            // 确保每个字段值都是合法类型
            const safe: Record<string, unknown> = {};
            for (const [k, v] of Object.entries(item)) {
              if (v === null || v === undefined) {
                safe[k] = '';
              } else if (Array.isArray(v)) {
                safe[k] = v.filter(x => typeof x === 'string');
              } else if (typeof v === 'object') {
                // 非预期的嵌套对象 => 转字符串
                safe[k] = '';
              } else {
                safe[k] = v;
              }
            }
            return { ...safe, id: typeof item.id === 'string' && item.id.length > 0 ? item.id : crypto.randomUUID() };
          });

        if (validItems.length === 0) continue;

        if (merged[field].length === 0) {
          merged[field] = validItems;
        } else {
          merged[field].push(...validItems);
        }
      }

      loadResume(merged);
      setIsOpen(false);
      setRawText('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mb-3">
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
              onClick={() => { setIsOpen(false); setError(null); }}
              className="text-violet-400 hover:text-violet-600 transition-colors"
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

            <textarea
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

            {error && (
              <div className="flex items-start gap-2 p-2.5 bg-red-50 text-red-700 text-xs rounded-lg">
                <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                </svg>
                <span>{error}</span>
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={handleGenerate}
                disabled={loading || !rawText.trim()}
                className="flex-1 px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg
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
                    生成简历
                  </>
                )}
              </button>

              <button
                onClick={() => { setIsOpen(false); setError(null); }}
                className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
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
