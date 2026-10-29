import type { ResumeData } from '../../types/resume';
import { resumeStyle, ResumeHeader, EducationSection, WorkSection, ProjectsSection, SkillsSection, CertificatesSection, LanguagesSection, SocialSection, SummarySection } from '../ResumeParts';

export default function ModernTemplate({ data }: { data: ResumeData }) {
  return <div className="resume-sheet resume-modern" style={resumeStyle(data)}>
    <ResumeHeader data={data} />
    <EducationSection data={data} /><WorkSection data={data} /><ProjectsSection data={data} />
    <SkillsSection data={data} /><CertificatesSection data={data} /><LanguagesSection data={data} />
    <SocialSection data={data} /><SummarySection data={data} />
  </div>;
}
