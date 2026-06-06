import { useState, useRef, useCallback } from 'react';
import { useResume } from './useResume';
import { exportToPdf } from '../utils/pdfExport';

export function usePdfExport() {
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const { resume } = useResume();

  const exportPdf = useCallback(async () => {
    if (!previewRef.current) {
      setError('预览区域未就绪');
      return;
    }

    setIsExporting(true);
    setError(null);

    try {
      const filename = resume.personalInfo.fullName
        ? `${resume.personalInfo.fullName}_简历`
        : '我的简历';
      await exportToPdf(previewRef.current, filename);
    } catch (err) {
      console.error('PDF export failed:', err);
      setError('导出失败，请重试');
    } finally {
      setIsExporting(false);
    }
  }, [resume.personalInfo.fullName]);

  return { previewRef, exportPdf, isExporting, error };
}
