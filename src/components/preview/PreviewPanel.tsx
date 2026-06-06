import { useState, useCallback } from 'react';
import { usePdfExport } from '../../hooks/usePdfExport';
import { useResume } from '../../hooks/useResume';
import PreviewToolbar from './PreviewToolbar';
import TemplateRenderer from './TemplateRenderer';

interface PreviewPanelProps {
  /** 移动端模式：隐藏工具栏，使用外部传入的 ref 和导出 */
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

  // 移动端使用外部传入，桌面端使用内部
  const previewRef = externalRef || internalRef;
  const isExporting = externalExporting ?? internalExporting;
  const exportError = externalError ?? internalError;
  const onExport = externalOnExport || internalExport;

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
      <div className={`flex-1 bg-gray-100 flex justify-center pt-2 ${hideToolbar ? 'overflow-x-hidden overflow-y-auto' : 'overflow-auto'}`}>
        <div style={hideToolbar ? { width: '100%', overflow: 'hidden' } : { minWidth: '794px' }}>
          <TemplateRenderer previewRef={previewRef} scale={hideToolbar ? Math.min(0.55, (window.innerWidth - 32) / 794) : scale} />
        </div>
      </div>
    </div>
  );
}
