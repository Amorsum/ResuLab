import { Link } from 'react-router-dom';
import AppHeader from '../components/layout/AppHeader';
import { useResume } from '../hooks/useResume';

export default function HomePage() {
  const { resume } = useResume();
  const hasContent = Boolean(resume.personalInfo.fullName || resume.projects.length || resume.education.length || resume.workExperience.length);
  const project = resume.projects[0];
  const education = resume.education[0];
  return <div className="personal-home">
    <AppHeader />
    <main className="personal-workspace">
      <div className="workspace-heading"><div><span className="eyebrow">YOUR PERSONAL RESUME STUDIO</span><h1>把经历，写成机会<span>。</span></h1><p>从真实的你出发，准备下一份有针对性的简历。</p></div><span className="workspace-label"><i />我的工作台</span></div>
      <section className="workspace-current" aria-label="当前简历">
        <div className="workspace-current-copy"><span className="eyebrow">CURRENT DOCUMENT <span> / 01</span></span><h2>{hasContent ? resume.personalInfo.fullName || '未命名简历' : '你的第一份简历'}</h2><p>{resume.jobIntention.desiredPosition || (hasContent ? '添加一个目标岗位，让表达更有方向。' : '导入已有简历，或从一段课程、项目经历开始。')}</p><div className="workspace-counts"><span><b>{resume.education.length.toString().padStart(2,'0')}</b>教育经历</span><span><b>{resume.projects.length.toString().padStart(2,'0')}</b>项目 / 实践</span><span><b>{resume.workExperience.length.toString().padStart(2,'0')}</b>实习 / 工作</span></div><Link className="studio-cta" to="/builder">{hasContent ? '继续编辑简历' : '开始整理简历'}<span aria-hidden="true">↗</span></Link><small>本机自动保存 · 随时继续</small></div>
        <div className="workspace-document" aria-label="当前内容概览"><div className="document-caption"><span>内容预览</span><span>RESUME / A4</span></div><div className="document-sheet"><span className="document-kicker">个人简历</span><h3>{resume.personalInfo.fullName || '你的姓名'}</h3><p>{resume.jobIntention.desiredPosition || '你的目标岗位'}</p><div className="document-rule"/><h4>教育背景</h4><strong>{education?.schoolName || '从你的教育经历开始'}</strong><p>{education ? [education.degree,education.major].filter(Boolean).join(' · ') : '学校、专业，以及与你有关的成长。'}</p><h4>项目与实践</h4><strong>{project?.projectName || '每一段实践，都有价值'}</strong><p className="document-excerpt">{project?.description || '写下做过的事、用过的方法和真实的收获，再针对目标岗位整理表达。'}</p><div className="document-folio">RESULAB<span>01</span></div></div></div>
      </section>
      <section className="feature-directory" aria-labelledby="feature-heading" id="features">
        <div className="workspace-section-heading"><h2 id="feature-heading">全部功能</h2><span>任何页面都可通过顶部「首页」回到这里</span></div>
        <div className="workspace-actions">
          <Link to="/builder"><div className="action-top"><span className="action-symbol" aria-hidden="true">▤</span><span className="feature-status">本机可用 · AI 需登录</span></div><h2>编辑、导入与导出</h2><p>手动填写简历，或读取 PDF / Word / 文本后用 AI 提取并核对。选择模板，实时预览并导出。</p><ul className="feature-tags"><li>四种模板</li><li>字体与排版</li><li>PDF / Word 导出</li><li>撤销与重做</li></ul><b>打开简历编辑器 <span aria-hidden="true">↗</span></b></Link>
          <Link to="/library"><div className="action-top"><span className="action-symbol" aria-hidden="true">≡</span><span className="feature-status">本机可用 · AI 需登录</span></div><h2>经历库与定向写作</h2><p>记录课程、项目、校园和工作经历，确认事实后，按岗位名称或完整 JD 生成独立简历。</p><ul className="feature-tags"><li>学生经历引导</li><li>事实确认</li><li>逐条改写审核</li></ul><b>打开经历库 <span aria-hidden="true">↗</span></b></Link>
          <Link to="/builder?agent=1"><div className="action-top"><span className="action-symbol" aria-hidden="true">✳</span><span className="feature-status">AI 分析需登录</span></div><h2>针对岗位优化</h2><p>分析当前简历与岗位的联系，查看匹配证据和缺口，核对建议后再应用到简历。</p><ul className="feature-tags"><li>岗位分析</li><li>改写对照</li><li>选择应用建议</li></ul><b>打开岗位优化 <span aria-hidden="true">↗</span></b></Link>
          <Link to="/jobs"><div className="action-top"><span className="action-symbol" aria-hidden="true">↗</span><span className="feature-status feature-preview">BOSS 接入待验证</span></div><h2>求职工作台</h2><p>导入岗位 JD、匹配已确认经历，逐岗生成专用 PDF 并审核。AI 匹配与生成需登录。</p><ul className="feature-tags"><li>手动导入 JD</li><li>岗位匹配</li><li>专用简历审核</li></ul><p className="feature-limitation">扩展搜索待实站验证；自动沟通及附件发送暂不可用。</p><b>打开求职工作台 <span aria-hidden="true">↗</span></b></Link>
          <Link to="/library#versions"><div className="action-top"><span className="action-symbol" aria-hidden="true">▱</span><span className="feature-status">本机可用</span></div><h2>本地版本与备份</h2><p>查看定制简历、另存的岗位版本和切换前备份。经历库支持导出与恢复备份。</p><ul className="feature-tags"><li>独立岗位版本</li><li>打开继续编辑</li><li>备份与恢复</li></ul><b>查看本地版本 <span aria-hidden="true">↗</span></b></Link>
          <Link to="/my-resumes"><div className="action-top"><span className="action-symbol" aria-hidden="true">☁</span><span className="feature-status">需登录</span></div><h2>云端简历管理</h2><p>管理已保存到账号的简历，打开继续编辑或新建版本。在编辑器中手动保存到云端。</p><ul className="feature-tags"><li>云端保存</li><li>版本管理</li><li>账号访问</li></ul><b>查看云端简历 <span aria-hidden="true">↗</span></b></Link>
        </div>
      </section>
      <aside className="extension-home-entry"><div><strong>浏览器扩展 · 求职助手</strong><p>下载 Edge / Chrome 安装包，查看安装方法与当前支持能力。</p></div><Link to="/extension">下载扩展与安装说明 ↗</Link></aside>
      <footer className="workspace-footer"><span>ResuLab — 留下真实，写出可能。</span><span>本机编辑自动保存 · 云端同步需登录</span></footer>
    </main>
  </div>;
}
