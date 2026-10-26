import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import AppHeader from '../components/layout/AppHeader';
interface Release { version: string; filename: string; url: string; bytes: number; sha256: string }
export default function ExtensionPage() {
  const [release, setRelease] = useState<Release | null>(null), [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void fetch('/downloads/extension.json', { cache: 'no-cache', signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error(); const value = await response.json() as Release;
      if (!/^\d+\.\d+\.\d+$/.test(value.version) || value.filename !== `ResuLab-Jobs-Extension-${value.version}.zip` || value.url !== `/downloads/${value.filename}` || !/^[a-f0-9]{64}$/.test(value.sha256) || !Number.isInteger(value.bytes) || value.bytes <= 0) throw new Error();
      setRelease(value);
    }).catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, []);
  return <div className="personal-home"><AppHeader /><main className="extension-page">
    <span className="eyebrow">RESULAB / BROWSER EXTENSION</span><h1>把浏览器，连接到求职工作台。</h1>
    <p className="extension-intro">在 Windows 的 Edge 或 Chrome 中安装求职助手，连接本站并尝试收集 BOSS 岗位。简历匹配、准备与审核在工作台完成。</p>
    <section className="extension-download" aria-labelledby="download-heading"><div><h2 id="download-heading">ResuLab 求职助手</h2><p>{release ? `版本 ${release.version} · ${Math.ceil(release.bytes / 1024)} KB · Manifest V3` : failed ? '当前下载暂不可用，请稍后重试或从仓库构建。' : '正在获取下载信息…'}</p></div>{release ? <a className="studio-cta" href={release.url} download={release.filename}>下载浏览器扩展 ZIP ↓</a> : <button className="studio-cta" disabled>暂不可下载</button>}</section>
    <aside className="extension-status"><strong>个人预览版：BOSS 自动投递尚不可用</strong><p>搜索与岗位读取仍待真实页面验收；自动沟通及附件发送保持禁用。你可以手动导入 JD、生成专用 PDF，再自行到 BOSS 投递。</p></aside>
    <section><h2>安装，只需四步</h2><ol className="extension-install"><li><b>下载并解压</b><p>将 ZIP 解压到固定文件夹，里面应有 manifest.json。保留整个文件夹供浏览器加载。</p></li><li><b>打开扩展管理页</b><p>Edge 地址栏输入 <code>edge://extensions</code>；Chrome 输入 <code>chrome://extensions</code>。开启“开发人员模式”。</p></li><li><b>加载解压缩的扩展</b><p>点击“加载解压缩的扩展”，选择包含 manifest.json 的文件夹。当前通过 ZIP 安装，暂未发布扩展商店。</p></li><li><b>返回本站并连接</b><p>在安装扩展的同一浏览器打开 <Link to="/jobs">求职工作台</Link>，点击“连接浏览器扩展”，并在该浏览器登录 BOSS。</p></li></ol></section>
    <section className="extension-faq"><h2>更新与使用说明</h2><p>更新时下载新版，解压覆盖原来的扩展文件夹，在扩展管理页点击“重新加载”，再刷新工作台并重新连接。只刷新网页不会更新扩展。</p><p>扩展仅访问 BOSS、本站和指定本地开发地址，不读取 Cookie 或密码。岗位、审核记录和 PDF 保存在当前浏览器；更换设备前请导出记录并下载文件。</p><p>AI 匹配和简历生成需登录 ResuLab。验证码、登录失效或无法识别页面时，任务会暂停并显示原因。</p></section>
    {release && <details className="extension-integrity"><summary>查看文件校验值</summary><p>SHA-256</p><code>{release.sha256}</code></details>}
    <div className="extension-links"><Link to="/jobs">打开求职工作台 ↗</Link><a href="https://github.com/Amorsum/ResuLab/tree/codex/career-library/extension" target="_blank" rel="noreferrer">扩展源码与 README ↗</a><Link to="/">返回首页</Link></div>
  </main></div>;
}
