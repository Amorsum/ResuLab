import { useState, useCallback } from 'react';
import { useAI } from '../../hooks/useAI';
import { useAIContext } from '../../hooks/useAIContext';
import { useResume } from '../../hooks/useResume';

interface AIPolishButtonProps {
  /** 字段的中文标签，用于提示词 */
  fieldLabel: string;
  /** 当前值 */
  currentValue: string;
  /** 润色后的回调 */
  onPolished: (polishedValue: string) => void;
  /** 额外的上下文信息 */
  context?: string;
  /** 按钮尺寸 */
  size?: 'sm' | 'xs';
}

export function AIPolishButton({
  fieldLabel,
  currentValue,
  onPolished,
  context,
  size = 'xs',
}: AIPolishButtonProps) {
  const { polishField } = useAI();
  const { resume } = useResume();
  const { checkAccess } = useAIContext();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const accessError = checkAccess('polish');

  const handlePolish = useCallback(async () => {
    if (accessError) {
      setError(accessError);
      return;
    }
    setError(null);
    setSuccess(false);
    setLoading(true);

    try {
      // 构建上下文：简历概览信息
      const ctx = context || [
        `姓名: ${resume.personalInfo.fullName}`,
        `职位: ${resume.personalInfo.jobTitle || resume.jobIntention.desiredPosition}`,
        `工作年限: ${resume.personalInfo.yearsOfExperience}年`,
        `目标岗位: ${resume.jobIntention.desiredPosition}`,
      ].filter(Boolean).join('\n');

      const polished = await polishField(fieldLabel, currentValue, ctx);
      onPolished(polished);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : '润色失败');
    } finally {
      setLoading(false);
    }
  }, [polishField, fieldLabel, currentValue, context, resume, onPolished]);

  const sizeClass = size === 'sm' ? 'px-2 py-1 text-xs' : 'px-1.5 py-0.5 text-[10px]';

  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        onClick={handlePolish}
        disabled={loading || !currentValue.trim()}
        title={accessError || 'AI 润色'}
        className={`${sizeClass} rounded-md font-medium transition-all duration-200
          ${success
            ? 'bg-green-50 text-green-600 border border-green-200'
            : 'bg-violet-50 text-violet-600 border border-violet-200 hover:bg-violet-100'
          }
          disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        {loading ? (
          <svg className="animate-spin w-3 h-3 inline" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        ) : success ? (
          <svg className="w-3 h-3 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        ) : (
          <svg className="w-3 h-3 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
          </svg>
        )}
        {' '}{size === 'sm' ? 'AI润色' : 'AI'}
      </button>

      {error && (
        <span className="text-[10px] text-red-500">{error}</span>
      )}
    </span>
  );
}
