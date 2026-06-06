import { useResume } from '../../../hooks/useResume';
import ArrayField from '../ArrayField';
import TextField from '../TextField';
import TextAreaField from '../TextAreaField';
import DateRangeField from '../DateRangeField';
import SkillTagInput from '../SkillTagInput';
import type { Project } from '../../../types/resume';

export default function ProjectSection() {
  const { resume, addItem, updateItem, removeItem, moveItem } = useResume();

  return (
    <ArrayField<Project>
      items={resume.projects}
      onAdd={() => addItem('projects')}
      onRemove={(i) => removeItem('projects', resume.projects[i].id)}
      onMove={(f, t) => moveItem('projects', f, t)}
      renderItem={(proj) => (
        <div>
          <div className="grid grid-cols-2 gap-x-4">
            <TextField
              label="项目名称"
              value={proj.projectName}
              onChange={(v) => updateItem('projects', proj.id, { projectName: v })}
              placeholder="请输入项目名称"
            />
            <TextField
              label="担任角色"
              value={proj.role}
              onChange={(v) => updateItem('projects', proj.id, { role: v })}
              placeholder="如：前端负责人"
            />
          </div>
          <DateRangeField
            startValue={proj.startDate}
            endValue={proj.endDate}
            isCurrent={proj.isCurrent}
            onStartChange={(v) => updateItem('projects', proj.id, { startDate: v })}
            onEndChange={(v) => updateItem('projects', proj.id, { endDate: v })}
            onCurrentChange={(v) => updateItem('projects', proj.id, { isCurrent: v, endDate: v ? '' : proj.endDate })}
          />
          <TextAreaField
            label="项目描述"
            value={proj.description}
            onChange={(v) => updateItem('projects', proj.id, { description: v })}
            placeholder="描述项目背景、你的工作内容和取得的成果"
            rows={3}
          />
          <SkillTagInput
            label="技术栈"
            values={proj.techStack}
            onChange={(v) => updateItem('projects', proj.id, { techStack: v })}
            placeholder="如：React, TypeScript, Node.js"
            suggestions={['React', 'Vue', 'TypeScript', 'Python', 'Java', 'Node.js', 'Go', 'Docker', 'AWS', 'MySQL']}
          />
          <TextField
            label="项目链接"
            value={proj.url}
            onChange={(v) => updateItem('projects', proj.id, { url: v })}
            placeholder="如：https://github.com/xxx（选填）"
            type="url"
          />
        </div>
      )}
      addLabel="添加项目经历"
    />
  );
}
