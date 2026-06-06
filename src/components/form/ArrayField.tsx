import type { ReactNode } from 'react';

interface ArrayFieldProps<T> {
  items: T[];
  onAdd: () => void;
  onRemove: (index: number) => void;
  onMove: (fromIndex: number, toIndex: number) => void;
  renderItem: (item: T, index: number) => ReactNode;
  addLabel?: string;
  emptyLabel?: string;
}

export default function ArrayField<T extends { id: string }>({
  items,
  onAdd,
  onRemove,
  onMove,
  renderItem,
  addLabel = '添加',
  emptyLabel = '暂无，点击上方按钮添加',
}: ArrayFieldProps<T>) {
  return (
    <div>
      {items.length === 0 && (
        <p className="text-sm text-gray-400 text-center py-4">{emptyLabel}</p>
      )}

      {items.map((item, index) => (
        <div
          key={item.id}
          className="relative border border-gray-200 rounded-lg p-4 mb-3 bg-gray-50/50"
        >
          {/* 操作按钮 */}
          <div className="absolute top-2 right-2 flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => onMove(index, index - 1)}
              disabled={index === 0}
              className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30 transition-colors"
              title="上移"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="18,15 12,9 6,15" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => onMove(index, index + 1)}
              disabled={index === items.length - 1}
              className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30 transition-colors"
              title="下移"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="6,9 12,15 18,9" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => onRemove(index)}
              className="p-1 text-gray-400 hover:text-red-500 transition-colors"
              title="删除"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* 序号 */}
          <div className="text-xs text-gray-400 mb-3">
            {addLabel} #{index + 1}
          </div>

          {/* 条目内容 */}
          {renderItem(item, index)}
        </div>
      ))}

      {/* 添加按钮 */}
      <button
        type="button"
        onClick={onAdd}
        className="w-full py-2 border-2 border-dashed border-gray-300 rounded-lg
                   text-sm text-gray-500 hover:border-primary-400 hover:text-primary-600
                   transition-colors"
      >
        + {addLabel}
      </button>
    </div>
  );
}
