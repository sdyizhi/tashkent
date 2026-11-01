import { useEffect, useState } from 'react';
import { useDesktopStore } from '../state/desktopStore.js';
import { useErrorStore } from '../state/errorStore.js';
import XPTaskbarButton from '../components/XPTaskbarButton.js';
import { AppIcon } from '../components/icons/index.js';

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

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const clock = now.toLocaleTimeString('zh-CN', { hour12: false });

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
        <span aria-hidden="true">🔊</span>
        <span data-testid="clock">{clock}</span>
      </div>
    </div>
  );
}
