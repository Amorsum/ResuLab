import { useNavigate } from 'react-router-dom';
import { TEMPLATE_LIST } from '../constants/templates';
import { useResume } from '../hooks/useResume';
import UserMenu from '../components/layout/UserMenu';
import type { TemplateId } from '../types/resume';

export default function HomePage() {
  const navigate = useNavigate();
  const { setTemplate } = useResume();

  const handleStart = (templateId?: TemplateId) => {
    if (templateId) setTemplate(templateId);
    navigate(templateId ? `/builder/${templateId}` : '/builder');
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      {/* Navbar */}
      <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2 text-xl font-bold text-primary-700">
            <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14,2 14,8 20,8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
              <polyline points="10,9 9,9 8,9"/>
            </svg>
            ResuLab
          </a>
          <UserMenu />
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-4xl mx-auto px-6 pt-20 pb-16 text-center">
        <h1 className="text-5xl font-extrabold text-gray-900 leading-tight mb-6">
          打造专业简历
          <br />
          <span className="text-primary-600">赢在求职起跑线</span>
        </h1>
        <p className="text-lg text-gray-500 mb-10 max-w-2xl mx-auto">
          只需填写信息，选择模板，即可生成一份排版精美、重点突出的专业简历。完全免费，注册后可云端保存。
        </p>
        <div className="flex items-center justify-center gap-4 flex-wrap">
          <button onClick={() => handleStart('classic')} className="btn-primary text-lg px-8 py-3">
            立即制作简历
          </button>
          <button onClick={() => navigate('/builder')} className="btn-secondary text-lg px-8 py-3">
            预览模板
          </button>
        </div>
        {/* 下载按钮 */}
        <div className="mt-6 flex items-center justify-center gap-3 flex-wrap">
          {/* Windows — 桌面端显示 */}
          <a
            href="https://github.com/Amorsum/ResuLab/releases/latest/download/ResuLab_Setup.exe"
            download
            className="hidden sm:inline-flex items-center gap-1.5 btn-secondary text-sm px-5 py-2.5 !bg-gray-900 !text-white !border-gray-900 hover:!bg-gray-800"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="3" width="20" height="14" rx="2"/>
              <line x1="8" y1="21" x2="16" y2="21"/>
              <line x1="12" y1="17" x2="12" y2="21"/>
            </svg>
            下载 Windows 版
          </a>
          {/* Android — 所有端显示 */}
          <a
            href="https://github.com/Amorsum/ResuLab/releases/latest/download/ResuLab.apk"
            download
            className="inline-flex items-center gap-1.5 btn-secondary text-sm px-5 py-2.5 !bg-green-600 !text-white !border-green-600 hover:!bg-green-700"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="5" y="2" width="14" height="20" rx="2"/>
              <line x1="12" y1="18" x2="12" y2="18.01"/>
            </svg>
            下载 Android 版
          </a>
        </div>
      </section>

      {/* 模板展示 */}
      <section className="max-w-5xl mx-auto px-6 py-16">
        <h2 className="text-3xl font-bold text-center mb-12">多套精美模板</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {TEMPLATE_LIST.map((tpl) => (
            <div
              key={tpl.id}
              className="section-card hover:shadow-md transition-shadow cursor-pointer group"
              onClick={() => handleStart(tpl.id)}
            >
              <div
                className="h-48 rounded-lg mb-4 flex items-center justify-center text-white font-bold text-lg"
                style={{ backgroundColor: tpl.color }}
              >
                {tpl.name}
              </div>
              <h3 className="font-semibold text-gray-900 group-hover:text-primary-600 transition-colors">
                {tpl.name}
              </h3>
              <p className="text-sm text-gray-500 mt-1">{tpl.description}</p>
              <button className="mt-4 text-sm text-primary-600 font-medium group-hover:underline">
                使用此模板 →
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* 功能亮点 */}
      <section className="max-w-5xl mx-auto px-6 py-16">
        <h2 className="text-3xl font-bold text-center mb-12">为什么选择 ResuLab</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            { icon: '👁️', title: '实时预览', desc: '填写即渲染，所见即所得' },
            { icon: '🎨', title: '多套模板', desc: '经典/现代/极简 一键切换' },
            { icon: '📄', title: '导出 PDF', desc: '高清矢量输出，支持多页' },
            { icon: '💾', title: '自动保存', desc: '数据保存在浏览器，随时回来' },
          ].map((feat) => (
            <div key={feat.title} className="text-center p-6">
              <div className="text-4xl mb-3">{feat.icon}</div>
              <h3 className="font-semibold text-gray-900 mb-1">{feat.title}</h3>
              <p className="text-sm text-gray-500">{feat.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-100 py-8 text-center text-sm text-gray-400">
        <p>ResuLab — 智能简历制作平台 &copy; {new Date().getFullYear()}</p>
      </footer>
    </div>
  );
}
