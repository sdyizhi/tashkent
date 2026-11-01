import { useState } from 'react';
import {
  buildMonthGrid,
  formatMonthTitle,
  WEEKDAY_HEADERS,
} from './calendar.js';

interface Props {
  /** 今天，用于高亮 */
  now: Date;
  onClose: () => void;
}

/**
 * XP 风格月历浮层。
 *
 * 双击任务栏时钟打开；可翻到上/下个月，也可一键回到今天。
 */
export default function XPCalendar({ now, onClose }: Props) {
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const cells = buildMonthGrid(year, month, now);

  const shift = (delta: number) => {
    const next = new Date(year, month - 1 + delta, 1);
    setYear(next.getFullYear());
    setMonth(next.getMonth() + 1);
  };

  const backToToday = () => {
    setYear(now.getFullYear());
    setMonth(now.getMonth() + 1);
  };

  const isCurrentView =
    year === now.getFullYear() && month === now.getMonth() + 1;

  return (
    <div className="xp-calendar xp-tray-popup" data-testid="calendar-popup">
      <div className="xp-calendar-header">
        <button
          type="button"
          className="xp-calendar-nav"
          data-testid="calendar-prev"
          aria-label="上个月"
          onClick={() => shift(-1)}
        >
          ‹
        </button>
        <span className="xp-calendar-title" data-testid="calendar-title">
          {formatMonthTitle(year, month)}
        </span>
        <button
          type="button"
          className="xp-calendar-nav"
          data-testid="calendar-next"
          aria-label="下个月"
          onClick={() => shift(1)}
        >
          ›
        </button>
      </div>

      <div className="xp-calendar-weekdays">
        {WEEKDAY_HEADERS.map((w) => (
          <span key={w} className="xp-calendar-weekday">
            {w}
          </span>
        ))}
      </div>

      <div className="xp-calendar-grid" data-testid="calendar-grid">
        {cells.map((c) => (
          <span
            key={c.date}
            className="xp-calendar-day"
            data-testid={`calendar-day-${c.date}`}
            data-current-month={c.isCurrentMonth ? 'true' : 'false'}
            data-today={c.isToday ? 'true' : 'false'}
          >
            {c.day}
          </span>
        ))}
      </div>

      <div className="xp-calendar-footer">
        <button
          type="button"
          className="xp-calendar-today-btn"
          data-testid="calendar-today"
          onClick={backToToday}
          disabled={isCurrentView}
        >
          今天
        </button>
        <button
          type="button"
          className="xp-calendar-close-btn"
          data-testid="calendar-close"
          onClick={onClose}
        >
          关闭
        </button>
      </div>
    </div>
  );
}
