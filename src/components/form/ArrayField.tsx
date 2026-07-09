import { useState } from 'react';
import type { ReactNode } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';

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
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setDraggingId(null);

    if (!over || active.id === over.id) return;

    const fromIndex = items.findIndex((item) => item.id === active.id);
    const toIndex = items.findIndex((item) => item.id === over.id);
    if (fromIndex === -1 || toIndex === -1) return;

    onMove(fromIndex, toIndex);
  };

  return (
    <div>
      {items.length === 0 && (
        <p className="text-sm text-gray-400 text-center py-4">{emptyLabel}</p>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={({ active }) => setDraggingId(active.id as string)}
        onDragEnd={handleDragEnd}
        modifiers={[restrictToVerticalAxis]}
      >
        <SortableContext items={items.map((item) => item.id)} strategy={verticalListSortingStrategy}>
          {items.map((item, index) => (
            <SortableItem
              key={item.id}
              id={item.id}
              index={index}
              isDragging={draggingId === item.id}
              onRemove={() => onRemove(index)}
              addLabel={addLabel}
            >
              {renderItem(item, index)}
            </SortableItem>
          ))}
        </SortableContext>
      </DndContext>

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

/** 单个可拖拽条目 */
function SortableItem({
  id,
  index,
  isDragging,
  onRemove,
  addLabel,
  children,
}: {
  id: string;
  index: number;
  isDragging: boolean;
  onRemove: () => void;
  addLabel: string;
  children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id });

  const style: React.CSSProperties = {
    transform: transform
      ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
      : undefined,
    transition,
    opacity: isDragging ? 0.5 : undefined,
    position: 'relative',
    zIndex: isDragging ? 50 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="relative border border-gray-200 rounded-lg p-4 mb-3 bg-gray-50/50"
    >
      {/* 拖拽手柄 + 操作按钮 */}
      <div className="absolute top-2 right-2 flex items-center gap-0.5">
        <button
          type="button"
          onClick={onRemove}
          className="p-1 text-gray-400 hover:text-red-500 transition-colors"
          title="删除"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* 拖拽手柄 — 左侧 */}
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="absolute top-2 left-2 p-1 text-gray-300 hover:text-gray-500 transition-colors cursor-grab active:cursor-grabbing"
        title="拖拽排序"
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="9" cy="5" r="2" />
          <circle cx="15" cy="5" r="2" />
          <circle cx="9" cy="12" r="2" />
          <circle cx="15" cy="12" r="2" />
          <circle cx="9" cy="19" r="2" />
          <circle cx="15" cy="19" r="2" />
        </svg>
      </button>

      {/* 序号 */}
      <div className="text-xs text-gray-400 mb-3 ml-6">
        {addLabel} #{index + 1}
      </div>

      {/* 条目内容 */}
      {children}
    </div>
  );
}
