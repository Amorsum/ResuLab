import { forwardRef, useRef, useLayoutEffect, useState } from 'react';
import type { ReactNode } from 'react';

interface TemplateBaseProps {
  children: ReactNode;
  scale?: number;
  transformOrigin?: string;
}

const PAGE_HEIGHT = 1123;

const TemplateBase = forwardRef<HTMLDivElement | null, TemplateBaseProps>(
  function TemplateBase({ children, scale = 1, transformOrigin = 'top center' }, ref) {
    const innerRef = useRef<HTMLDivElement>(null);
    const [pageCount, setPageCount] = useState(1);

    useLayoutEffect(() => {
      const el = innerRef.current;
      if (!el) return;

      // Temporarily remove overflow hidden to measure natural height
      const prevOverflow = el.style.overflow;
      const prevMaxHeight = el.style.maxHeight;
      el.style.overflow = 'visible';
      el.style.maxHeight = 'none';

      const scrollHeight = el.scrollHeight;

      el.style.overflow = prevOverflow;
      el.style.maxHeight = prevMaxHeight;

      const pages = Math.ceil(scrollHeight / PAGE_HEIGHT);
      setPageCount(pages);
    }, [children]);

    // Render page break markers for multi-page preview
    const pageBreaks = Array.from({ length: pageCount - 1 }, (_, i) => i + 1);

    return (
      <div
        ref={ref}
        className="a4-preview mx-auto relative"
        style={{
          transform: `scale(${scale})`,
          transformOrigin,
          marginBottom: scale < 1 ? `${-(PAGE_HEIGHT * (1 - scale))}px` : 0,
        }}
      >
        <div style={{ overflow: 'visible', minHeight: `${PAGE_HEIGHT}px` }}>
          {/* Page break markers (dashed lines) before this A4 page begins — shown above page 1 doesn't need one */}
          {pageBreaks.map((page) => (
            <div
              key={`break-${page}`}
              className="relative pointer-events-none"
              style={{
                borderTop: '2px dashed #d1d5db',
                margin: '6px 0',
              }}
            >
              <span
                className="absolute text-gray-400 bg-white px-2"
                style={{ right: 0, top: '-12px', fontSize: '11px' }}
              >
                第 {page + 1} 页
              </span>
            </div>
          ))}

          {/* Actual template content */}
          {children}
        </div>

        {/* Bottom boundary (solid line) at last page */}
        <div
          className="absolute left-0 right-0 pointer-events-none"
          style={{
            top: `${PAGE_HEIGHT * pageCount}px`,
            height: '2px',
            background: 'repeating-linear-gradient(90deg, #d1d5db 0, #d1d5db 8px, transparent 8px, transparent 16px)',
          }}
        />
      </div>
    );
  }
);

export default TemplateBase;
