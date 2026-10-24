import { useResume } from '../../../hooks/useResume';
import TextField from '../TextField';
import SelectField from '../SelectField';
import AvatarUpload from '../AvatarUpload';

export default function PersonalInfoSection() {
  const { resume, setPersonalInfo } = useResume();
  const p = resume.personalInfo;
  return <div>
    <p className="text-xs text-gray-500 mb-4 leading-relaxed">先填写姓名和可联系到你的方式。照片、性别和年龄都是选填项。</p>
    <TextField label="姓名" value={p.fullName} onChange={v => setPersonalInfo({fullName:v})} placeholder="请输入姓名" required />
    <TextField label="手机号码" value={p.phone} onChange={v => setPersonalInfo({phone:v})} placeholder="请输入手机号" type="tel" />
    <TextField label="邮箱" value={p.email} onChange={v => setPersonalInfo({email:v})} placeholder="example@email.com" type="email" />
    <TextField label="所在城市" value={p.city} onChange={v => setPersonalInfo({city:v})} placeholder="例如：上海" />
    <details className="optional-profile"><summary>选填信息 · 照片、个人背景</summary>
      <AvatarUpload value={p.avatar} onChange={avatar => setPersonalInfo({avatar})} />
      <SelectField label="性别" value={p.gender} onChange={v => setPersonalInfo({gender:v as typeof p.gender})} options={[{value:'男',label:'男'},{value:'女',label:'女'}]} />
      <div className="grid grid-cols-2 gap-x-4"><TextField label="出生年份" value={p.birthYear} onChange={v => setPersonalInfo({birthYear:v})} placeholder="可留空" /><TextField label="出生月份" value={p.birthMonth} onChange={v => setPersonalInfo({birthMonth:v})} placeholder="例如：06" /></div>
      <TextField label="当前身份或职位" value={p.jobTitle} onChange={v => setPersonalInfo({jobTitle:v})} placeholder="例如：本科在读" />
      <TextField label="工作年限" value={p.yearsOfExperience} onChange={v => setPersonalInfo({yearsOfExperience:v})} placeholder="暂无正式工作可留空" />
    </details>
  </div>;
}
