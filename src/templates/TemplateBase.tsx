import { forwardRef, useRef, useLayoutEffect, useState } from 'react';
import type { ReactNode } from 'react';
interface TemplateBaseProps { children: ReactNode; scale?: number; transformOrigin?: string }
const PAGE_HEIGHT = 1123;
const TemplateBase = forwardRef<HTMLDivElement | null, TemplateBaseProps>(function TemplateBase({ children, scale = 1, transformOrigin = 'top center' }, ref) {
  const innerRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(PAGE_HEIGHT);
  useLayoutEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    const measure = () => setHeight(Math.max(PAGE_HEIGHT, el.scrollHeight));
    measure();
    const observer = new ResizeObserver(measure); observer.observe(el);
    return () => observer.disconnect();
  }, [children]);
  const pageCount = Math.max(1, Math.ceil(height / PAGE_HEIGHT));
  return <div ref={ref} className="a4-preview mx-auto relative" style={{ transform: `scale(${scale})`, transformOrigin, marginBottom: scale < 1 ? `${-(height * (1 - scale))}px` : `${height * (scale - 1)}px` }}>
    <div ref={innerRef} style={{ overflow: 'visible', minHeight: `${PAGE_HEIGHT}px` }}>{children}</div>
    {Array.from({ length: pageCount - 1 }, (_, index) => <div key={index} data-html2canvas-ignore="true" className="absolute left-0 right-0 pointer-events-none" style={{ top: (index + 1) * PAGE_HEIGHT, borderTop: '1px dashed #9ca3af' }}><span className="absolute right-0 text-gray-500 bg-white px-2" style={{ top: -18, fontSize: 11 }}>第 {index + 2} 页</span></div>)}
  </div>;
});
export default TemplateBase;
