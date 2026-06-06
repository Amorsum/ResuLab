import { useResume } from '../../../hooks/useResume';
import TextField from '../TextField';
import SelectField from '../SelectField';

export default function JobIntentionSection() {
  const { resume, setJobIntention } = useResume();
  const j = resume.jobIntention;

  return (
    <div>
      <TextField
        label="期望职位"
        value={j.desiredPosition}
        onChange={(v) => setJobIntention({ desiredPosition: v })}
        placeholder="如：高级前端工程师"
      />

      <TextField
        label="期望城市"
        value={j.desiredCity}
        onChange={(v) => setJobIntention({ desiredCity: v })}
        placeholder="如：上海"
      />

      <TextField
        label="期望薪资"
        value={j.expectedSalary}
        onChange={(v) => setJobIntention({ expectedSalary: v })}
        placeholder="如：15K-25K"
      />

      <SelectField
        label="工作类型"
        value={j.jobType}
        onChange={(v) => setJobIntention({ jobType: v as typeof j.jobType })}
        options={[
          { value: '全职', label: '全职' },
          { value: '兼职', label: '兼职' },
          { value: '实习', label: '实习' },
        ]}
      />

      <TextField
        label="到岗时间"
        value={j.availableDate}
        onChange={(v) => setJobIntention({ availableDate: v })}
        placeholder="如：随时 / 2024年7月"
      />
    </div>
  );
}
