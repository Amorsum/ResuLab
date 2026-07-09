import { useState, useRef, useCallback } from 'react';
import { useResume } from './useResume';
import { exportToPdf } from '../utils/pdfExport';
import { exportToDocx } from '../utils/docxExport';

export function usePdfExport() {
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);
  const { resume } = useResume();

  const getFilename = useCallback(() => {
    return resume.personalInfo.fullName
      ? `${resume.personalInfo.fullName}_简历`
      : '我的简历';
  }, [resume.personalInfo.fullName]);

  const exportPdf = useCallback(async () => {
    if (!previewRef.current) {
      setError('预览区域未就绪');
      return;
    }
    setIsExporting(true);
    setError(null);
    setExportMenuOpen(false);
    try {
      await exportToPdf(previewRef.current, getFilename());
    } catch (err) {
      console.error('PDF export failed:', err);
      setError('导出失败，请重试');
    } finally {
      setIsExporting(false);
    }
  }, [getFilename]);

  const exportDocx = useCallback(async () => {
    setIsExporting(true);
    setError(null);
    setExportMenuOpen(false);
    try {
      await exportToDocx(resume, getFilename());
    } catch (err) {
      console.error('DOCX export failed:', err);
      setError('导出失败，请重试');
    } finally {
      setIsExporting(false);
    }
  }, [resume, getFilename]);

  return { previewRef, exportPdf, exportDocx, isExporting, error, exportMenuOpen, setExportMenuOpen };
}
