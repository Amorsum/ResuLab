import { useResume } from '../../../hooks/useResume';
import ArrayField from '../ArrayField';
import TextField from '../TextField';
import SelectField from '../SelectField';
import type { SocialLink } from '../../../types/resume';

export default function SocialLinkSection() {
  const { resume, addItem, updateItem, removeItem, moveItem } = useResume();

  return (
    <ArrayField<SocialLink>
      items={resume.socialLinks}
      onAdd={() => addItem('socialLinks')}
      onRemove={(i) => removeItem('socialLinks', resume.socialLinks[i].id)}
      onMove={(f, t) => moveItem('socialLinks', f, t)}
      renderItem={(link) => (
        <div>
          <div className="grid grid-cols-2 gap-x-4">
            <SelectField
              label="平台"
              value={link.platform}
              onChange={(v) => updateItem('socialLinks', link.id, { platform: v })}
              options={[
                { value: 'GitHub', label: 'GitHub' },
                { value: 'LinkedIn', label: 'LinkedIn' },
                { value: '个人网站', label: '个人网站' },
                { value: '掘金', label: '掘金' },
                { value: '知乎', label: '知乎' },
                { value: 'CSDN', label: 'CSDN' },
                { value: '微博', label: '微博' },
                { value: '其他', label: '其他' },
              ]}
            />
            <TextField
              label="链接地址"
              value={link.url}
              onChange={(v) => updateItem('socialLinks', link.id, { url: v })}
              placeholder="https://"
              type="url"
            />
          </div>
        </div>
      )}
      addLabel="添加社交链接"
      emptyLabel="暂无链接，可添加 GitHub、LinkedIn 等"
    />
  );
}
