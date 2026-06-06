import type { ResumeData } from '../../types/resume';
import { formatMonth, formatDateRange } from '../../utils/dateFormat';

interface Props { data: ResumeData; }

/** 字体映射 */
const FONT_FAMILY: Record<string, string> = {
  songti: '"SimSun", "宋体", serif',
  yahei: '"Microsoft YaHei", "微软雅黑", sans-serif',
  kaiti: '"KaiTi", "楷体", serif',
  fangsong: '"FangSong", "仿宋", serif',
};

/** 页边距 px 计算 */
function calcMargin(v: number) {
  return { x: Math.round(v * 2.8 + 10), y: Math.round(v * 2.8 + 22) };
}

export default function ClassicTemplate({ data }: Props) {
  const { personalInfo: p, jobIntention: j, education, workExperience, projects, skills, certificates, languages, selfEvaluation, socialLinks } = data;
  const accent = data.accentColor || '#4a5568';
  const ff = FONT_FAMILY[data.fontFamily] || FONT_FAMILY.yahei;
  const mg = calcMargin(data.pageMargin);

  const showSidebar = p.avatar || p.phone || p.email || p.city || skills.length > 0 || languages.length > 0;

  // 按类别分组技能
  const skillGroups = skills.reduce<Record<string, typeof skills>>((acc, s) => {
    const cat = s.category || '其他';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(s);
    return acc;
  }, {});

  return (
    <div className="flex text-gray-800" style={{
      fontFamily: ff,
      fontSize: `${data.fontSize}px`,
      lineHeight: `${data.lineHeight}px`,
      minHeight: '1123px',
      maxHeight: '1123px',
      overflow: 'hidden',
    }}>
      {/* ========== 左侧边栏 ========== */}
      {showSidebar && (
        <div className="w-[230px] bg-[#f0f4f8] flex-shrink-0 break-words" style={{ padding: `${mg.y}px ${mg.x}px` }}>
          {/* 照片 */}
          {p.avatar && (
            <div className="text-center mb-6">
              <img src={p.avatar} alt={p.fullName}
                className="w-[90px] h-[120px] rounded-lg object-cover mx-auto border-2 border-white shadow" />
            </div>
          )}

          {/* 基本信息 */}
          <div className="mb-6">
            <h3 className="font-bold uppercase tracking-[2px] mb-3 border-b border-[#cbd5e0] pb-1" style={{ color: accent, fontSize: '0.8em' }}>联系方式</h3>
            <div className="space-y-2 text-gray-600" style={{ fontSize: '0.93em' }}>
              {p.phone && <p>📱 {p.phone}</p>}
              {p.email && <p>✉️ {p.email}</p>}
              {p.city && <p>📍 {p.city}</p>}
              {p.birthYear && <p>🎂 {p.birthYear}年{p.birthMonth}月</p>}
            </div>
          </div>

          {/* 技能（按类别分组） */}
          {skills.length > 0 && (
            <div className="mb-6">
              <h3 className="font-bold uppercase tracking-[2px] mb-3 border-b border-[#cbd5e0] pb-1" style={{ color: accent, fontSize: '0.8em' }}>专业技能</h3>
              <div className="space-y-3">
                {Object.entries(skillGroups).map(([cat, items]) => (
                  <div key={cat}>
                    {Object.keys(skillGroups).length > 1 && (
                      <div className="text-gray-400 mb-1.5" style={{ fontSize: '0.75em' }}>{cat}</div>
                    )}
                    <div className="space-y-2">
                      {items.map((s) => (
                        <div key={s.id}>
                          <div className="flex justify-between mb-1" style={{ fontSize: '0.85em' }}>
                            <span className="text-gray-700 min-w-0 break-words">{s.skillName}</span>
                            <span className="text-gray-400 flex-shrink-0 ml-1" style={{ fontSize: '0.93em' }}>{s.level}</span>
                          </div>
                          <div className="h-1 bg-gray-200 rounded-full overflow-hidden">
                            <div className="h-full rounded-full"
                              style={{ backgroundColor: accent, width: s.level === '精通' ? '90%' : s.level === '熟练' ? '70%' : s.level === '掌握' ? '50%' : '30%' }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 语言 */}
          {languages.length > 0 && (
            <div className="mb-6">
              <h3 className="font-bold uppercase tracking-[2px] mb-3 border-b border-[#cbd5e0] pb-1" style={{ color: accent, fontSize: '0.8em' }}>语言能力</h3>
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
            </div>
          )}

          {/* 社交链接 */}
          {socialLinks.length > 0 && (
            <div>
              <h3 className="font-bold uppercase tracking-[2px] mb-3 border-b border-[#cbd5e0] pb-1" style={{ color: accent, fontSize: '0.8em' }}>社交链接</h3>
              <div className="space-y-1.5" style={{ fontSize: '0.85em' }}>
                {socialLinks.map((sl) => (
                  <p key={sl.id} className="text-gray-600 break-all">{sl.platform}: {sl.url}</p>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========== 右侧主体 ========== */}
      <div className="flex-1" style={{ padding: `${mg.y}px ${mg.x}px`, overflow: 'hidden' }}>
        {/* 姓名 + 职位 */}
        <div className="mb-6">
          {p.fullName && <h1 className="font-bold text-[#2d3748] tracking-wide mb-1" style={{ fontSize: '2em' }}>{p.fullName}</h1>}
          {p.jobTitle && <p style={{ color: accent, fontSize: '1.07em' }}>{p.jobTitle}{p.yearsOfExperience ? ` | ${p.yearsOfExperience}年经验` : ''}</p>}
          {j.desiredPosition && <p className="text-gray-500 mt-0.5" style={{ fontSize: '0.93em' }}>求职意向：{j.desiredPosition}{j.desiredCity ? ` · ${j.desiredCity}` : ''}{j.expectedSalary ? ` · ${j.expectedSalary}` : ''}</p>}
        </div>

        {/* 教育背景 */}
        {education.length > 0 && (
          <Section accent={accent} title="教育背景" fontSize={data.fontSize}>
            {education.map((edu) => (
              <div key={edu.id} className="mb-3">
                <div className="flex justify-between items-baseline">
                  <span className="font-semibold text-gray-800" style={{ fontSize: '1.07em' }}>{edu.schoolName}</span>
                  <span className="text-gray-400" style={{ fontSize: '0.85em' }}>{formatDateRange(edu.startDate, edu.endDate, edu.isCurrent)}</span>
                </div>
                <p className="text-gray-600" style={{ fontSize: '0.93em' }}>{edu.degree} · {edu.major}{edu.gpa ? ` · GPA ${edu.gpa}` : ''}</p>
                {edu.description && <p className="text-gray-500 mt-1" style={{ fontSize: '0.93em' }}>{edu.description}</p>}
              </div>
            ))}
          </Section>
        )}

        {/* 工作经历 */}
        {workExperience.length > 0 && (
          <Section accent={accent} title="工作经历" fontSize={data.fontSize}>
            {workExperience.map((exp) => (
              <div key={exp.id} className="mb-4">
                <div className="flex justify-between items-baseline">
                  <span className="font-semibold text-gray-800" style={{ fontSize: '1.07em' }}>{exp.companyName}</span>
                  <span className="text-gray-400" style={{ fontSize: '0.85em' }}>{formatDateRange(exp.startDate, exp.endDate, exp.isCurrent)}</span>
                </div>
                <p className="text-gray-600" style={{ fontSize: '0.93em' }}>{exp.position}{exp.city ? ` · ${exp.city}` : ''}</p>
                {exp.description && <p className="text-gray-500 mt-1 whitespace-pre-line" style={{ fontSize: '0.93em' }}>{exp.description}</p>}
                {exp.highlights.length > 0 && (
                  <ul className="mt-1.5 space-y-0.5">
                    {exp.highlights.map((h, i) => (
                      <li key={i} className="text-gray-600 flex gap-1.5" style={{ fontSize: '0.93em' }}>
                      <span style={{ color: accent }}>•</span> {h}
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
          <Section accent={accent} title="项目经历" fontSize={data.fontSize}>
            {projects.map((proj) => (
              <div key={proj.id} className="mb-3">
                <div className="flex justify-between items-baseline">
                  <span className="font-semibold text-gray-800" style={{ fontSize: '1.07em' }}>{proj.projectName}</span>
                  <span className="text-gray-400" style={{ fontSize: '0.85em' }}>{formatDateRange(proj.startDate, proj.endDate, proj.isCurrent)}</span>
                </div>
                <p className="text-gray-600" style={{ fontSize: '0.93em' }}>{proj.role}</p>
                {proj.description && <p className="text-gray-500 mt-1" style={{ fontSize: '0.93em' }}>{proj.description}</p>}
                {proj.techStack.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {proj.techStack.map((t) => (
                      <span key={t} className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded" style={{ fontSize: '0.78em' }}>{t}</span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </Section>
        )}

        {/* 证书 */}
        {certificates.length > 0 && (
          <Section accent={accent} title="证书奖项" fontSize={data.fontSize}>
            <div className="flex flex-wrap gap-x-6 gap-y-1">
              {certificates.map((cert) => (
                <span key={cert.id} className="text-gray-600" style={{ fontSize: '0.93em' }}>
                  {cert.name}{cert.issuer ? `（${cert.issuer}）` : ''}{cert.date ? ` ${formatMonth(cert.date)}` : ''}
                </span>
              ))}
            </div>
          </Section>
        )}

        {/* 自我评价 */}
        {selfEvaluation && (
          <Section accent={accent} title="自我评价" fontSize={data.fontSize}>
            <p className="text-gray-600 whitespace-pre-line" style={{ fontSize: '0.93em' }}>{selfEvaluation}</p>
          </Section>
        )}
      </div>
    </div>
  );
}

/** 简历区域小标题 */
function Section({ title, accent, fontSize, children }: { title: string; accent: string; fontSize: number; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <h3 className="font-bold uppercase tracking-[2px] border-b-2 pb-1 mb-3"
        style={{ color: accent, borderColor: accent, fontSize: `${fontSize * 0.93}px` }}>
        {title}
      </h3>
      {children}
    </div>
  );
}
