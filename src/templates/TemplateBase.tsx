import { forwardRef, useRef, useLayoutEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { measureResumePages, RESUME_PAGE_GAP, RESUME_PAGE_HEIGHT, RESUME_PAGE_WIDTH, type ResumePageSlice } from '../utils/resumePagination';

interface TemplateBaseProps { children: ReactNode; scale?: number; transformOrigin?: string }
const TemplateBase = forwardRef<HTMLDivElement | null, TemplateBaseProps>(function TemplateBase({ children, scale = 1, transformOrigin = 'top center' }, ref) {
  const sourceRef = useRef<HTMLDivElement>(null);
  const [pages, setPages] = useState<ResumePageSlice[]>([{ start: 0, end: RESUME_PAGE_HEIGHT, top: 0 }]);
  useLayoutEffect(() => {
    const source = sourceRef.current;
    if (!source) return;
    let active = true;
    const measure = () => {
      if (!active) return;
      const next = measureResumePages(source);
      setPages(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(source);
    source.addEventListener('load', measure, true);
    document.fonts?.ready.then(measure);
    document.fonts?.addEventListener('loadingdone', measure);
    return () => {
      active = false;
      observer.disconnect();
      source.removeEventListener('load', measure, true);
      document.fonts?.removeEventListener('loadingdone', measure);
    };
  }, [children, scale]);
  const height = pages.length * RESUME_PAGE_HEIGHT + (pages.length - 1) * RESUME_PAGE_GAP;
  return <div className="resume-preview-frame mx-auto" style={{ position: 'relative', overflow: 'hidden', width: RESUME_PAGE_WIDTH * scale, height: height * scale, flexShrink: 0 }}>
    <div ref={ref} className="a4-preview" data-page-count={pages.length} style={{ position: 'absolute', top: 0, left: transformOrigin.includes('center') ? (scale - 1) * RESUME_PAGE_WIDTH / 2 : 0, transform: `scale(${scale})`, transformOrigin }}>
    {pages.map((page, index) => <div key={index} className="resume-page" data-resume-page={index + 1} data-source-start={page.start} data-source-end={page.end} style={{ paddingTop: page.top, marginTop: index ? RESUME_PAGE_GAP : 0 }}>
      <div className="resume-page-window" style={{ height: page.end - page.start }}>
        {index === 0
          ? <div ref={sourceRef} data-resume-source="true" className="resume-document">{children}</div>
          : <div aria-hidden="true" className="resume-document" style={{ transform: `translateY(-${page.start}px)` }}>{children}</div>}
      </div>
      {pages.length > 1 && <span data-html2canvas-ignore="true" className="resume-page-number">第 {index + 1} / {pages.length} 页</span>}
    </div>)}
    </div>
  </div>;
});
export default TemplateBase;
