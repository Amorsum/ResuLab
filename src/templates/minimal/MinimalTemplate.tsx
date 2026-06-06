import type { ResumeData } from '../../types/resume';
import { formatDateRange } from '../../utils/dateFormat';

interface Props { data: ResumeData; }

export default function MinimalTemplate({ data }: Props) {
  const { personalInfo: p, jobIntention: j, education, workExperience, projects, skills, certificates, languages, selfEvaluation, socialLinks } = data;

  return (
    <div className="font-sans text-[14px] leading-[1.7] text-gray-900 px-12 py-10" style={{ minHeight: '1123px' }}>
      {/* ========== 头部：姓名居中 ========== */}
      <header className="text-center mb-10">
        {p.fullName && <h1 className="text-[30px] font-light tracking-[4px] text-gray-900 mb-2">{p.fullName}</h1>}
        {(p.jobTitle || j.desiredPosition) && (
          <p className="text-[15px] text-gray-500 font-light tracking-wide">
            {j.desiredPosition || p.jobTitle}
            {p.yearsOfExperience ? ` · ${p.yearsOfExperience}年经验` : ''}
          </p>
        )}

        {/* 联系方式一行 */}
        <div className="flex justify-center flex-wrap gap-x-5 gap-y-1 mt-4 text-[13px] text-gray-400 font-light">
          {p.phone && <span>{p.phone}</span>}
          {p.email && <span>{p.email}</span>}
          {p.city && <span>{p.city}</span>}
          {p.gender && <span>{p.gender}</span>}
          {p.birthYear && <span>{p.birthYear}年{p.birthMonth}月</span>}
        </div>

        {/* 求职意向 */}
        {(j.desiredCity || j.expectedSalary || j.jobType) && (
          <div className="flex justify-center flex-wrap gap-x-4 gap-y-1 mt-2 text-[13px] text-gray-400 font-light">
            {j.desiredCity && <span>期望城市：{j.desiredCity}</span>}
            {j.expectedSalary && <span>期望薪资：{j.expectedSalary}</span>}
            {j.jobType && <span>工作类型：{j.jobType}</span>}
          </div>
        )}
      </header>

      {/* ========== 教育背景 ========== */}
      {education.length > 0 && (
        <MinimalSection title="教育背景">
          {education.map((edu) => (
            <div key={edu.id} className="mb-3">
              <div className="flex justify-between items-baseline">
                <span className="font-medium text-[15px]">{edu.schoolName}</span>
                <span className="text-[13px] text-gray-400">{formatDateRange(edu.startDate, edu.endDate, edu.isCurrent)}</span>
              </div>
              <p className="text-[13px] text-gray-500">{edu.degree} · {edu.major}{edu.gpa ? ` · GPA ${edu.gpa}` : ''}</p>
              {edu.description && <p className="text-[13px] text-gray-400 mt-0.5">{edu.description}</p>}
            </div>
          ))}
        </MinimalSection>
      )}

      {/* ========== 工作经历 ========== */}
      {workExperience.length > 0 && (
        <MinimalSection title="工作经历">
          {workExperience.map((exp) => (
            <div key={exp.id} className="mb-4">
              <div className="flex justify-between items-baseline">
                <div>
                  <span className="font-medium text-[15px]">{exp.companyName}</span>
                  <span className="text-[13px] text-gray-500 ml-2">{exp.position}</span>
                </div>
                <span className="text-[13px] text-gray-400">{formatDateRange(exp.startDate, exp.endDate, exp.isCurrent)}</span>
              </div>
              {exp.city && <p className="text-[12px] text-gray-400">{exp.city}</p>}
              {exp.description && <p className="text-[13px] text-gray-600 mt-1 whitespace-pre-line">{exp.description}</p>}
              {exp.highlights.length > 0 && (
                <ul className="mt-1 space-y-0.5">
                  {exp.highlights.map((h, i) => (
                    <li key={i} className="text-[13px] text-gray-600">— {h}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </MinimalSection>
      )}

      {/* ========== 项目经历 ========== */}
      {projects.length > 0 && (
        <MinimalSection title="项目经历">
          {projects.map((proj) => (
            <div key={proj.id} className="mb-3">
              <div className="flex justify-between items-baseline">
                <div>
                  <span className="font-medium text-[15px]">{proj.projectName}</span>
                  <span className="text-[13px] text-gray-500 ml-2">{proj.role}</span>
                </div>
                <span className="text-[13px] text-gray-400">{formatDateRange(proj.startDate, proj.endDate, proj.isCurrent)}</span>
              </div>
              {proj.description && <p className="text-[13px] text-gray-600 mt-1">{proj.description}</p>}
              {proj.techStack.length > 0 && (
                <p className="text-[12px] text-gray-400 mt-1">{proj.techStack.join(' · ')}</p>
              )}
            </div>
          ))}
        </MinimalSection>
      )}

      {/* ========== 技能 ========== */}
      {skills.length > 0 && (
        <MinimalSection title="技能">
          <div className="flex flex-wrap gap-x-6 gap-y-1">
            {skills.map((s) => (
              <span key={s.id} className="text-[13px] text-gray-600">
                {s.skillName} <span className="text-gray-400 text-[12px]">({s.level})</span>
              </span>
            ))}
          </div>
        </MinimalSection>
      )}

      {/* ========== 证书 + 语言 + 社交 ========== */}
      {(certificates.length > 0 || languages.length > 0 || socialLinks.length > 0) && (
        <MinimalSection title="其他信息">
          <div className="space-y-1 text-[13px] text-gray-600">
            {certificates.map((c) => (
              <p key={c.id}>{c.name}{c.issuer ? ` — ${c.issuer}` : ''}{c.date ? ` (${c.date})` : ''}</p>
            ))}
            {languages.map((l) => (
              <p key={l.id}>{l.language}: {l.level}{l.score ? ` (${l.score})` : ''}</p>
            ))}
            {socialLinks.map((sl) => (
              <p key={sl.id}>{sl.platform}: {sl.url}</p>
            ))}
          </div>
        </MinimalSection>
      )}

      {/* ========== 自我评价 ========== */}
      {selfEvaluation && (
        <MinimalSection title="自我评价">
          <p className="text-[13px] text-gray-600 whitespace-pre-line">{selfEvaluation}</p>
        </MinimalSection>
      )}
    </div>
  );
}

function MinimalSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <h3 className="text-[11px] font-medium uppercase tracking-[3px] text-gray-400 mb-3">
        {title}
      </h3>
      <hr className="border-gray-200 mb-3" />
      {children}
    </section>
  );
}
