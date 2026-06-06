import { useState } from 'react';
import { usePdfExport } from '../../hooks/usePdfExport';
import PreviewToolbar from './PreviewToolbar';
import TemplateRenderer from './TemplateRenderer';

export function PreviewPanel() {
  const [scale, setScale] = useState(0.8);
  const { previewRef, exportPdf, isExporting, error } = usePdfExport();

  return (
    <div className="h-full flex flex-col">
      {/* 工具栏 */}
      <PreviewToolbar
        scale={scale}
        onScaleChange={setScale}
        onExport={exportPdf}
        isExporting={isExporting}
        exportError={error}
      />

      {/* 预览区域 */}
      <div className="flex-1 overflow-auto bg-gray-200 p-4 flex justify-center">
        <div style={{ minWidth: '794px' }}>
          <TemplateRenderer previewRef={previewRef} scale={scale} />
        </div>
      </div>
    </div>
  );
}
