import { useResume } from '../../../hooks/useResume';
import ArrayField from '../ArrayField';
import TextField from '../TextField';
import SelectField from '../SelectField';
import { SKILL_CATEGORIES } from '../../../constants/skillOptions';
import type { Skill } from '../../../types/resume';

export default function SkillSection() {
  const { resume, addItem, updateItem, removeItem, moveItem } = useResume();

  return (
    <ArrayField<Skill>
      items={resume.skills}
      onAdd={() => addItem('skills')}
      onRemove={(i) => removeItem('skills', resume.skills[i].id)}
      onMove={(f, t) => moveItem('skills', f, t)}
      renderItem={(skill) => (
        <div>
          <div className="grid grid-cols-2 gap-x-4">
            <TextField
              label="技能名称"
              value={skill.skillName}
              onChange={(v) => updateItem('skills', skill.id, { skillName: v })}
              placeholder="如：React"
            />
            <SelectField
              label="熟练程度"
              value={skill.level}
              onChange={(v) => updateItem('skills', skill.id, { level: v })}
              options={[
                { value: '精通', label: '精通' },
                { value: '熟练', label: '熟练' },
                { value: '掌握', label: '掌握' },
                { value: '了解', label: '了解' },
              ]}
            />
          </div>
          <SelectField
            label="技能类别"
            value={skill.category}
            onChange={(v) => updateItem('skills', skill.id, { category: v })}
            options={SKILL_CATEGORIES.map((c) => ({ value: c, label: c }))}
          />
        </div>
      )}
      addLabel="添加技能"
    />
  );
}
