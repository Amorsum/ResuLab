import { useState, useCallback, useRef, useEffect } from 'react';
import { usePdfExport } from '../../hooks/usePdfExport';
import { useResume } from '../../hooks/useResume';
import PreviewToolbar from './PreviewToolbar';
import TemplateRenderer from './TemplateRenderer';

interface PreviewPanelProps {
  previewRef?: React.RefObject<HTMLDivElement>;
  isExporting?: boolean;
  exportError?: string | null;
  onExport?: () => void;
  hideToolbar?: boolean;
}

export function PreviewPanel({ previewRef: externalRef, isExporting: externalExporting, exportError: externalError, onExport: externalOnExport, hideToolbar }: PreviewPanelProps) {
  const [scale, setScale] = useState(1.1);
  const { previewRef: internalRef, exportPdf: internalExport, isExporting: internalExporting, error: internalError } = usePdfExport();
  const { resume, setFontSize, setLineHeight, setPageMargin } = useResume();

  const previewRef = externalRef || internalRef;
  const isExporting = externalExporting ?? internalExporting;
  const exportError = externalError ?? internalError;
  const onExport = externalOnExport || internalExport;

  // 移动端：缩放使简历宽度适配屏幕（留 16px 边距保证完整显示）
  const mobileScale = Math.min(0.45, (window.innerWidth - 32) / 794);

  // 移动端：模板懒加载完成后自动滚到中间
  const mobileScrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!hideToolbar) return;
    // 等 lazy 模板渲染完成后滚到中间
    const el = mobileScrollRef.current;
    if (!el) return;
    let attempts = 0;
    const tryScroll = () => {
      attempts++;
      el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
      // 如果 scrollWidth 还没加载完（<794），继续尝试，最多 10 次
      if (el.scrollWidth < 500 && attempts < 10) {
        setTimeout(tryScroll, 200);
      }
    };
    const timer = setTimeout(tryScroll, 400);
    return () => clearTimeout(timer);
  }, [hideToolbar, resume.templateId]);

  /** 智能一页：自动调整排版使内容缩放到一页内 */
  const smartFit = useCallback(() => {
    const el = previewRef.current;
    if (!el) return;

    // 临时解除外层和内层的裁剪限制，测量真实内容高度
    const prevOverflow = el.style.overflow;
    const prevMaxHeight = el.style.maxHeight;
    el.style.overflow = 'visible';
    el.style.maxHeight = 'none';

    // 内层模板根元素也可能有裁剪
    const inner = el.firstElementChild as HTMLElement | null;
    const innerPrevOverflow = inner?.style.overflow;
    const innerPrevMaxHeight = inner?.style.maxHeight;
    if (inner) {
      inner.style.overflow = 'visible';
      inner.style.maxHeight = 'none';
    }

    const scrollH = el.scrollHeight;

    // 恢复裁剪样式
    el.style.overflow = prevOverflow;
    el.style.maxHeight = prevMaxHeight;
    if (inner) {
      inner.style.overflow = innerPrevOverflow || '';
      inner.style.maxHeight = innerPrevMaxHeight || '';
    }

    const targetH = 1123; // A4 高度

    if (scrollH <= targetH + 10) return; // 已在一页内（+10 容差）

    const ratio = targetH / scrollH;
    const { fontSize, lineHeight, pageMargin } = resume;

    // 1. 先尝试缩页边距（逐步减小，最小到 5）
    if (pageMargin > 5 && ratio < 0.95) {
      const newMargin = Math.max(5, pageMargin - 5);
      setPageMargin(newMargin);
    }

    // 2. 按比例缩小字号（clamp 12~18）
    const newFontSize = Math.max(12, Math.round(fontSize * ratio * 0.95));
    if (newFontSize < fontSize) {
      setFontSize(newFontSize);
    }

    // 3. 按比例缩小行距（clamp 12~28）
    if (ratio < 0.85 && lineHeight > 12) {
      const newLineHeight = Math.max(12, Math.round(lineHeight * ratio));
      setLineHeight(newLineHeight);
    }
  }, [previewRef, resume, setFontSize, setLineHeight, setPageMargin]);

  return (
    <div className="h-full flex flex-col">
      {/* 工具栏（桌面端显示） */}
      {!hideToolbar && (
        <PreviewToolbar
          scale={scale}
          onScaleChange={setScale}
          onExport={onExport}
          isExporting={isExporting}
          exportError={exportError}
          onSmartFit={smartFit}
        />
      )}

      {/* 预览区域 */}
      {hideToolbar ? (
        <div ref={mobileScrollRef} className="flex-1 overflow-auto bg-gray-100 pt-2">
          <TemplateRenderer previewRef={previewRef} scale={mobileScale} />
        </div>
      ) : (
        <div className="flex-1 overflow-auto bg-gray-100 flex justify-center pt-2">
          <div style={{ minWidth: '794px' }}>
            <TemplateRenderer previewRef={previewRef} scale={scale} />
          </div>
        </div>
      )}
    </div>
  );
}
