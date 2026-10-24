import { Suspense, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { TEMPLATES } from '../constants/templates';
import type { ResumeData } from '../types/resume';
import { createPdfBlob } from './pdfExport';

function Ready({ onReady }: { onReady: () => void }) { useEffect(onReady, [onReady]); return null; }
export async function renderJobPdf(resume: ResumeData): Promise<Blob> {
  const container = document.createElement('div');
  container.style.cssText = 'position:fixed;left:-10000px;top:0;width:794px;background:white;pointer-events:none';
  document.body.appendChild(container);
  const root = createRoot(container), Template = TEMPLATES[resume.templateId].component;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await new Promise<void>((resolve, reject) => {
      timer = setTimeout(() => reject(new Error('简历模板加载超时')), 20000);
      root.render(<Suspense fallback={null}><div className="a4-preview" style={{ width: 794, minHeight: 1123 }}><Template data={structuredClone(resume)} /><Ready onReady={resolve} /></div></Suspense>);
    });
    await document.fonts.ready;
    await Promise.all([...container.querySelectorAll('img')].map(async image => {
      if (image.complete) { if (!image.naturalWidth) throw new Error('简历图片加载失败'); return; }
      await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('简历图片加载失败')); setTimeout(() => reject(new Error('简历图片加载超时')), 10000); });
    }));
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    return await createPdfBlob(container.firstElementChild as HTMLElement);
  } finally { clearTimeout(timer); root.unmount(); container.remove(); }
}
