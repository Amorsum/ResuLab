import { useResume } from '../../../hooks/useResume';
import ArrayField from '../ArrayField';
import TextField from '../TextField';
import SelectField from '../SelectField';
import type { Language } from '../../../types/resume';

export default function LanguageSection() {
  const { resume, addItem, updateItem, removeItem, moveItem } = useResume();

  return (
    <ArrayField<Language>
      items={resume.languages}
      onAdd={() => addItem('languages')}
      onRemove={(i) => removeItem('languages', resume.languages[i].id)}
      onMove={(f, t) => moveItem('languages', f, t)}
      renderItem={(lang) => (
        <div>
          <div className="grid grid-cols-2 gap-x-4">
            <TextField
              label="语言"
              value={lang.language}
              onChange={(v) => updateItem('languages', lang.id, { language: v })}
              placeholder="如：英语"
            />
            <SelectField
              label="掌握程度"
              value={lang.level}
              onChange={(v) => updateItem('languages', lang.id, { level: v })}
              options={[
                { value: '母语', label: '母语' },
                { value: '精通', label: '精通' },
                { value: '熟练', label: '熟练' },
                { value: '良好', label: '良好' },
                { value: '一般', label: '一般' },
              ]}
            />
          </div>
          <TextField
            label="语言成绩"
            value={lang.score}
            onChange={(v) => updateItem('languages', lang.id, { score: v })}
            placeholder="如：CET-6 580 / IELTS 7.0（选填）"
          />
        </div>
      )}
      addLabel="添加语言能力"
    />
  );
}
