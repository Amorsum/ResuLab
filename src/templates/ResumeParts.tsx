import type { CSSProperties, ReactNode } from 'react';
import type { ResumeData } from '../types/resume';
import { formatDateRange, formatMonth } from '../utils/dateFormat';
import './resume-templates.css';

const FONTS: Record<string, string> = {
  songti: '"SimSun", "宋体", serif',
  yahei: '"Microsoft YaHei", "微软雅黑", sans-serif',
  kaiti: '"KaiTi", "楷体", serif',
  fangsong: '"FangSong", "仿宋", serif',
};

export function resumeStyle(data: ResumeData): CSSProperties {
  return {
    '--resume-accent': data.accentColor || '#2563eb',
    '--resume-margin-x': `${Math.round(data.pageMargin * 2.8 + 10)}px`,
    '--resume-margin-y': `${Math.round(data.pageMargin * 2.8 + 22)}px`,
    fontFamily: FONTS[data.fontFamily] || FONTS.yahei,
    fontSize: `${data.fontSize}px`,
    // Compact settings must never make adjacent glyphs overlap.
    lineHeight: `${Math.max(data.lineHeight, data.fontSize * 1.35)}px`,
  } as CSSProperties;
}

export function ResumeSection({ title, children }: { title: string; children: ReactNode }) {
  return <section className="resume-section"><h2 className="resume-section-title">{title}</h2>{children}</section>;
}

export function ResumeHeader({ data, photo = true, contacts = true }: { data: ResumeData; photo?: boolean; contacts?: boolean }) {
  const { personalInfo: p, jobIntention: j } = data;
  const position = j.desiredPosition || p.jobTitle;
  const intent = [j.desiredCity && `意向城市：${j.desiredCity}`, j.expectedSalary && `期望薪资：${j.expectedSalary}`, j.jobType, j.availableDate && `到岗：${j.availableDate}`].filter(Boolean);
  return <header className="resume-header">
    <div className="resume-identity">
      <div className="resume-identity-text">
        {p.fullName && <h1 className="resume-name">{p.fullName}</h1>}
        {(position || p.yearsOfExperience) && <p className="resume-position">{[position, p.yearsOfExperience && `${p.yearsOfExperience}年经验`].filter(Boolean).join(' · ')}</p>}
        {p.jobTitle && j.desiredPosition && p.jobTitle !== j.desiredPosition && <p className="resume-meta">当前职位：{p.jobTitle}</p>}
        {contacts && <ResumeContacts data={data} />}
        {intent.length > 0 && <div className="resume-intention">{intent.map((value, i) => <span key={i}>{value}</span>)}</div>}
      </div>
      {photo && p.avatar && <img className="resume-photo" src={p.avatar} alt={p.fullName ? `${p.fullName}的证件照` : '证件照'} />}
    </div>
  </header>;
}

export function ResumeContacts({ data, stacked = false }: { data: ResumeData; stacked?: boolean }) {
  const p = data.personalInfo;
  const values = [p.phone, p.email, p.city, p.gender, p.birthYear && `${p.birthYear}年${p.birthMonth ? `${p.birthMonth}月` : ''}`].filter(Boolean);
  if (!values.length) return null;
  return <div className={`resume-contacts${stacked ? ' resume-contacts-stacked' : ''}`}>{values.map((v, i) => <span key={i}>{v}</span>)}</div>;
}

function EntryHeading({ title, start, end, current }: { title: string; start: string; end: string; current: boolean }) {
  const dates = formatDateRange(start, end, current);
  return <div className="resume-entry-heading"><h3>{title}</h3>{dates && <span className="resume-date">{dates}</span>}</div>;
}

