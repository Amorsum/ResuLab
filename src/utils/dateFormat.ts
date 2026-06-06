/** YYYY-MM -> YYYY年MM月 */
export function formatMonth(dateStr: string): string {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 2) {
    return `${parts[0]}年${parts[1]}月`;
  }
  return dateStr;
}

/** 格式化日期范围 */
export function formatDateRange(start: string, end: string, isCurrent: boolean): string {
  const startFmt = formatMonth(start) || '至今';
  if (isCurrent) {
    return `${startFmt} - 至今`;
  }
  const endFmt = formatMonth(end);
  if (!endFmt) return startFmt;
  return `${startFmt} - ${endFmt}`;
}

/** 生成月份选项列表 */
export function generateMonthOptions(): string[] {
  const options: string[] = [];
  const now = new Date();
  for (let y = now.getFullYear(); y >= 1990; y--) {
    for (let m = 12; m >= 1; m--) {
      options.push(`${y}-${String(m).padStart(2, '0')}`);
    }
  }
  // 加一个未来年份的选项
  for (let m = 12; m >= 1; m--) {
    options.unshift(`${now.getFullYear() + 1}-${String(m).padStart(2, '0')}`);
  }
  return options;
}
