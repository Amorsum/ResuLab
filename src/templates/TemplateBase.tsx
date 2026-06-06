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
        className="a4-preview mx-auto"
        style={{
          transform: `scale(${scale})`,
          transformOrigin: 'top center',
          marginBottom: scale < 1 ? `${-(1123 * (1 - scale))}px` : 0,
        }}
      >
        {children}
      </div>
    );
  }
);

export default TemplateBase;
