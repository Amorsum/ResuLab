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

export default function ModernTemplate({ data }: Props) {
  const { personalInfo: p, jobIntention: j, education, workExperience, projects, skills, certificates, languages, selfEvaluation, socialLinks } = data;
  const accent = data.accentColor || '#4f46e5';
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
    <div className="text-gray-800" style={{
      fontFamily: ff,
      fontSize: `${data.fontSize}px`,
      lineHeight: `${data.lineHeight}px`,
    }}>
      {/* ========== 头部横幅 ========== */}
      <div className="text-white" style={{ backgroundColor: accent, padding: `${mg.y}px ${mg.x}px` }}>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            {p.fullName && <h1 className="font-bold tracking-wide mb-1" style={{ fontSize: '2.29em' }}>{p.fullName}</h1>}
            {(p.jobTitle || j.desiredPosition) && (
              <p className="text-indigo-200" style={{ fontSize: '1.14em' }}>
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
        <div className="flex flex-wrap gap-x-6 gap-y-1 mt-4 text-indigo-100" style={{ fontSize: '0.93em' }}>
          {p.phone && <span>📱 {p.phone}</span>}
          {p.email && <span>✉️ {p.email}</span>}
          {p.city && <span>📍 {p.city}</span>}
          {p.gender && <span>{p.gender}</span>}
          {p.birthYear && <span>{p.birthYear}年{p.birthMonth}月生</span>}
        </div>

        {/* 求职意向标签 */}
        {(j.desiredCity || j.expectedSalary || j.jobType) && (
          <div className="flex flex-wrap gap-2 mt-3">
            {j.desiredCity && <span className="px-2.5 py-0.5 bg-white/20 rounded-full" style={{ fontSize: '0.85em' }}>📍 {j.desiredCity}</span>}
            {j.expectedSalary && <span className="px-2.5 py-0.5 bg-white/20 rounded-full" style={{ fontSize: '0.85em' }}>💰 {j.expectedSalary}</span>}
            {j.jobType && <span className="px-2.5 py-0.5 bg-white/20 rounded-full" style={{ fontSize: '0.85em' }}>💼 {j.jobType}</span>}
            {j.availableDate && <span className="px-2.5 py-0.5 bg-white/20 rounded-full" style={{ fontSize: '0.85em' }}>📅 {j.availableDate}</span>}
          </div>
        )}
      </div>

      {/* ========== 主体内容 ========== */}
      <div className="space-y-5" style={{ padding: `${mg.y}px ${mg.x}px` }}>
        {/* 教育背景 */}
        {education.length > 0 && (
          <ModernSection title="教育背景" accent={accent}>
            {education.map((edu) => (
              <div key={edu.id} className="mb-3">
                <div className="flex justify-between items-baseline">
                  <span className="font-semibold" style={{ fontSize: '1.07em' }}>{edu.schoolName}</span>
                  <span className="text-gray-400" style={{ fontSize: '0.85em' }}>{formatDateRange(edu.startDate, edu.endDate, edu.isCurrent)}</span>
                </div>
                <p className="text-gray-500" style={{ fontSize: '0.93em' }}>{edu.degree} · {edu.major}{edu.gpa ? ` · GPA ${edu.gpa}` : ''}</p>
                {edu.description && <p className="text-gray-500 mt-1" style={{ fontSize: '0.93em' }}>{edu.description}</p>}
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
                    <span className="font-semibold" style={{ fontSize: '1.07em' }}>{exp.companyName}</span>
                    <span className="text-gray-500 ml-2" style={{ fontSize: '0.93em' }}>{exp.position}</span>
                  </div>
                  <span className="text-gray-400" style={{ fontSize: '0.85em' }}>{formatDateRange(exp.startDate, exp.endDate, exp.isCurrent)}</span>
                </div>
                {exp.city && <p className="text-gray-400" style={{ fontSize: '0.85em' }}>{exp.city}</p>}
                {exp.description && <p className="text-gray-600 mt-1 whitespace-pre-line" style={{ fontSize: '0.93em' }}>{exp.description}</p>}
                {exp.highlights.length > 0 && (
                  <ul className="mt-1.5 space-y-0.5">
                    {exp.highlights.map((h, i) => (
                      <li key={i} className="text-gray-600 flex gap-2" style={{ fontSize: '0.93em' }}>
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
                    <span className="font-semibold" style={{ fontSize: '1.07em' }}>{proj.projectName}</span>
                    <span className="text-gray-500 ml-2" style={{ fontSize: '0.93em' }}>{proj.role}</span>
                  </div>
                  <span className="text-gray-400" style={{ fontSize: '0.85em' }}>{formatDateRange(proj.startDate, proj.endDate, proj.isCurrent)}</span>
                </div>
                {proj.description && <p className="text-gray-600 mt-1" style={{ fontSize: '0.93em' }}>{proj.description}</p>}
                {proj.techStack.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {proj.techStack.map((t) => (
                      <span key={t} className="px-2 py-0.5 rounded-full font-medium"
                        style={{ backgroundColor: `${accent}18`, color: accent, fontSize: '0.78em' }}>{t}</span>
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
                  <div className="space-y-2">
                    {Object.entries(skillGroups).map(([cat, items]) => (
                      <div key={cat}>
                        {Object.keys(skillGroups).length > 1 && (
                          <div className="text-gray-400 mb-1" style={{ fontSize: '0.75em' }}>{cat}</div>
                        )}
                        <div className="space-y-1.5">
                          {items.map((s) => (
                            <div key={s.id}>
                              <div className="flex justify-between" style={{ fontSize: '0.93em' }}>
                                <span className="text-gray-700">{s.skillName}</span>
                                <span className="text-gray-400" style={{ fontSize: '0.9em' }}>{s.level}</span>
                              </div>
                            </div>
                          ))}
                        </div>
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
                      <p key={c.id} className="text-gray-600" style={{ fontSize: '0.93em' }}>{c.name}{c.issuer ? ` - ${c.issuer}` : ''}</p>
                    ))}
                  </div>
                </ModernSection>
              </div>
            )}
            {languages.length > 0 && (
              <div>
                <ModernSection title="语言能力" accent="#f97316">
                  <div className="space-y-2">
                    {languages.map((l) => (
                      <div key={l.id}>
                        <div className="flex justify-between" style={{ fontSize: '0.93em' }}>
                          <span className="text-gray-700">{l.language}</span>
                          <span className="text-gray-400" style={{ fontSize: '0.9em' }}>{l.level}</span>
                        </div>
                        {l.score && (
                          <div className="text-gray-400 mt-0.5" style={{ fontSize: '0.78em' }}>{l.score}</div>
                        )}
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
                <span key={sl.id} className="text-gray-600 break-all" style={{ fontSize: '0.93em' }}>{sl.platform}: {sl.url}</span>
              ))}
            </div>
          </ModernSection>
        )}

        {/* 自我评价 */}
        {selfEvaluation && (
          <ModernSection title="自我评价" accent={accent}>
            <p className="text-gray-600 whitespace-pre-line" style={{ fontSize: '0.93em' }}>{selfEvaluation}</p>
          </ModernSection>
        )}
      </div>
    </div>
  );
}

function ModernSection({ title, accent, children }: { title: string; accent: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="font-bold text-gray-800 mb-2 flex items-center gap-2" style={{ fontSize: '0.93em' }}>
        <span className="w-1 h-4 rounded-full inline-block" style={{ backgroundColor: accent }} />
        {title}
      </h3>
      {children}
    </div>
  );
}
