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
        placeholder="如：前端开发实习生 / 数据分析校招"
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
        placeholder="可选，如：面议"
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
        placeholder="例如：7 月起，每周可实习 4 天"
      />
    </div>
  );
}
