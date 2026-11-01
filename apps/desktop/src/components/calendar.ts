/**
 * 月历网格计算（纯函数，便于单测）。
 *
 * 网格固定 6 行 × 7 列，与 XP 的月历一致：
 * 首行补上个月��末尾的日期，末行补上下个月开头的日期。
 */

export interface CalendarCell {
  /** YYYY-MM-DD */
  date: string;
  /** 日号 */
  day: number;
  /** 是否属于当前展示的月份 */
  isCurrentMonth: boolean;
  /** 是否是今天 */
  isToday: boolean;
}

/** 一周七天的表头（中文习惯，周日开头） */
export const WEEKDAY_HEADERS = ['日', '一', '二', '三', '四', '五', '六'];

/** 把日期格式化成 YYYY-MM-DD */
export function formatDate(year: number, month: number, day: number): string {
  const m = String(month).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${year}-${m}-${d}`;
}

/**
 * 生成某个月的日历网格。
 *
 * @param year 展示的年份
 * @param month 展示的月份（1–12）
 * @param today 今天，用于高亮
 */
export function buildMonthGrid(year: number, month: number, today: Date): CalendarCell[] {
  const firstDay = new Date(year, month - 1, 1);
  // 该月第一天是周几（0 = 周日）
  const leading = firstDay.getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const daysInPrevMonth = new Date(year, month - 1, 0).getDate();

  const todayKey = formatDate(today.getFullYear(), today.getMonth() + 1, today.getDate());

  const cells: CalendarCell[] = [];
  for (let i = 0; i < 42; i += 1) {
    const offset = i - leading;
    let cellYear = year;
    let cellMonth = month;
    let day: number;
    let isCurrentMonth: boolean;

    if (offset < 0) {
      cellMonth = month - 1;
      if (cellMonth < 1) {
        cellMonth = 12;
        cellYear = year - 1;
      }
      day = daysInPrevMonth + offset + 1;
      isCurrentMonth = false;
    } else if (offset >= daysInMonth) {
      cellMonth = month + 1;
      if (cellMonth > 12) {
        cellMonth = 1;
        cellYear = year + 1;
      }
      day = offset - daysInMonth + 1;
      isCurrentMonth = false;
    } else {
      day = offset + 1;
      isCurrentMonth = true;
    }

    const date = formatDate(cellYear, cellMonth, day);
    cells.push({ date, day, isCurrentMonth, isToday: date === todayKey });
  }

  return cells;
}

/** 月份标题，如「2026年1月」 */
export function formatMonthTitle(year: number, month: number): string {
  return `${year}年${month}月`;
}
