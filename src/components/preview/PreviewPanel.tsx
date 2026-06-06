import { useState, useCallback } from 'react';
import { usePdfExport } from '../../hooks/usePdfExport';
import { useResume } from '../../hooks/useResume';
import PreviewToolbar from './PreviewToolbar';
import TemplateRenderer from './TemplateRenderer';

export function PreviewPanel() {
  const [scale, setScale] = useState(1.1);
  const { previewRef, exportPdf, isExporting, error } = usePdfExport();
  const { resume, setFontSize, setLineHeight, setPageMargin } = useResume();

  /** 智能一页：自动调整排版使内容缩放到一页内 */
  const smartFit = useCallback(() => {
    const el = previewRef.current;
    if (!el) return;

    // 测量 A4 内容实际高度
    const scrollH = el.scrollHeight;
    const targetH = 1123; // A4 高度

    if (scrollH <= targetH + 10) return; // 已在一页内（+10 容差）

    const ratio = targetH / scrollH;
    const { fontSize, lineHeight, pageMargin } = resume;

    // 1. 先尝试缩页边距
    if (pageMargin !== 'narrow' && ratio < 0.95) {
      setPageMargin('narrow');
    }

    // 2. 按比例缩小字号（clamp 12~18）
    const newFontSize = Math.max(12, Math.round(fontSize * ratio * 0.95));
    if (newFontSize < fontSize) {
      setFontSize(newFontSize);
    }

    // 3. 按比例缩小行距（clamp 1.4~2.0）
    if (ratio < 0.85 && lineHeight > 1.4) {
      const newLineHeight = Math.max(1.4, +(lineHeight * ratio).toFixed(1));
      setLineHeight(newLineHeight);
    }
  }, [previewRef, resume, setFontSize, setLineHeight, setPageMargin]);

  return (
    <div className="h-full flex flex-col">
      {/* 工具栏 */}
      <PreviewToolbar
        scale={scale}
        onScaleChange={setScale}
        onExport={exportPdf}
        isExporting={isExporting}
        exportError={error}
        onSmartFit={smartFit}
      />

      {/* 预览区域 */}
      <div className="flex-1 overflow-auto bg-gray-100 flex justify-center pt-2">
        <div style={{ minWidth: '794px' }}>
          <TemplateRenderer previewRef={previewRef} scale={scale} />
        </div>
      </div>
    </div>
  );
}
