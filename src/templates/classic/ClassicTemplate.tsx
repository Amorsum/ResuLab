import type { ResumeData } from '../../types/resume';
import { resumeStyle, ResumeHeader, ResumeContacts, ResumeSection, EducationSection, WorkSection, ProjectsSection, SkillsSection, CertificatesSection, LanguagesSection, SocialSection, SummarySection } from '../ResumeParts';

export default function ClassicTemplate({ data }: { data: ResumeData }) {
  const p = data.personalInfo;
  const hasContacts = Boolean(p.phone || p.email || p.city || p.gender || p.birthYear);
  const sidebar = Boolean(p.avatar || hasContacts || data.skills.length || data.languages.length || data.socialLinks.length);
  return <div className="resume-sheet resume-classic" style={resumeStyle(data)}>
    {sidebar && <aside className="resume-sidebar">
      {p.avatar && <img className="resume-photo" src={p.avatar} alt={p.fullName ? `${p.fullName}的证件照` : '证件照'} />}
      {hasContacts && <ResumeSection title="基本信息"><ResumeContacts data={data} stacked /></ResumeSection>}
      <SkillsSection data={data} /><LanguagesSection data={data} /><SocialSection data={data} />
    </aside>}
    <main className="resume-main">
      <ResumeHeader data={data} photo={false} contacts={false} />
      <EducationSection data={data} /><WorkSection data={data} /><ProjectsSection data={data} />
      <CertificatesSection data={data} /><SummarySection data={data} />
    </main>
  </div>;
}
