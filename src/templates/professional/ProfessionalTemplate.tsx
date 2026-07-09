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

export default function ProfessionalTemplate({ data }: Props) {
  const { personalInfo: p, jobIntention: j, education, workExperience, projects, skills, certificates, languages, selfEvaluation, socialLinks } = data;
  const accent = data.accentColor || '#1f2937';
  const ff = FONT_FAMILY[data.fontFamily] || FONT_FAMILY.yahei;
  const mg = calcMargin(data.pageMargin);

  // Skills grouped by category — no progress bars, text only for ATS
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
      {/* ========== 头部：姓名 + 联系方式 + 照片 + 求职意向 ========== */}
      <header className="mb-8">
        <div className="flex justify-between items-start gap-4">
          <div className="flex-1 min-w-0">
            {p.fullName && (
              <h1 className="font-bold tracking-wide" style={{ color: accent, fontSize: '1.5em' }}>
                {p.fullName}
              </h1>
            )}
            {(p.jobTitle || j.desiredPosition) && (
              <p className="text-gray-600 mt-0.5" style={{ fontSize: '1em' }}>
                {j.desiredPosition || p.jobTitle}
                {p.yearsOfExperience ? ` · ${p.yearsOfExperience}年经验` : ''}
              </p>
            )}
          </div>

          {/* 证件照 (3:4, max 120px height) */}
          {p.avatar && (
            <div className="flex-shrink-0" style={{ width: '90px', height: '120px' }}>
              <img
                src={p.avatar}
                alt={p.fullName || '照片'}
                className="w-full h-full object-cover border border-gray-200"
                style={{ objectFit: 'cover' }}
              />
            </div>
          )}
        </div>

        {/* 联系方式 */}
        {(p.phone || p.email || p.city || p.gender || p.birthYear) && (
          <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-3 text-gray-500" style={{ fontSize: '0.85em' }}>
            {p.phone && <span>📱 {p.phone}</span>}
            {p.email && <span>📧 {p.email}</span>}
            {p.city && <span>{p.city}</span>}
            {p.gender && <span>{p.gender}</span>}
            {p.birthYear && <span>{p.birthYear}年{p.birthMonth}月</span>}
          </div>
        )}
      </header>

      {/* ========== 求职意向——独立一行 ========== */}
      {(j.desiredCity || j.expectedSalary || j.jobType) && (
        <section className="mb-6">
          <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-gray-500" style={{ fontSize: '0.85em' }}>
            {j.desiredCity && <span>意向城市：{j.desiredCity}</span>}
            {j.expectedSalary && <span>期望薪资：{j.expectedSalary}</span>}
            {j.jobType && <span>工作类型：{j.jobType}</span>}
            {j.availableDate && <span>到岗时间：{j.availableDate}</span>}
          </div>
        </section>
      )}

      {/* ========== 自我评价（如已填写，放在前面作为摘要） ========== */}
      {selfEvaluation && (
        <ProSection accent={accent} title="自我评价">
          <p className="text-gray-600 whitespace-pre-line" style={{ fontSize: '0.93em' }}>{selfEvaluation}</p>
        </ProSection>
      )}

      {/* ========== 工作经历 ========== */}
      {workExperience.length > 0 && (
        <ProSection accent={accent} title="工作经验">
          {workExperience.map((exp) => (
            <div key={exp.id} className="mb-4">
              <div className="flex justify-between items-baseline">
                <div>
                  <span className="font-semibold" style={{ fontSize: '1.07em' }}>{exp.companyName}</span>
                  <span className="text-gray-600 ml-2" style={{ fontSize: '0.93em' }}>{exp.position}</span>
                </div>
                <span className="text-gray-400 flex-shrink-0 ml-3" style={{ fontSize: '0.85em' }}>
                  {formatDateRange(exp.startDate, exp.endDate, exp.isCurrent)}
                </span>
              </div>
              {exp.city && <p className="text-gray-400 mt-0.5" style={{ fontSize: '0.85em' }}>{exp.city}</p>}
              {exp.description && (
                <p className="text-gray-600 mt-1 whitespace-pre-line" style={{ fontSize: '0.93em' }}>{exp.description}</p>
              )}
              {exp.highlights.length > 0 && (
                <ul className="mt-1 space-y-0.5 list-disc list-inside text-gray-600" style={{ fontSize: '0.93em' }}>
                  {exp.highlights.map((h, i) => (
                    <li key={i}>{h}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </ProSection>
      )}

      {/* ========== 项目经历 ========== */}
      {projects.length > 0 && (
        <ProSection accent={accent} title="项目经历">
          {projects.map((proj) => (
            <div key={proj.id} className="mb-3">
              <div className="flex justify-between items-baseline">
                <div>
                  <span className="font-semibold" style={{ fontSize: '1.07em' }}>{proj.projectName}</span>
                  <span className="text-gray-600 ml-2" style={{ fontSize: '0.93em' }}>{proj.role}</span>
                </div>
                <span className="text-gray-400 flex-shrink-0 ml-3" style={{ fontSize: '0.85em' }}>
                  {formatDateRange(proj.startDate, proj.endDate, proj.isCurrent)}
                </span>
              </div>
              {proj.description && (
                <p className="text-gray-600 mt-1" style={{ fontSize: '0.93em' }}>{proj.description}</p>
              )}
              {proj.techStack.length > 0 && (
                <p className="text-gray-400 mt-1" style={{ fontSize: '0.85em' }}>
                  技术栈：{proj.techStack.join(' · ')}
                </p>
              )}
              {proj.url && (
                <a href={proj.url} target="_blank" rel="noopener noreferrer"
                  className="text-gray-400 mt-0.5 inline-block" style={{ fontSize: '0.85em' }}>
                  {proj.url}
                </a>
              )}
            </div>
          ))}
        </ProSection>
      )}

      {/* ========== 教育背景 ========== */}
      {education.length > 0 && (
        <ProSection accent={accent} title="教育背景">
          {education.map((edu) => (
            <div key={edu.id} className="mb-3">
              <div className="flex justify-between items-baseline">
                <span className="font-semibold" style={{ fontSize: '1.07em' }}>{edu.schoolName}</span>
                <span className="text-gray-400 flex-shrink-0 ml-3" style={{ fontSize: '0.85em' }}>
                  {formatDateRange(edu.startDate, edu.endDate, edu.isCurrent)}
                </span>
              </div>
              <p className="text-gray-600" style={{ fontSize: '0.93em' }}>
                {edu.degree}{edu.major ? ` · ${edu.major}` : ''}{edu.gpa ? ` · GPA ${edu.gpa}` : ''}
              </p>
              {edu.description && (
                <p className="text-gray-500 mt-0.5" style={{ fontSize: '0.85em' }}>{edu.description}</p>
              )}
            </div>
          ))}
        </ProSection>
      )}

      {/* ========== 技能特长（文字列表，无进度条） ========== */}
      {skills.length > 0 && (
        <ProSection accent={accent} title="技能特长">
          <div className="space-y-1.5">
            {Object.entries(skillGroups).map(([cat, items]) => (
              <div key={cat}>
                <span className="text-gray-500 mr-2" style={{ fontSize: '0.85em' }}>
                  {Object.keys(skillGroups).length > 1 ? `${cat}：` : ''}
                </span>
                {items.map((s) => (
                  <span key={s.id} className="text-gray-600 mr-3" style={{ fontSize: '0.93em' }}>
                    {s.skillName}{s.level ? ` (${s.level})` : ''}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </ProSection>
      )}

      {/* ========== 证书 + 语言 ========== */}
      {(certificates.length > 0 || languages.length > 0) && (
        <ProSection accent={accent} title="证书 & 语言">
          <div className="space-y-1" style={{ fontSize: '0.93em' }}>
            {certificates.map((c) => (
              <p key={c.id} className="text-gray-600">
                {c.name}{c.issuer ? ` — ${c.issuer}` : ''}{c.date ? ` (${c.date})` : ''}
              </p>
            ))}
            {languages.map((l) => (
              <p key={l.id} className="text-gray-600">
                {l.language}：{l.level}{l.score ? ` (${l.score})` : ''}
              </p>
            ))}
          </div>
        </ProSection>
      )}

      {/* ========== 社交链接 ========== */}
      {socialLinks.length > 0 && (
        <ProSection accent={accent} title="社交链接">
          <div className="flex flex-wrap gap-x-4 gap-y-1" style={{ fontSize: '0.85em' }}>
            {socialLinks.map((sl) => (
              <span key={sl.id} className="text-gray-500">{sl.platform}：{sl.url}</span>
            ))}
          </div>
        </ProSection>
      )}
    </div>
  );
}

/** ATS-friendly section: plain heading + underline, no icons, no sidebars */
function ProSection({ title, accent, children }: { title: string; accent: string; children: React.ReactNode }) {
  return (
    <section className="mb-5">
      <h3
        className="font-semibold tracking-wide mb-2 pb-1"
        style={{
          color: accent,
          fontSize: '1.07em',
          borderBottom: `1.5px solid ${accent}40`,
          textTransform: 'uppercase',
        }}
      >
        {title}
      </h3>
      {children}
    </section>
  );
}
