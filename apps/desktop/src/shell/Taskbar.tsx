import { useEffect, useState } from 'react';
import { useDesktopStore } from '../state/desktopStore.js';
import XPTaskbarButton from '../components/XPTaskbarButton.js';

export default function Taskbar() {
  const windows = useDesktopStore((s) => s.windows);
  const focusedId = useDesktopStore((s) => s.focusedId);
  const minimize = useDesktopStore((s) => s.minimize);
  const restore = useDesktopStore((s) => s.restore);
  const focus = useDesktopStore((s) => s.focus);
  const startMenuOpen = useDesktopStore((s) => s.startMenuOpen);
  const setStartMenuOpen = useDesktopStore((s) => s.setStartMenuOpen);
  const [now, setNow] = useState(() => new Date());

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
          label={`${w.icon} ${w.title}`}
          active={w.id === focusedId && w.mode !== 'minimized'}
          onClick={() => {
            if (w.mode === 'minimized') void restore(w.id);
            else if (w.id === focusedId) void minimize(w.id);
            else focus(w.id);
          }}
        />
      ))}
      <div className="xp-tray">
        <span aria-hidden="true">🔊</span>
        <span data-testid="clock">{clock}</span>
      </div>
    </div>
  );
}