export function EducationSection({ data }: { data: ResumeData }) {
  if (!data.education.length) return null;
  return <ResumeSection title="教育背景">{data.education.map(edu => <article className="resume-entry" key={edu.id}>
    <EntryHeading title={edu.schoolName} start={edu.startDate} end={edu.endDate} current={edu.isCurrent} />
    <p className="resume-entry-subtitle">{[edu.degree, edu.major, edu.gpa && `GPA ${edu.gpa}`].filter(Boolean).join(' · ')}</p>
    {edu.description && <p className="resume-description">{edu.description}</p>}
  </article>)}</ResumeSection>;
}

export function WorkSection({ data }: { data: ResumeData }) {
  if (!data.workExperience.length) return null;
  return <ResumeSection title="工作经历">{data.workExperience.map(exp => <article className="resume-entry" key={exp.id}>
    <EntryHeading title={exp.companyName} start={exp.startDate} end={exp.endDate} current={exp.isCurrent} />
    <p className="resume-entry-subtitle">{[exp.position, exp.city].filter(Boolean).join(' · ')}</p>
    {exp.description && <p className="resume-description">{exp.description}</p>}
    {exp.highlights.length > 0 && <ul className="resume-highlights">{exp.highlights.map((h, i) => <li key={i}>{h}</li>)}</ul>}
  </article>)}</ResumeSection>;
}

export function ProjectsSection({ data }: { data: ResumeData }) {
  if (!data.projects.length) return null;
  return <ResumeSection title="项目经历">{data.projects.map(proj => <article className="resume-entry" key={proj.id}>
    <EntryHeading title={proj.projectName} start={proj.startDate} end={proj.endDate} current={proj.isCurrent} />
    {proj.role && <p className="resume-entry-subtitle">{proj.role}</p>}
    {proj.description && <p className="resume-description">{proj.description}</p>}
    {proj.techStack.length > 0 && <p className="resume-meta resume-tech">技术栈：{proj.techStack.join(' · ')}</p>}
    {proj.url && <p className="resume-meta resume-link">{proj.url}</p>}
  </article>)}</ResumeSection>;
}

export function SkillsSection({ data }: { data: ResumeData }) {
  if (!data.skills.length) return null;
  const groups = data.skills.reduce<Record<string, typeof data.skills>>((all, skill) => {
    (all[skill.category || '其他'] ??= []).push(skill);
    return all;
  }, {});
  return <ResumeSection title="专业技能"><div className="resume-skill-groups">{Object.entries(groups).map(([name, skills]) => <div key={name} className="resume-skill-group">
    {Object.keys(groups).length > 1 && <h3 className="resume-skill-category">{name}</h3>}
    <div className="resume-skill-list">{skills.map(skill => <span key={skill.id}>{skill.skillName}{skill.level && <span className="resume-skill-level"> / {skill.level}</span>}</span>)}</div>
  </div>)}</div></ResumeSection>;
}

export function CertificatesSection({ data }: { data: ResumeData }) {
  if (!data.certificates.length) return null;
  return <ResumeSection title="证书奖项">{data.certificates.map(cert => <p className="resume-detail" key={cert.id}>{[cert.name, cert.issuer, cert.date && formatMonth(cert.date)].filter(Boolean).join(' · ')}</p>)}</ResumeSection>;
}

export function LanguagesSection({ data }: { data: ResumeData }) {
  if (!data.languages.length) return null;
  return <ResumeSection title="语言能力">{data.languages.map(lang => <p className="resume-detail" key={lang.id}>{[lang.language, lang.level, lang.score].filter(Boolean).join(' · ')}</p>)}</ResumeSection>;
}

export function SocialSection({ data }: { data: ResumeData }) {
  if (!data.socialLinks.length) return null;
  return <ResumeSection title="社交链接">{data.socialLinks.map(link => <p className="resume-detail resume-link" key={link.id}>{link.platform && `${link.platform}：`}{link.url}</p>)}</ResumeSection>;
}

export function SummarySection({ data }: { data: ResumeData }) {
  return data.selfEvaluation ? <ResumeSection title="自我评价"><p className="resume-description">{data.selfEvaluation}</p></ResumeSection> : null;
}
