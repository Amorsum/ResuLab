import { forwardRef } from 'react';
import type { ReactNode } from 'react';

interface TemplateBaseProps {
  children: ReactNode;
  scale?: number;
}

const TemplateBase = forwardRef<HTMLDivElement | null, TemplateBaseProps>(
  function TemplateBase({ children, scale = 1 }, ref) {
    return (
      <div
        ref={ref}
        className="a4-preview mx-auto relative"
        style={{
          transform: `scale(${scale})`,
          transformOrigin: 'top center',
          marginBottom: scale < 1 ? `${-(1123 * (1 - scale))}px` : 0,
        }}
      >
        {children}
        {/* A4 页面底部边界线 */}
        <div
          className="absolute left-0 right-0 pointer-events-none"
          style={{
            top: '1123px',
            height: '2px',
            background: 'repeating-linear-gradient(90deg, #d1d5db 0, #d1d5db 8px, transparent 8px, transparent 16px)',
          }}
        />
      </div>
    );
  }
);

export default TemplateBase;
