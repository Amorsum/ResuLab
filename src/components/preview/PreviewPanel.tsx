import { useState, useCallback, useEffect, useRef } from 'react';
import { usePdfExport } from '../../hooks/usePdfExport';
import { useResume } from '../../hooks/useResume';
import PreviewToolbar from './PreviewToolbar';
import TemplateRenderer from './TemplateRenderer';

interface PreviewPanelProps {
  previewRef?: React.RefObject<HTMLDivElement>;
  isExporting?: boolean;
  exportError?: string | null;
  onExport?: () => void;
  onExportPdf?: () => void;
  onExportDocx?: () => void;
  hideToolbar?: boolean;
}

export function PreviewPanel({ previewRef: externalRef, isExporting: externalExporting, exportError: externalError, onExport: externalOnExport, onExportPdf: externalPdf, onExportDocx: externalDocx, hideToolbar }: PreviewPanelProps) {
  const [scale, setScale] = useState(.85);
  const canvasRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || hideToolbar) return;
    const fit = () => { if (canvas.clientWidth) setScale(Math.min(1, Math.max(.4, (canvas.clientWidth - 64) / 794))); };
    fit();
    const observer = new ResizeObserver(fit); observer.observe(canvas);
    return () => observer.disconnect();
  }, [hideToolbar]);
  const [viewportWidth, setViewportWidth] = useState(window.innerWidth);
  useEffect(() => { const resize = () => setViewportWidth(window.innerWidth); window.addEventListener('resize', resize); return () => window.removeEventListener('resize', resize); }, []);
  const { previewRef: internalRef, exportPdf: internalExport, exportDocx: internalDocx, isExporting: internalExporting, error: internalError } = usePdfExport();
  const { resume, setFontSize, setLineHeight, setPageMargin } = useResume();

  const previewRef = externalRef || internalRef;
  const isExporting = externalExporting ?? internalExporting;
  const exportError = externalError ?? internalError;
  // 桌面端：使用 BuilderPage 传入的值；内部 fallback 仅用于无传入时的兼容
  const onExportPdf = externalPdf ?? (externalOnExport || internalExport);
  const onExportDocx = externalDocx ?? internalDocx;

  /** 智能一页：自动调整排版使内容缩放到一页内 */
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
      setPageMargin(Math.max(5, pageMargin - 5));
    }
    const newFontSize = Math.max(12, Math.round(fontSize * ratio * 0.95));
    if (newFontSize < fontSize) setFontSize(newFontSize);
    if (ratio < 0.85 && lineHeight > 12) {
      setLineHeight(Math.max(12, Math.round(lineHeight * ratio)));
    }
  }, [previewRef, resume, setFontSize, setLineHeight, setPageMargin]);

  return (
    <div id="preview-panel" className="h-full flex flex-col">
      {!hideToolbar && (
        <PreviewToolbar
          scale={scale}
          onScaleChange={setScale}
          onExportPdf={onExportPdf}
          onExportDocx={onExportDocx}
          isExporting={isExporting}
          exportError={exportError}
          onSmartFit={smartFit}
        />
      )}

      {/* 预览区域 */}
      <div ref={canvasRef} className={`preview-canvas flex-1 bg-gray-100 pt-2 ${hideToolbar ? 'overflow-x-hidden overflow-y-auto' : 'overflow-auto'}`}>
        <div style={hideToolbar ? { paddingLeft: 8, paddingRight: 8 } : { width: 794 * scale, margin: '0 auto 28px', overflow: 'clip' }}>
          <TemplateRenderer
            previewRef={previewRef}
            scale={hideToolbar ? Math.min(1, (viewportWidth - 16) / 794) : scale}
            transformOrigin="top left"
          />
        </div>
      </div>
    </div>
  );
}
