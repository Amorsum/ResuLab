import { useId } from 'react';
import { generateMonthOptions } from '../../utils/dateFormat';

interface DateRangeFieldProps {
  startLabel?: string;
  endLabel?: string;
  startValue: string;
  endValue: string;
  isCurrent: boolean;
  onStartChange: (v: string) => void;
  onEndChange: (v: string) => void;
  onCurrentChange: (v: boolean) => void;
}

export default function DateRangeField({
  startLabel = '开始时间',
  endLabel = '结束时间',
  startValue,
  endValue,
  isCurrent,
  onStartChange,
  onEndChange,
  onCurrentChange,
}: DateRangeFieldProps) {
  const id = useId();
  const months = generateMonthOptions();

  return (
    <div className="flex flex-wrap items-end gap-2 mb-3">
      {/* 开始 */}
      <div className="flex-1 min-w-[120px]">
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {startLabel}
        </label>
        <select
          value={startValue}
          onChange={(e) => onStartChange(e.target.value)}
          className="input-base"
        >
          <option value="">请选择</option>
          {months.map((m) => (
            <option key={m} value={m}>{m.replace('-', '年')}月</option>
          ))}
        </select>
      </div>

      {/* 结束 */}
      <div className="flex-1 min-w-[120px]">
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {endLabel}
        </label>
        <select
          value={isCurrent ? '' : endValue}
          onChange={(e) => onEndChange(e.target.value)}
          disabled={isCurrent}
          className={`input-base ${isCurrent ? 'bg-gray-100 text-gray-400' : ''}`}
        >
          <option value="">{isCurrent ? '至今' : '请选择'}</option>
          {months.map((m) => (
            <option key={m} value={m}>{m.replace('-', '年')}月</option>
          ))}
        </select>
      </div>

      {/* 至今 */}
      <label className="flex items-center gap-1.5 pb-2 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={isCurrent}
          onChange={(e) => onCurrentChange(e.target.checked)}
          className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
        />
        <span className="text-sm text-gray-600 whitespace-nowrap">至今</span>
      </label>
    </div>
  );
}
