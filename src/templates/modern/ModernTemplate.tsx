import type { ResumeData } from '../../types/resume';
import { formatDateRange } from '../../utils/dateFormat';

interface Props { data: ResumeData; }

export default function ModernTemplate({ data }: Props) {
  const { personalInfo: p, jobIntention: j, education, workExperience, projects, skills, certificates, languages, selfEvaluation, socialLinks } = data;
  const accent = data.accentColor || '#4f46e5';

  return (
    <div className="font-sans text-[14px] leading-relaxed text-gray-800" style={{ minHeight: '1123px' }}>
      {/* ========== 头部横幅 ========== */}
      <div className="text-white px-10 py-8" style={{ backgroundColor: accent }}>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            {p.fullName && <h1 className="text-[32px] font-bold tracking-wide mb-1">{p.fullName}</h1>}
            {(p.jobTitle || j.desiredPosition) && (
              <p className="text-[16px] text-indigo-200">
                {j.desiredPosition || p.jobTitle}
                {p.yearsOfExperience ? ` · ${p.yearsOfExperience}年经验` : ''}
              </p>
            )}
          </div>
          {p.avatar && (
            <img src={p.avatar} alt={p.fullName}
              className="w-[72px] h-[96px] rounded-lg object-cover border-2 border-white/30 flex-shrink-0" />
          )}
        </div>

        {/* 联系方式行 */}
        <div className="flex flex-wrap gap-x-6 gap-y-1 mt-4 text-[13px] text-indigo-100">
          {p.phone && <span>📱 {p.phone}</span>}
          {p.email && <span>✉️ {p.email}</span>}
          {p.city && <span>📍 {p.city}</span>}
          {p.gender && <span>{p.gender}</span>}
          {p.birthYear && <span>{p.birthYear}年{p.birthMonth}月生</span>}
        </div>

        {/* 求职意向标签 */}
        {(j.desiredCity || j.expectedSalary || j.jobType) && (
          <div className="flex flex-wrap gap-2 mt-3">
            {j.desiredCity && <span className="text-[12px] px-2.5 py-0.5 bg-white/20 rounded-full">📍 {j.desiredCity}</span>}
            {j.expectedSalary && <span className="text-[12px] px-2.5 py-0.5 bg-white/20 rounded-full">💰 {j.expectedSalary}</span>}
            {j.jobType && <span className="text-[12px] px-2.5 py-0.5 bg-white/20 rounded-full">💼 {j.jobType}</span>}
            {j.availableDate && <span className="text-[12px] px-2.5 py-0.5 bg-white/20 rounded-full">📅 {j.availableDate}</span>}
          </div>
        )}
      </div>

      {/* ========== 主体内容 ========== */}
      <div className="px-10 py-6 space-y-5">
        {/* 教育背景 */}
        {education.length > 0 && (
          <ModernSection title="教育背景" accent={accent}>
            {education.map((edu) => (
              <div key={edu.id} className="mb-3">
                <div className="flex justify-between items-baseline">
                  <span className="font-semibold text-[15px]">{edu.schoolName}</span>
                  <span className="text-[12px] text-gray-400">{formatDateRange(edu.startDate, edu.endDate, edu.isCurrent)}</span>
                </div>
                <p className="text-[13px] text-gray-500">{edu.degree} · {edu.major}{edu.gpa ? ` · GPA ${edu.gpa}` : ''}</p>
                {edu.description && <p className="text-[13px] text-gray-500 mt-1">{edu.description}</p>}
              </div>
            ))}
          </ModernSection>
        )}

        {/* 工作经历 */}
        {workExperience.length > 0 && (
          <ModernSection title="工作经历" accent={accent}>
            {workExperience.map((exp) => (
              <div key={exp.id} className="mb-4">
                <div className="flex justify-between items-baseline">
                  <div>
                    <span className="font-semibold text-[15px]">{exp.companyName}</span>
                    <span className="text-[13px] text-gray-500 ml-2">{exp.position}</span>
                  </div>
                  <span className="text-[12px] text-gray-400">{formatDateRange(exp.startDate, exp.endDate, exp.isCurrent)}</span>
                </div>
                {exp.city && <p className="text-[12px] text-gray-400">{exp.city}</p>}
                {exp.description && <p className="text-[13px] text-gray-600 mt-1 whitespace-pre-line">{exp.description}</p>}
                {exp.highlights.length > 0 && (
                  <ul className="mt-1.5 space-y-0.5">
                    {exp.highlights.map((h, i) => (
                      <li key={i} className="text-[13px] text-gray-600 flex gap-2">
                        <span className="text-[#f97316]">▸</span> {h}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </ModernSection>
        )}

        {/* 项目经历 */}
        {projects.length > 0 && (
          <ModernSection title="项目经历" accent={accent}>
            {projects.map((proj) => (
              <div key={proj.id} className="mb-3">
                <div className="flex justify-between items-baseline">
                  <div>
                    <span className="font-semibold text-[15px]">{proj.projectName}</span>
                    <span className="text-[13px] text-gray-500 ml-2">{proj.role}</span>
                  </div>
                  <span className="text-[12px] text-gray-400">{formatDateRange(proj.startDate, proj.endDate, proj.isCurrent)}</span>
                </div>
                {proj.description && <p className="text-[13px] text-gray-600 mt-1">{proj.description}</p>}
                {proj.techStack.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {proj.techStack.map((t) => (
                      <span key={t} className="text-[11px] px-2 py-0.5 rounded-full font-medium"
                        style={{ backgroundColor: `${accent}18`, color: accent }}>{t}</span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </ModernSection>
        )}

        {/* 技能 + 证书 + 语言 三栏 */}
        {(skills.length > 0 || certificates.length > 0 || languages.length > 0) && (
          <div className="grid grid-cols-3 gap-6">
            {skills.length > 0 && (
              <div>
                <ModernSection title="技能" accent="#f97316">
                  <div className="space-y-1.5">
                    {skills.map((s) => (
                      <div key={s.id} className="flex justify-between text-[13px]">
                        <span className="text-gray-700">{s.skillName}</span>
                        <span className="text-gray-400 text-[12px]">{s.level}</span>
                      </div>
                    ))}
                  </div>
                </ModernSection>
              </div>
            )}
            {certificates.length > 0 && (
              <div>
                <ModernSection title="证书奖项" accent="#f97316">
                  <div className="space-y-1.5">
                    {certificates.map((c) => (
                      <p key={c.id} className="text-[13px] text-gray-600">{c.name}{c.issuer ? ` - ${c.issuer}` : ''}</p>
                    ))}
                  </div>
                </ModernSection>
              </div>
            )}
            {languages.length > 0 && (
              <div>
                <ModernSection title="语言能力" accent="#f97316">
                  <div className="space-y-1.5">
                    {languages.map((l) => (
                      <div key={l.id} className="flex justify-between text-[13px]">
                        <span className="text-gray-700">{l.language}</span>
                        <span className="text-gray-400 text-[12px]">{l.level}{l.score ? ` (${l.score})` : ''}</span>
                      </div>
                    ))}
                  </div>
                </ModernSection>
              </div>
            )}
          </div>
        )}

        {/* 社交链接 */}
        {socialLinks.length > 0 && (
          <ModernSection title="社交链接" accent={accent}>
            <div className="flex flex-wrap gap-x-6 gap-y-1">
              {socialLinks.map((sl) => (
                <span key={sl.id} className="text-[13px] text-gray-600">{sl.platform}: {sl.url}</span>
              ))}
            </div>
          </ModernSection>
        )}

        {/* 自我评价 */}
        {selfEvaluation && (
          <ModernSection title="自我评价" accent={accent}>
            <p className="text-[13px] text-gray-600 whitespace-pre-line">{selfEvaluation}</p>
          </ModernSection>
        )}
      </div>
    </div>
  );
}

function ModernSection({ title, accent, children }: { title: string; accent: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-[13px] font-bold text-gray-800 mb-2 flex items-center gap-2">
        <span className="w-1 h-4 rounded-full inline-block" style={{ backgroundColor: accent }} />
        {title}
      </h3>
      {children}
    </div>
  );
}
