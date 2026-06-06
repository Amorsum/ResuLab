import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useResume } from '../hooks/useResume';
import { usePdfExport } from '../hooks/usePdfExport';
import type { TemplateId } from '../types/resume';
import { FormPanel } from '../components/form/FormPanel';
import { PreviewPanel } from '../components/preview/PreviewPanel';
import MobileBuilderBar from '../components/preview/MobileBuilderBar';

export default function BuilderPage() {
  const { templateId } = useParams<{ templateId: string }>();
  const { resume, setTemplate, setFontSize, setLineHeight, setPageMargin } = useResume();
  const navigate = useNavigate();
  const initialized = useRef(false);

  // 移动端视图切换
  const [mobileView, setMobileView] = useState<'form' | 'preview'>('form');

  // PDF 导出（移动端需要）
  const { previewRef, exportPdf, isExporting, error: exportError } = usePdfExport();

  // 首次加载时：URL 有模板参数 → 同步到 state
  useEffect(() => {
    if (!initialized.current && templateId && ['classic', 'modern', 'minimal'].includes(templateId)) {
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
    const el = previewRef.current;
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
  }, [previewRef, resume, setFontSize, setLineHeight, setPageMargin]);

  return (
    <div className="flex h-screen overflow-hidden bg-gray-100">
      {/* ========== 桌面端：双栏布局 ========== */}
      {/* 左侧: 表单面板 */}
      <div className="hidden lg:block w-[440px] flex-shrink-0">
        <FormPanel />
      </div>

      {/* 右侧: 预览面板 */}
      <div className="hidden lg:flex flex-1 flex-col min-w-0">
        <PreviewPanel />
      </div>

      {/* ========== 移动端：单视图切换 ========== */}
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
              previewRef={previewRef}
              isExporting={isExporting}
              exportError={exportError}
              onExport={exportPdf}
              hideToolbar
            />
          </div>
        )}

        {/* 底部导航栏 */}
        <MobileBuilderBar
          view={mobileView}
          onSwitchView={setMobileView}
          onExport={exportPdf}
          isExporting={isExporting}
          onSmartFit={smartFit}
        />
      </div>
    </div>
  );
}
