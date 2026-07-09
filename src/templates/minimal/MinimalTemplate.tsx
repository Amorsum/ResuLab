import type { ResumeData } from '../../types/resume';
import { formatDateRange } from '../../utils/dateFormat';

interface Props { data: ResumeData; }

const FONT_FAMILY: Record<string, string> = {
  songti: '"SimSun", "宋体", serif',
  yahei: '"Microsoft YaHei", "微软雅黑", sans-serif',
  kaiti: '"KaiTi", "楷体", serif',
  fangsong: '"FangSong", "仿宋", serif',
};

function calcMargin(v: number) {
  return { x: Math.round(v * 2.8 + 10), y: Math.round(v * 2.8 + 22) };
}

export default function MinimalTemplate({ data }: Props) {
  const { personalInfo: p, jobIntention: j, education, workExperience, projects, skills, certificates, languages, selfEvaluation, socialLinks } = data;
  const accent = data.accentColor || '#1f2937';
  const ff = FONT_FAMILY[data.fontFamily] || FONT_FAMILY.yahei;
  const mg = calcMargin(data.pageMargin);

  // 按类别分组技能
  const skillGroups = skills.reduce<Record<string, typeof skills>>((acc, s) => {
    const cat = s.category || '其他';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(s);
    return acc;
  }, {});

  return (
    <div className="text-gray-900" style={{
      fontFamily: ff,
      fontSize: `${data.fontSize}px`,
      lineHeight: `${data.lineHeight}px`,
      padding: `${mg.y}px ${mg.x}px`,
    }}>
      {/* ========== 头部：姓名居中 ========== */}
      <header className="text-center mb-10">
        {p.fullName && <h1 className="font-light tracking-[4px] mb-2" style={{ color: accent, fontSize: '2.14em' }}>{p.fullName}</h1>}
        {(p.jobTitle || j.desiredPosition) && (
          <p className="text-gray-500 font-light tracking-wide" style={{ fontSize: '1.07em' }}>
            {j.desiredPosition || p.jobTitle}
            {p.yearsOfExperience ? ` · ${p.yearsOfExperience}年经验` : ''}
          </p>
        )}

        {/* 联系方式一行 */}
        <div className="flex justify-center flex-wrap gap-x-5 gap-y-1 mt-4 text-gray-400 font-light" style={{ fontSize: '0.93em' }}>
          {p.phone && <span>{p.phone}</span>}
          {p.email && <span>{p.email}</span>}
          {p.city && <span>{p.city}</span>}
          {p.gender && <span>{p.gender}</span>}
          {p.birthYear && <span>{p.birthYear}年{p.birthMonth}月</span>}
        </div>

        {/* 求职意向 */}
        {(j.desiredCity || j.expectedSalary || j.jobType) && (
          <div className="flex justify-center flex-wrap gap-x-4 gap-y-1 mt-2 text-gray-400 font-light" style={{ fontSize: '0.93em' }}>
            {j.desiredCity && <span>期望城市：{j.desiredCity}</span>}
            {j.expectedSalary && <span>期望薪资：{j.expectedSalary}</span>}
            {j.jobType && <span>工作类型：{j.jobType}</span>}
          </div>
        )}
      </header>

      {/* ========== 教育背景 ========== */}
      {education.length > 0 && (
        <MinimalSection accent={accent} title="教育背景">
          {education.map((edu) => (
            <div key={edu.id} className="mb-3">
              <div className="flex justify-between items-baseline">
                <span className="font-medium" style={{ fontSize: '1.07em' }}>{edu.schoolName}</span>
                <span className="text-gray-400" style={{ fontSize: '0.93em' }}>{formatDateRange(edu.startDate, edu.endDate, edu.isCurrent)}</span>
              </div>
              <p className="text-gray-500" style={{ fontSize: '0.93em' }}>{edu.degree} · {edu.major}{edu.gpa ? ` · GPA ${edu.gpa}` : ''}</p>
              {edu.description && <p className="text-gray-400 mt-0.5" style={{ fontSize: '0.93em' }}>{edu.description}</p>}
            </div>
          ))}
        </MinimalSection>
      )}

      {/* ========== 工作经历 ========== */}
      {workExperience.length > 0 && (
        <MinimalSection accent={accent} title="工作经历">
          {workExperience.map((exp) => (
            <div key={exp.id} className="mb-4">
              <div className="flex justify-between items-baseline">
                <div>
                  <span className="font-medium" style={{ fontSize: '1.07em' }}>{exp.companyName}</span>
                  <span className="text-gray-500 ml-2" style={{ fontSize: '0.93em' }}>{exp.position}</span>
                </div>
                <span className="text-gray-400" style={{ fontSize: '0.93em' }}>{formatDateRange(exp.startDate, exp.endDate, exp.isCurrent)}</span>
              </div>
              {exp.city && <p className="text-gray-400" style={{ fontSize: '0.85em' }}>{exp.city}</p>}
              {exp.description && <p className="text-gray-600 mt-1 whitespace-pre-line" style={{ fontSize: '0.93em' }}>{exp.description}</p>}
              {exp.highlights.length > 0 && (
                <ul className="mt-1 space-y-0.5">
                  {exp.highlights.map((h, i) => (
                    <li key={i} className="text-gray-600" style={{ fontSize: '0.93em' }}>— {h}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </MinimalSection>
      )}

      {/* ========== 项目经历 ========== */}
      {projects.length > 0 && (
        <MinimalSection accent={accent} title="项目经历">
          {projects.map((proj) => (
            <div key={proj.id} className="mb-3">
              <div className="flex justify-between items-baseline">
                <div>
                  <span className="font-medium" style={{ fontSize: '1.07em' }}>{proj.projectName}</span>
                  <span className="text-gray-500 ml-2" style={{ fontSize: '0.93em' }}>{proj.role}</span>
                </div>
                <span className="text-gray-400" style={{ fontSize: '0.93em' }}>{formatDateRange(proj.startDate, proj.endDate, proj.isCurrent)}</span>
              </div>
              {proj.description && <p className="text-gray-600 mt-1" style={{ fontSize: '0.93em' }}>{proj.description}</p>}
              {proj.techStack.length > 0 && (
                <p className="text-gray-400 mt-1" style={{ fontSize: '0.85em' }}>{proj.techStack.join(' · ')}</p>
              )}
            </div>
          ))}
        </MinimalSection>
      )}

      {/* ========== 技能（按类别分组） ========== */}
      {skills.length > 0 && (
        <MinimalSection accent={accent} title="技能">
          <div className="space-y-2">
            {Object.entries(skillGroups).map(([cat, items]) => (
              <div key={cat}>
                {Object.keys(skillGroups).length > 1 && (
                  <div className="text-gray-400 mb-1" style={{ fontSize: '0.8em' }}>{cat}</div>
                )}
                <div className="flex flex-wrap gap-x-6 gap-y-1">
                  {items.map((s) => (
                    <span key={s.id} className="text-gray-600" style={{ fontSize: '0.93em' }}>
                      {s.skillName} <span className="text-gray-400" style={{ fontSize: '0.9em' }}>({s.level})</span>
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </MinimalSection>
      )}

      {/* ========== 证书 + 语言 + 社交 ========== */}
      {(certificates.length > 0 || languages.length > 0 || socialLinks.length > 0) && (
        <MinimalSection accent={accent} title="其他信息">
          <div className="space-y-1.5 text-gray-600" style={{ fontSize: '0.93em' }}>
            {certificates.map((c) => (
              <p key={c.id}>{c.name}{c.issuer ? ` — ${c.issuer}` : ''}{c.date ? ` (${c.date})` : ''}</p>
            ))}
            {languages.map((l) => (
              <div key={l.id}>
                <p>{l.language}: {l.level}</p>
                {l.score && <p className="text-gray-400" style={{ fontSize: '0.9em' }}>{l.score}</p>}
              </div>
            ))}
            {socialLinks.map((sl) => (
              <p key={sl.id} className="break-all">{sl.platform}: {sl.url}</p>
            ))}
          </div>
        </MinimalSection>
      )}

      {/* ========== 自我评价 ========== */}
      {selfEvaluation && (
        <MinimalSection accent={accent} title="自我评价">
          <p className="text-gray-600 whitespace-pre-line" style={{ fontSize: '0.93em' }}>{selfEvaluation}</p>
        </MinimalSection>
      )}
    </div>
  );
}

function MinimalSection({ title, accent, children }: { title: string; accent: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <h3 className="font-medium uppercase tracking-[3px] mb-3" style={{ color: `${accent}99`, fontSize: '0.78em' }}>
        {title}
      </h3>
      <hr className="mb-3" style={{ borderColor: `${accent}33` }} />
      {children}
    </section>
  );
}
