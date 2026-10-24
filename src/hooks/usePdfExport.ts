import { useState, useRef, useCallback } from 'react';
import type { RefObject } from 'react';
import { useResume } from './useResume';
import { exportToPdf } from '../utils/pdfExport';
import { exportToDocx } from '../utils/docxExport';

export function usePdfExport(alternatePreviewRef?: RefObject<HTMLDivElement>) {
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);
  const exporting = useRef(false);
  const { resume } = useResume();

  // Desktop and mobile previews coexist in the DOM. Capture only a visible one.
  const getPreviewElement = useCallback(() => {
    return [previewRef.current, alternatePreviewRef?.current].find(element => {
      if (!element) return false;
      const bounds = element.getBoundingClientRect();
      return bounds.width > 0 && bounds.height > 0 && getComputedStyle(element).visibility === 'visible';
    }) ?? null;
  }, [alternatePreviewRef]);

  const getFilename = useCallback(() => {
    return resume.personalInfo.fullName
      ? `${resume.personalInfo.fullName}_简历`
      : '我的简历';
  }, [resume.personalInfo.fullName]);

  const exportPdf = useCallback(async () => {
    if (exporting.current) return;
    const element = getPreviewElement();
    if (!element) {
      setError('预览区域未就绪，请打开预览后重试');
      return;
    }
    exporting.current = true;
    setIsExporting(true);
    setError(null);
    setExportMenuOpen(false);
    try {
      await exportToPdf(element, getFilename());
    } catch (err) {
      console.error('PDF export failed:', err);
      setError('导出失败，请重试');
    } finally {
      exporting.current = false;
      setIsExporting(false);
    }
  }, [getFilename, getPreviewElement]);

  const exportDocx = useCallback(async () => {
    if (exporting.current) return;
    exporting.current = true;
    setIsExporting(true);
    setError(null);
    setExportMenuOpen(false);
    try {
      await exportToDocx(resume, getFilename());
    } catch (err) {
      console.error('DOCX export failed:', err);
      setError('导出失败，请重试');
    } finally {
      exporting.current = false;
      setIsExporting(false);
    }
  }, [resume, getFilename]);

  return { previewRef, getPreviewElement, exportPdf, exportDocx, isExporting, error, exportMenuOpen, setExportMenuOpen };
}
