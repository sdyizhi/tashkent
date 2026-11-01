import { useEffect, useState } from 'react';
import { useDesktopStore } from '../state/desktopStore.js';
import { useErrorStore } from '../state/errorStore.js';
import { agentEventStream } from '../state/agentEvents.js';
import XPTaskbarButton from '../components/XPTaskbarButton.js';
import { AppIcon } from '../components/icons/index.js';
import XPCalendar from '../components/XPCalendar.js';
import XPTrayBubble from '../components/XPTrayBubble.js';

/** 托盘浮层：日历与状态气泡互斥 */
type TrayPopup = 'calendar' | 'bubble' | null;

export default function Taskbar() {
  const windows = useDesktopStore((s) => s.windows);
  const focusedId = useDesktopStore((s) => s.focusedId);
  const minimize = useDesktopStore((s) => s.minimize);
  const restore = useDesktopStore((s) => s.restore);
  const focus = useDesktopStore((s) => s.focus);
  const startMenuOpen = useDesktopStore((s) => s.startMenuOpen);
  const setStartMenuOpen = useDesktopStore((s) => s.setStartMenuOpen);
  const [now, setNow] = useState(() => new Date());

  // 未捕获异常的数量 → 托盘红点（设计文档 5.6）
  const errors = useErrorStore((s) => s.errors);
  const errorCount = errors.length;
  const clearError = useErrorStore((s) => s.clearError);

  // 托盘浮层：双击时钟开日历，点托盘图标开状态气泡
  const [popup, setPopup] = useState<TrayPopup>(null);

  // SSE 连接状态（托盘气泡里显示）
  const [connected, setConnected] = useState(agentEventStream.isConnected);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => agentEventStream.subscribeConnection(setConnected), []);

  // 开始菜单打开时收起托盘浮层，避免两层浮层叠在一起
  useEffect(() => {
    if (startMenuOpen) setPopup(null);
  }, [startMenuOpen]);

  const clock = now.toLocaleTimeString('zh-CN', { hour12: false });

  const togglePopup = (next: Exclude<TrayPopup, null>) => {
    setPopup((cur) => (cur === next ? null : next));
  };

  return (
    <div className="xp-taskbar" data-testid="taskbar">
      <button
        type="button"
        className="xp-start-button"
        data-testid="start-button"
        onClick={() => setStartMenuOpen(!startMenuOpen)}
      >
        开始
      </button>
      {windows.map((w) => (
        <XPTaskbarButton
          key={w.id}
          label={w.title}
          icon={<AppIcon appId={w.appId} emoji={w.icon} size={16} />}
          active={w.id === focusedId && w.mode !== 'minimized'}
          onClick={() => {
            if (w.mode === 'minimized') void restore(w.id);
            else if (w.id === focusedId) void minimize(w.id);
            else focus(w.id);
          }}
        />
      ))}
      <div className="xp-tray">
        {errorCount > 0 ? (
          <button
            type="button"
            className="xp-tray-error"
            data-testid="tray-error-badge"
            aria-label={`${errorCount} 个未处理的错误`}
            title={errors.map((e) => e.message).join('\n')}
            onClick={() => {
              for (const e of errors) clearError(e.id);
            }}
          >
            <span aria-hidden="true">❗</span>
            <span data-testid="tray-error-count">{errorCount}</span>
          </button>
        ) : null}
        <button
          type="button"
          className="xp-tray-icon"
          data-testid="tray-icon"
          aria-label="系统状态"
          title="系统状态"
          onClick={() => togglePopup('bubble')}
        >
          <span aria-hidden="true">🔊</span>
        </button>
        <button
          type="button"
          className="xp-tray-clock"
          data-testid="clock"
          aria-label="时钟，双击查看日历"
          onDoubleClick={() => togglePopup('calendar')}
        >
          {clock}
        </button>
      </div>

      {popup === 'calendar' ? (
        <XPCalendar now={now} onClose={() => setPopup(null)} />
      ) : null}
      {popup === 'bubble' ? (
        <XPTrayBubble connected={connected} onClose={() => setPopup(null)} />
      ) : null}
    </div>
  );
}
