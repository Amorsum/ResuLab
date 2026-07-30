import { useResume } from '../../../hooks/useResume';
import ArrayField from '../ArrayField';
import TextField from '../TextField';
import TextAreaField from '../TextAreaField';
import SelectField from '../SelectField';
import DateRangeField from '../DateRangeField';
import { AIPolishButton } from '../../ai/AIPolishButton';
import type { Education } from '../../../types/resume';

export default function EducationSection() {
  const { resume, addItem, updateItem, removeItem, moveItem } = useResume();

  return (
    <ArrayField<Education>
      items={resume.education}
      onAdd={() => addItem('education')}
      onRemove={(i) => removeItem('education', resume.education[i].id)}
      onMove={(f, t) => moveItem('education', f, t)}
      renderItem={(edu, index) => (
        <div>
          <TextField
            label="学校名称"
            value={edu.schoolName}
            onChange={(v) => updateItem('education', edu.id, { schoolName: v })}
            placeholder="请输入学校名称"
          />
          <div className="grid grid-cols-2 gap-x-4">
            <SelectField
              label="学位"
              value={edu.degree}
              onChange={(v) => updateItem('education', edu.id, { degree: v })}
              options={[
                { value: '高中', label: '高中' },
                { value: '中专', label: '中专' },
                { value: '大专', label: '大专' },
                { value: '本科', label: '本科' },
                { value: '硕士', label: '硕士' },
                { value: '博士', label: '博士' },
                { value: 'MBA', label: 'MBA' },
              ]}
            />
            <TextField
              label="专业"
              value={edu.major}
              onChange={(v) => updateItem('education', edu.id, { major: v })}
              placeholder="如：计算机科学"
            />
          </div>
          <DateRangeField
            startValue={edu.startDate}
            endValue={edu.endDate}
            isCurrent={edu.isCurrent}
            onStartChange={(v) => updateItem('education', edu.id, { startDate: v })}
            onEndChange={(v) => updateItem('education', edu.id, { endDate: v })}
            onCurrentChange={(v) => updateItem('education', edu.id, { isCurrent: v, endDate: v ? '' : edu.endDate })}
          />
          <TextField
            label="GPA / 成绩"
            value={edu.gpa}
            onChange={(v) => updateItem('education', edu.id, { gpa: v })}
            placeholder="如：3.8/4.0（选填）"
          />
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-medium text-gray-700">在校经历</span>
            <AIPolishButton
              fieldLabel={`${edu.schoolName} 在校经历`}
              currentValue={edu.description}
              onPolished={(v) => updateItem('education', edu.id, { description: v })}
            />
          </div>
          <TextAreaField
            label=""
            value={edu.description}
            onChange={(v) => updateItem('education', edu.id, { description: v })}
            placeholder="如：获得校级奖学金、担任学生会主席等"
            rows={3}
          />
        </div>
      )}
      addLabel="添加教育经历"
    />
  );
}
