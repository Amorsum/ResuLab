import { useResume } from '../../hooks/useResume';
import FormSection from './FormSection';
import PersonalInfoSection from './sections/PersonalInfoSection';
import JobIntentionSection from './sections/JobIntentionSection';
import EducationSection from './sections/EducationSection';
import WorkExperienceSection from './sections/WorkExperienceSection';
import ProjectSection from './sections/ProjectSection';
import SkillSection from './sections/SkillSection';
import CertificateSection from './sections/CertificateSection';
import LanguageSection from './sections/LanguageSection';
import SelfEvalSection from './sections/SelfEvalSection';
import SocialLinkSection from './sections/SocialLinkSection';

export function FormPanel() {
  const { resume, resetAll } = useResume();

  const handleReset = () => {
    if (window.confirm('确定要清空所有填写内容吗？此操作不可恢复。')) {
      resetAll();
    }
  };

  return (
    <div id="form-panel" className="h-full flex flex-col bg-white border-r border-gray-200">
      {/* 顶部标题栏 */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
        <div>
          <h2 className="font-bold text-gray-800">简历信息填写</h2>
          <p className="text-xs text-gray-400 mt-0.5 hidden sm:block">
            上次保存：{new Date(resume.lastModified).toLocaleString('zh-CN')}
          </p>
        </div>
        <button onClick={handleReset} className="btn-ghost text-sm text-red-500 hover:text-red-700">
          重置
        </button>
      </div>

      {/* 可滚动的表单区域 */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1">
        <FormSection title="基本信息" defaultOpen>
          <PersonalInfoSection />
        </FormSection>

        <FormSection title="求职意向">
          <JobIntentionSection />
        </FormSection>

        <FormSection
          title="教育背景"
          onAdd={() => { /* triggered by ArrayField */ }}
          itemCount={resume.education.length}
        >
          <EducationSection />
        </FormSection>

        <FormSection
          title="工作经历"
          itemCount={resume.workExperience.length}
        >
          <WorkExperienceSection />
        </FormSection>

        <FormSection
          title="项目经历"
          itemCount={resume.projects.length}
        >
          <ProjectSection />
        </FormSection>

        <FormSection
          title="技能特长"
          itemCount={resume.skills.length}
        >
          <SkillSection />
        </FormSection>

        <FormSection
          title="证书奖项"
          itemCount={resume.certificates.length}
          defaultOpen={false}
        >
          <CertificateSection />
        </FormSection>

        <FormSection
          title="语言能力"
          itemCount={resume.languages.length}
          defaultOpen={false}
        >
          <LanguageSection />
        </FormSection>

        <FormSection title="自我评价">
          <SelfEvalSection />
        </FormSection>

        <FormSection
          title="社交链接"
          itemCount={resume.socialLinks.length}
          defaultOpen={false}
        >
          <SocialLinkSection />
        </FormSection>

        {/* 底部留白 */}
        <div className="h-8" />
      </div>
    </div>
  );
}
