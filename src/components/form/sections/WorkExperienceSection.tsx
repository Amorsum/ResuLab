import { useResume } from '../../../hooks/useResume';
import ArrayField from '../ArrayField';
import TextField from '../TextField';
import TextAreaField from '../TextAreaField';
import DateRangeField from '../DateRangeField';
import SkillTagInput from '../SkillTagInput';
import { AIPolishButton } from '../../ai/AIPolishButton';
import type { WorkExperience } from '../../../types/resume';

export default function WorkExperienceSection() {
  const { resume, addItem, updateItem, removeItem, moveItem } = useResume();

  return (
    <ArrayField<WorkExperience>
      items={resume.workExperience}
      onAdd={() => addItem('workExperience')}
      onRemove={(i) => removeItem('workExperience', resume.workExperience[i].id)}
      onMove={(f, t) => moveItem('workExperience', f, t)}
      renderItem={(exp) => (
        <div>
          <div className="grid grid-cols-2 gap-x-4">
            <TextField
              label="公司名称"
              value={exp.companyName}
              onChange={(v) => updateItem('workExperience', exp.id, { companyName: v })}
              placeholder="请输入公司名称"
            />
            <TextField
              label="职位"
              value={exp.position}
              onChange={(v) => updateItem('workExperience', exp.id, { position: v })}
              placeholder="如：前端开发工程师"
            />
          </div>
          <TextField
            label="工作城市"
            value={exp.city}
            onChange={(v) => updateItem('workExperience', exp.id, { city: v })}
            placeholder="如：北京"
          />
          <DateRangeField
            startValue={exp.startDate}
            endValue={exp.endDate}
            isCurrent={exp.isCurrent}
            onStartChange={(v) => updateItem('workExperience', exp.id, { startDate: v })}
            onEndChange={(v) => updateItem('workExperience', exp.id, { endDate: v })}
            onCurrentChange={(v) => updateItem('workExperience', exp.id, { isCurrent: v, endDate: v ? '' : exp.endDate })}
          />
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-medium text-gray-700">工作内容</span>
            <AIPolishButton
              fieldLabel={`${exp.companyName} - ${exp.position} 工作描述`}
              currentValue={exp.description}
              onPolished={(v) => updateItem('workExperience', exp.id, { description: v })}
            />
          </div>
          <TextAreaField
            label=""
            value={exp.description}
            onChange={(v) => updateItem('workExperience', exp.id, { description: v })}
            placeholder="描述你的主要工作职责和成果"
            rows={3}
          />
          <SkillTagInput
            label="工作亮点"
            values={exp.highlights}
            onChange={(v) => updateItem('workExperience', exp.id, { highlights: v })}
            placeholder="输入亮点后按回车，如：优化性能提升50%"
          />
        </div>
      )}
      addLabel="添加工作经历"
    />
  );
}
