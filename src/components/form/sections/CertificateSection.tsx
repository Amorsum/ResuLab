import { useResume } from '../../../hooks/useResume';
import ArrayField from '../ArrayField';
import TextField from '../TextField';
import type { Certificate } from '../../../types/resume';

export default function CertificateSection() {
  const { resume, addItem, updateItem, removeItem, moveItem } = useResume();

  return (
    <ArrayField<Certificate>
      items={resume.certificates}
      onAdd={() => addItem('certificates')}
      onRemove={(i) => removeItem('certificates', resume.certificates[i].id)}
      onMove={(f, t) => moveItem('certificates', f, t)}
      renderItem={(cert) => (
        <div>
          <TextField
            label="证书/奖项名称"
            value={cert.name}
            onChange={(v) => updateItem('certificates', cert.id, { name: v })}
            placeholder="如：PMP项目管理认证"
          />
          <div className="grid grid-cols-2 gap-x-4">
            <TextField
              label="颁发机构"
              value={cert.issuer}
              onChange={(v) => updateItem('certificates', cert.id, { issuer: v })}
              placeholder="如：PMI"
            />
            <TextField
              label="获得时间"
              value={cert.date}
              onChange={(v) => updateItem('certificates', cert.id, { date: v })}
              placeholder="如：2024-03"
            />
          </div>
        </div>
      )}
      addLabel="添加证书或奖项"
    />
  );
}
