import { useResume } from '../../../hooks/useResume';
import TextAreaField from '../TextAreaField';
import { AIPolishButton } from '../../ai/AIPolishButton';

export default function SelfEvalSection() {
  const { resume, setSelfEvaluation } = useResume();

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium text-gray-700">自我评价</span>
        <AIPolishButton
          fieldLabel="自我评价"
          currentValue={resume.selfEvaluation}
          onPolished={setSelfEvaluation}
          size="sm"
        />
      </div>
      <TextAreaField
        label=""
        value={resume.selfEvaluation}
        onChange={setSelfEvaluation}
        placeholder="简要介绍自己的专业背景、核心能力和职业目标。如：5年前端开发经验，擅长React和TypeScript，主导过多个从0到1的项目..."
        rows={5}
        hint="建议控制在 200 字以内，突出核心竞争力和职业亮点"
      />
    </div>
  );
}
