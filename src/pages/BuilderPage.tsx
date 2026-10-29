import { useEffect, useRef, useState, useCallback } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useResume } from '../hooks/useResume';
import { useAuth } from '../hooks/useAuth';
import { useCloudResumes } from '../hooks/useCloudResumes';
import { usePdfExport } from '../hooks/usePdfExport';
import type { TemplateId } from '../types/resume';
import { FormPanel } from '../components/form/FormPanel';
import { PreviewPanel } from '../components/preview/PreviewPanel';
import MobileBuilderBar from '../components/preview/MobileBuilderBar';
import OnboardingOverlay from '../components/onboarding/OnboardingOverlay';
import AppHeader from '../components/layout/AppHeader';
import { AgentWorkspace } from '../components/agent/AgentWorkspace';
import { forkResume, persistResumeDocument } from '../utils/resumeDocuments';
import { inspectResumeExport, smartFitLayout, type ExportIssue } from '../utils/exportChecks';
import { ExportPreflight } from '../components/preview/ExportPreflight';

export default function BuilderPage() {
  const { templateId } = useParams<{ templateId: string }>();
  const { resume, setTemplate, setLayout, undo, redo, saveStatus } = useResume();
  const navigate = useNavigate();
  const initialized = useRef(false);
  const [agentOpen, setAgentOpen] = useState(() => new URLSearchParams(window.location.search).get('agent') === '1');

  // 移动端视图切换
  const [mobileView, setMobileView] = useState<'form' | 'preview'>('form');

  // 键盘快捷键：Ctrl+Z 撤销，Ctrl+Y 重做
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, [contenteditable="true"]')) return;
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undo, redo]);

  // 云端保存
  const { user } = useAuth();
  const { saveResume } = useCloudResumes();
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [versionOpen, setVersionOpen] = useState(false), [versionTitle, setVersionTitle] = useState('');
  const versionLock = useRef(false);
  const saveVersion = async () => {
    if (versionLock.current || !versionTitle.trim()) return;
    versionLock.current = true; setSaving(true); setSaveMsg(null);
    const owner = user?.id || 'local-guest', snapshot = forkResume(resume, versionTitle.trim());
    try {
      await persistResumeDocument(owner, snapshot, 0);
      setVersionOpen(false); setSaveMsg('独立岗位副本已保存，可在“我的简历”打开');
    } catch (err) { setSaveMsg(err instanceof Error ? err.message : '版本保存失败，请重试'); }
    finally { versionLock.current = false; setSaving(false); }
  };

  const handleCloudSave = async () => {
    if (!user) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      await saveResume();
      setSaveMsg('已保存到云端');
      setTimeout(() => setSaveMsg(null), 2000);
    } catch (err) {
      setSaveMsg(err instanceof Error ? err.message : '保存失败，本机内容仍保留');
    } finally {
      setSaving(false);
    }
  };

  // PDF 导出
  const mobilePreviewRef = useRef<HTMLDivElement>(null);
  const { previewRef, getPreviewElement, exportPdf: writePdf, exportDocx: writeDocx, isExporting, error: exportError } = usePdfExport(mobilePreviewRef);
  const [preflight, setPreflight] = useState<{ format: 'PDF' | 'Word'; pages: number; issues: ExportIssue[] } | null>(null);
  const requestExport = (format: 'PDF' | 'Word') => { setMobileView('preview'); requestAnimationFrame(() => requestAnimationFrame(() => setPreflight({ format, ...inspectResumeExport(resume, getPreviewElement()) }))); };
  const exportPdf = () => requestExport('PDF'), exportDocx = () => requestExport('Word');
  const locate = (section: ExportIssue['section']) => { setPreflight(null); if (section === 'preview') { setMobileView('preview'); return; } setMobileView('form'); requestAnimationFrame(() => { const visible = [...document.querySelectorAll<HTMLElement>(`#resume-section-${section}`)].find(e => e.getClientRects().length); visible?.scrollIntoView({ block: 'start', behavior: 'smooth' }); const toggle = visible?.querySelector<HTMLButtonElement>('button[aria-expanded="false"]'); toggle?.click(); requestAnimationFrame(() => visible?.querySelector<HTMLElement>('input, textarea, select')?.focus()); }); };
  const [pendingAgentExport, setPendingAgentExport] = useState(false);

  const previewAndExport = () => {
    setAgentOpen(false);
    setMobileView('preview');
    setPendingAgentExport(true);
  };

  // Wait until the dialog has closed and the mobile preview has mounted.
  useEffect(() => {
    if (!pendingAgentExport || agentOpen) return;
    const frame = requestAnimationFrame(() => {
      setPendingAgentExport(false);
      void exportPdf();
    });
    return () => cancelAnimationFrame(frame);
  }, [pendingAgentExport, agentOpen, exportPdf]);

  // 首次加载时：URL 有模板参数 → 同步到 state
  useEffect(() => {
    if (!initialized.current && templateId && ['classic', 'modern', 'minimal', 'professional'].includes(templateId)) {
      setTemplate(templateId as TemplateId);
    }
    initialized.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId]);

  // 模板切换时：state 变化 → 同步到 URL
  useEffect(() => {
    if (initialized.current) {
      navigate(`/builder/${resume.templateId}`, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resume.templateId]);

  /** 智能一页（移动端需要） */
  const smartFit = useCallback(() => {
    const el = getPreviewElement();
    if (!el) return;

    // Measure the complete source, excluding visual page gaps and continuation margins.
    const scrollH = (el.querySelector('[data-resume-source]') as HTMLElement | null)?.scrollHeight || el.scrollHeight;

    const targetH = 1123;
    if (scrollH <= targetH + 10) return;

    setLayout(smartFitLayout(resume, scrollH));
  }, [getPreviewElement, resume, setLayout]);

  return (
    <div className={`builder-shell h-screen flex flex-col overflow-hidden bg-gray-100 ${agentOpen ? 'agent-background-hidden' : ''}`}>
      {/* ========== 顶部导航栏 ========== */}
      <AppHeader />
      <div className="builder-actions" aria-label="简历操作">
        <span>编辑与导出</span>
        <div className="flex items-center gap-1 sm:gap-3">
          <Link className="career-button" to="/library/project">从项目生成经历</Link>
          <Link to="/library#target" className="career-button">按岗位优化</Link>
          {user && (
            <button
              onClick={handleCloudSave}
              disabled={saving}
              className="text-xs px-3 py-1.5 rounded-md bg-primary-50 text-primary-700 hover:bg-primary-100 transition-colors disabled:opacity-50"
            >
              {saving ? '保存中...' : <><span className="hidden sm:inline">保存到云端</span><span className="sm:hidden">云保存</span></>}
            </button>
          )}
        </div>
      </div>
      <div className="builder-context"><div><strong>{resume.documentMeta?.title || '我的求职简历'}</strong><span>{resume.jobIntention.desiredPosition ? `目标岗位：${resume.jobIntention.desiredPosition} · ` : ''}{resume.documentMeta?.kind === 'job' ? '独立岗位副本' : resume.documentMeta?.kind === 'base' ? '基础简历' : '未分类'}</span><span role="status">{saveStatus === 'saved' ? '已自动保存到本机' : saveStatus === 'saving' ? '正在保存…' : '本机保存失败或版本冲突，请在“我的简历”另存当前稿副本'}</span></div><div className="career-actions"><Link className="career-button" to="/my-resumes">管理简历</Link><button className="career-button" onClick={() => { setVersionTitle(resume.jobIntention.desiredPosition || '我的岗位简历'); setVersionOpen(!versionOpen); }}>另存岗位版本</button></div></div>
      {saveMsg && <p className="builder-feedback" role="status">{saveMsg}</p>}
      {versionOpen && <form className="version-save" onSubmit={event => { event.preventDefault(); void saveVersion(); }}><label>版本名称<input className="input-base" autoFocus value={versionTitle} maxLength={120} onChange={event => setVersionTitle(event.target.value)} placeholder="例如：前端实习 · A 公司" /></label><button className="btn-primary" disabled={saving || !versionTitle.trim()}>保存独立版本</button><button type="button" className="btn-secondary" onClick={() => setVersionOpen(false)}>取消</button></form>}

      {/* ========== 主内容区 ========== */}
      <div className="flex flex-1 min-h-0">
        {/* 桌面端：双栏布局 */}
        {/* 左侧: 表单面板 */}
        <div className="builder-form-column hidden lg:block w-[440px] flex-shrink-0">
          <FormPanel />
        </div>

        {/* 右侧: 预览面板 */}
        <div className="hidden lg:flex flex-1 flex-col min-w-0">
          <PreviewPanel
            previewRef={previewRef}
            isExporting={isExporting}
            exportError={exportError}
            onExportPdf={exportPdf}
            onExportDocx={exportDocx}
          />
        </div>

        {/* 移动端：单视图切换 */}
        <div className="lg:hidden flex-1 flex flex-col min-h-0">
          {/* 表单视图 */}
          {mobileView === 'form' && (
            <div className="flex-1 overflow-y-auto pb-16">
              <FormPanel />
            </div>
          )}

          {/* 预览视图 */}
          {mobileView === 'preview' && (
            <div className="flex-1 min-h-0 pb-20 bg-gray-100">
              <PreviewPanel
                previewRef={mobilePreviewRef}
                isExporting={isExporting}
                exportError={exportError}
                onExport={exportPdf}
                onExportDocx={exportDocx}
                hideToolbar
              />
            </div>
          )}

          {/* 底部导航栏 */}
          <MobileBuilderBar
            view={mobileView}
            onSwitchView={setMobileView}
            onExport={exportPdf}
            onExportDocx={exportDocx}
            isExporting={isExporting}
            exportError={exportError}
            onSmartFit={smartFit}
          />
        </div>
      </div>

      {/* ========== 首次使用引导 ========== */}
      <OnboardingOverlay />
      <AgentWorkspace open={agentOpen} onClose={() => setAgentOpen(false)} onPreview={previewAndExport} />
      {preflight && <ExportPreflight {...preflight} close={() => setPreflight(null)} locate={locate} proceed={() => { const format = preflight.format; setPreflight(null); void (format === 'PDF' ? writePdf() : writeDocx()); }} />}
    </div>
  );
}
