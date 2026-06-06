import { useState } from 'react';
import type { ReactNode } from 'react';

interface FormSectionProps {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  onAdd?: () => void;
  addLabel?: string;
  itemCount?: number;
}

export default function FormSection({
  title,
  children,
  defaultOpen = true,
  onAdd,
  addLabel,
  itemCount,
}: FormSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="section-card mb-3">
      {/* 标题栏 */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between group"
      >
        <div className="flex items-center gap-2">
          <svg
            className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-90' : ''}`}
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          >
            <polyline points="9,18 15,12 9,6" />
          </svg>
          <h3 className="font-semibold text-gray-800">{title}</h3>
          {itemCount !== undefined && itemCount > 0 && (
            <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
              {itemCount}
            </span>
          )}
        </div>

        {onAdd && isOpen && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onAdd(); }}
            className="text-xs text-primary-600 hover:text-primary-700 font-medium
                       px-2 py-1 rounded hover:bg-primary-50 transition-colors"
          >
            {addLabel || '+ 添加'}
          </button>
        )}
      </button>

      {/* 内容区 */}
      {isOpen && <div className="mt-4">{children}</div>}
    </div>
  );
}
