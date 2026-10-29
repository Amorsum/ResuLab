import type { ResumeData } from '../../types/resume';
import { resumeStyle, ResumeHeader, EducationSection, WorkSection, ProjectsSection, SkillsSection, CertificatesSection, LanguagesSection, SocialSection, SummarySection } from '../ResumeParts';

export default function ProfessionalTemplate({ data }: { data: ResumeData }) {
  return <div className="resume-sheet resume-professional" style={resumeStyle(data)}>
    <ResumeHeader data={data} /><SummarySection data={data} />
    <WorkSection data={data} /><ProjectsSection data={data} /><EducationSection data={data} />
    <SkillsSection data={data} /><CertificatesSection data={data} /><LanguagesSection data={data} /><SocialSection data={data} />
  </div>;
}
