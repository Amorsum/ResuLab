import type { ResumeData } from '../../types/resume';
import { formatMonth, formatDateRange } from '../../utils/dateFormat';

interface Props { data: ResumeData; }

export default function ClassicTemplate({ data }: Props) {
  const { personalInfo: p, jobIntention: j, education, workExperience, projects, skills, certificates, languages, selfEvaluation, socialLinks } = data;

  const showSidebar = p.avatar || p.phone || p.email || p.city || skills.length > 0 || languages.length > 0;

  return (
    <div className="flex font-sans text-[14px] leading-relaxed text-gray-800" style={{ minHeight: '1123px' }}>
      {/* ========== 左侧边栏 ========== */}
      {showSidebar && (
        <div className="w-[230px] bg-[#f0f4f8] px-5 py-8 flex-shrink-0">
          {/* 照片 */}
          {p.avatar && (
            <div className="text-center mb-6">
              <img src={p.avatar} alt={p.fullName}
                className="w-[100px] h-[100px] rounded-full object-cover mx-auto border-2 border-white shadow" />
            </div>
          )}

          {/* 基本信息 */}
          <div className="mb-6">
            <h3 className="text-[11px] font-bold uppercase tracking-[2px] text-[#4a5568] mb-3 border-b border-[#cbd5e0] pb-1">联系方式</h3>
            <div className="space-y-2 text-[13px] text-gray-600">
              {p.phone && <p>📱 {p.phone}</p>}
              {p.email && <p>✉️ {p.email}</p>}
              {p.city && <p>📍 {p.city}</p>}
              {p.birthYear && <p>🎂 {p.birthYear}年{p.birthMonth}月</p>}
            </div>
          </div>

          {/* 技能 */}
          {skills.length > 0 && (
            <div className="mb-6">
              <h3 className="text-[11px] font-bold uppercase tracking-[2px] text-[#4a5568] mb-3 border-b border-[#cbd5e0] pb-1">专业技能</h3>
              <div className="space-y-2">
                {skills.map((s) => (
                  <div key={s.id}>
                    <div className="flex justify-between text-[12px] mb-0.5">
                      <span className="text-gray-700">{s.skillName}</span>
                      <span className="text-gray-400 text-[11px]">{s.level}</span>
                    </div>
                    <div className="h-1 bg-gray-200 rounded-full overflow-hidden">
                      <div className="h-full bg-[#4a5568] rounded-full"
                        style={{ width: s.level === '精通' ? '90%' : s.level === '熟练' ? '70%' : s.level === '掌握' ? '50%' : '30%' }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 语言 */}
          {languages.length > 0 && (
            <div className="mb-6">
              <h3 className="text-[11px] font-bold uppercase tracking-[2px] text-[#4a5568] mb-3 border-b border-[#cbd5e0] pb-1">语言能力</h3>
              <div className="space-y-1.5">
                {languages.map((l) => (
                  <div key={l.id} className="flex justify-between text-[13px]">
                    <span className="text-gray-700">{l.language}</span>
                    <span className="text-gray-400 text-[12px]">{l.level}{l.score ? ` (${l.score})` : ''}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 社交链接 */}
          {socialLinks.length > 0 && (
            <div>
              <h3 className="text-[11px] font-bold uppercase tracking-[2px] text-[#4a5568] mb-3 border-b border-[#cbd5e0] pb-1">社交链接</h3>
              <div className="space-y-1.5 text-[12px]">
                {socialLinks.map((sl) => (
                  <p key={sl.id} className="text-gray-600 truncate">{sl.platform}: {sl.url}</p>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========== 右侧主体 ========== */}
      <div className="flex-1 px-8 py-8">
        {/* 姓名 + 职位 */}
        <div className="mb-6">
          {p.fullName && <h1 className="text-[28px] font-bold text-[#2d3748] tracking-wide mb-1">{p.fullName}</h1>}
          {p.jobTitle && <p className="text-[15px] text-[#4a5568]">{p.jobTitle}{p.yearsOfExperience ? ` | ${p.yearsOfExperience}年经验` : ''}</p>}
          {j.desiredPosition && <p className="text-[13px] text-gray-500 mt-0.5">求职意向：{j.desiredPosition}{j.desiredCity ? ` · ${j.desiredCity}` : ''}{j.expectedSalary ? ` · ${j.expectedSalary}` : ''}</p>}
        </div>

        {/* 教育背景 */}
        {education.length > 0 && (
          <Section title="教育背景">
            {education.map((edu) => (
              <div key={edu.id} className="mb-3">
                <div className="flex justify-between items-baseline">
                  <span className="font-semibold text-[15px] text-gray-800">{edu.schoolName}</span>
                  <span className="text-[12px] text-gray-400">{formatDateRange(edu.startDate, edu.endDate, edu.isCurrent)}</span>
                </div>
                <p className="text-[13px] text-gray-600">{edu.degree} · {edu.major}{edu.gpa ? ` · GPA ${edu.gpa}` : ''}</p>
                {edu.description && <p className="text-[13px] text-gray-500 mt-1">{edu.description}</p>}
              </div>
            ))}
          </Section>
        )}

        {/* 工作经历 */}
        {workExperience.length > 0 && (
          <Section title="工作经历">
            {workExperience.map((exp) => (
              <div key={exp.id} className="mb-4">
                <div className="flex justify-between items-baseline">
                  <span className="font-semibold text-[15px] text-gray-800">{exp.companyName}</span>
                  <span className="text-[12px] text-gray-400">{formatDateRange(exp.startDate, exp.endDate, exp.isCurrent)}</span>
                </div>
                <p className="text-[13px] text-gray-600">{exp.position}{exp.city ? ` · ${exp.city}` : ''}</p>
                {exp.description && <p className="text-[13px] text-gray-500 mt-1 whitespace-pre-line">{exp.description}</p>}
                {exp.highlights.length > 0 && (
                  <ul className="mt-1.5 space-y-0.5">
                    {exp.highlights.map((h, i) => (
                      <li key={i} className="text-[13px] text-gray-600 flex gap-1.5">
                        <span className="text-[#4a5568]">•</span> {h}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </Section>
        )}

        {/* 项目经历 */}
        {projects.length > 0 && (
          <Section title="项目经历">
            {projects.map((proj) => (
              <div key={proj.id} className="mb-3">
                <div className="flex justify-between items-baseline">
                  <span className="font-semibold text-[15px] text-gray-800">{proj.projectName}</span>
                  <span className="text-[12px] text-gray-400">{formatDateRange(proj.startDate, proj.endDate, proj.isCurrent)}</span>
                </div>
                <p className="text-[13px] text-gray-600">{proj.role}</p>
                {proj.description && <p className="text-[13px] text-gray-500 mt-1">{proj.description}</p>}
                {proj.techStack.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {proj.techStack.map((t) => (
                      <span key={t} className="text-[11px] px-2 py-0.5 bg-gray-100 text-gray-600 rounded">{t}</span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </Section>
        )}

        {/* 证书 */}
        {certificates.length > 0 && (
          <Section title="证书奖项">
            <div className="flex flex-wrap gap-x-6 gap-y-1">
              {certificates.map((cert) => (
                <span key={cert.id} className="text-[13px] text-gray-600">
                  {cert.name}{cert.issuer ? `（${cert.issuer}）` : ''}{cert.date ? ` ${formatMonth(cert.date)}` : ''}
                </span>
              ))}
            </div>
          </Section>
        )}

        {/* 自我评价 */}
        {selfEvaluation && (
          <Section title="自我评价">
            <p className="text-[13px] text-gray-600 whitespace-pre-line">{selfEvaluation}</p>
          </Section>
        )}
      </div>
    </div>
  );
}

/** 简历区域小标题 */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <h3 className="text-[13px] font-bold text-[#4a5568] uppercase tracking-[2px] border-b-2 border-[#4a5568] pb-1 mb-3">
        {title}
      </h3>
      {children}
    </div>
  );
}
