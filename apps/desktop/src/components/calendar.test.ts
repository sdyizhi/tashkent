import { describe, expect, it } from 'vitest';
import { buildMonthGrid, formatDate, formatMonthTitle, WEEKDAY_HEADERS } from './calendar.js';

describe('buildMonthGrid', () => {
  it('总是生成 6 行 × 7 列 = 42 个格子', () => {
    const cells = buildMonthGrid(2026, 1, new Date(2026, 0, 15));
    expect(cells).toHaveLength(42);
  });

  it('一周从周日开始，表头也是周日开头', () => {
    expect(WEEKDAY_HEADERS).toEqual(['日', '一', '二', '三', '四', '五', '六']);
    const cells = buildMonthGrid(2026, 1, new Date(2026, 0, 15));
    // 2026-01-01 是周四，前面补 4 个上月的日子
    expect(cells[0]?.date).toBe('2025-12-28');
    expect(cells[3]?.isCurrentMonth).toBe(false);
    expect(cells[4]?.date).toBe('2026-01-01');
    expect(cells[4]?.isCurrentMonth).toBe(true);
  });

  it('标记出今天', () => {
    const cells = buildMonthGrid(2026, 1, new Date(2026, 0, 15));
    const today = cells.filter((c) => c.isToday);
    expect(today).toHaveLength(1);
    expect(today[0]?.date).toBe('2026-01-15');
    expect(today[0]?.isCurrentMonth).toBe(true);
  });

  it('当前月的日期个数正确（31 天 / 28 天）', () => {
    const jan = buildMonthGrid(2026, 1, new Date(2026, 0, 15));
    expect(jan.filter((c) => c.isCurrentMonth)).toHaveLength(31);

    const feb = buildMonthGrid(2026, 2, new Date(2026, 1, 15));
    expect(feb.filter((c) => c.isCurrentMonth)).toHaveLength(28);
  });

  it('跨年时上个月是上一年 12 月', () => {
    const cells = buildMonthGrid(2026, 1, new Date(2026, 0, 15));
    expect(cells[0]?.date).toBe('2025-12-28');
  });

  it('12 月翻到下一年 1 月时下个月补位正确', () => {
    // 2026-12-01 是周二，前面补 2 天
    const cells = buildMonthGrid(2026, 12, new Date(2026, 11, 15));
    expect(cells[0]?.date).toBe('2026-11-29');
    expect(cells[1]?.date).toBe('2026-11-30');
    expect(cells[2]?.date).toBe('2026-12-01');
  });

  it('闰年 2 月有 29 天', () => {
    const cells = buildMonthGrid(2028, 2, new Date(2028, 1, 15));
    expect(cells.filter((c) => c.isCurrentMonth)).toHaveLength(29);
  });
});

describe('formatDate / formatMonthTitle', () => {
  it('补零输出 YYYY-MM-DD', () => {
    expect(formatDate(2026, 1, 5)).toBe('2026-01-05');
    expect(formatDate(2026, 12, 31)).toBe('2026-12-31');
  });

  it('月份标题形如「2026年1月」', () => {
    expect(formatMonthTitle(2026, 1)).toBe('2026年1月');
    expect(formatMonthTitle(2026, 12)).toBe('2026年12月');
  });
});
