import { useResume } from '../../../hooks/useResume';
import TextAreaField from '../TextAreaField';

export default function SelfEvalSection() {
  const { resume, setSelfEvaluation } = useResume();

  return (
    <div>
      <TextAreaField
        label="自我评价"
        value={resume.selfEvaluation}
        onChange={setSelfEvaluation}
        placeholder="简要介绍自己的专业背景、核心能力和职业目标。如：5年前端开发经验，擅长React和TypeScript，主导过多个从0到1的项目..."
        rows={5}
        hint="建议控制在 200 字以内，突出核心竞争力和职业亮点"
      />
    </div>
  );
}
