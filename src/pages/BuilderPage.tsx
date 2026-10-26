import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
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
import { libraryOwner, readLibrary, updateLibrary, cleanLibraryResume } from '../utils/careerLibrary';
import { generateId } from '../constants/defaultResume';

export default function BuilderPage() {
  const { templateId } = useParams<{ templateId: string }>();
  const { resume, setTemplate, setFontSize, setLineHeight, setPageMargin, undo, redo, saveStatus } = useResume();
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
    const owner = libraryOwner(user?.id), snapshot = cleanLibraryResume(resume);
    try {
      const current = await readLibrary(owner);
      await updateLibrary(owner, current.revision, data => ({ ...data, drafts: [{ id: generateId(), title: versionTitle.trim(), jdText: '', createdAt: Date.now(), kind: 'saved', resume: snapshot }, ...data.drafts] }));
      setVersionOpen(false); setSaveMsg('岗位版本已保存，可在经历库重新打开');
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
    } catch {
      setSaveMsg('保存失败');
    } finally {
      setSaving(false);
    }
  };

  // PDF 导出
  const mobilePreviewRef = useRef<HTMLDivElement>(null);
  const { previewRef, getPreviewElement, exportPdf, exportDocx, isExporting, error: exportError } = usePdfExport(mobilePreviewRef);
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

    const prevOverflow = el.style.overflow;
    const prevMaxHeight = el.style.maxHeight;
    el.style.overflow = 'visible';
    el.style.maxHeight = 'none';

    const inner = el.firstElementChild as HTMLElement | null;
    const innerPrevOverflow = inner?.style.overflow;
    const innerPrevMaxHeight = inner?.style.maxHeight;
    if (inner) {
      inner.style.overflow = 'visible';
      inner.style.maxHeight = 'none';
    }

    const scrollH = el.scrollHeight;

    el.style.overflow = prevOverflow;
    el.style.maxHeight = prevMaxHeight;
    if (inner) {
      inner.style.overflow = innerPrevOverflow || '';
      inner.style.maxHeight = innerPrevMaxHeight || '';
    }

    const targetH = 1123;
    if (scrollH <= targetH + 10) return;

    const ratio = targetH / scrollH;
    const { fontSize, lineHeight, pageMargin } = resume;

    if (pageMargin > 5 && ratio < 0.95) {
      const newMargin = Math.max(5, pageMargin - 5);
      setPageMargin(newMargin);
    }

    const newFontSize = Math.max(12, Math.round(fontSize * ratio * 0.95));
    if (newFontSize < fontSize) {
      setFontSize(newFontSize);
    }

    if (ratio < 0.85 && lineHeight > 12) {
      const newLineHeight = Math.max(12, Math.round(lineHeight * ratio));
      setLineHeight(newLineHeight);
    }
  }, [getPreviewElement, resume, setFontSize, setLineHeight, setPageMargin]);

  return (
    <div className={`builder-shell h-screen flex flex-col overflow-hidden bg-gray-100 ${agentOpen ? 'agent-background-hidden' : ''}`}>
      {/* ========== 顶部导航栏 ========== */}
      <AppHeader />
      <div className="builder-actions" aria-label="简历操作">
        <span>编辑与导出</span>
        <div className="flex items-center gap-1 sm:gap-3">
          <button onClick={() => setAgentOpen(true)} className="min-h-10 px-2 sm:px-3 rounded-md text-sm text-primary-700 bg-primary-50 hover:bg-primary-100"><span className="hidden sm:inline">针对岗位优化</span><span className="sm:hidden">岗位优化</span></button>
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
      <div className="builder-context"><div><strong>{resume.jobIntention.desiredPosition || '我的求职简历'}</strong><span role="status">{saveStatus === 'saved' ? '已自动保存到本机' : saveStatus === 'saving' ? '正在保存…' : '本机保存失败，请导出或保存到云端后再离开'}</span></div><button className="career-button" onClick={() => { setVersionTitle(resume.jobIntention.desiredPosition || '我的岗位简历'); setVersionOpen(!versionOpen); }}>另存岗位版本</button></div>
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
            <div className="flex-1 overflow-y-auto pb-16 bg-gray-100">
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
    </div>
  );
}
