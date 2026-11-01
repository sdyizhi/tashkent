import { useEffect, useState, type ReactNode } from 'react';
import { useDesktopStore } from '../state/desktopStore.js';
import Window from '../windows/Window.js';

interface Props {
  renderApp: (appId: string, sessionId?: string, params?: Record<string, unknown>) => ReactNode;
}

export default function WindowLayer({ renderApp }: Props) {
  const windows = useDesktopStore((s) => s.windows);
  const focusedId = useDesktopStore((s) => s.focusedId);
  const close = useDesktopStore((s) => s.close);
  const minimize = useDesktopStore((s) => s.minimize);
  const maximize = useDesktopStore((s) => s.maximize);
  const move = useDesktopStore((s) => s.move);
  const focus = useDesktopStore((s) => s.focus);

  const [viewport, setViewport] = useState({ width: window.innerWidth, height: window.innerHeight });

  useEffect(() => {
    const onResize = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return (
    <>
      {windows.map((w) =>
        w.mode === 'minimized' ? null : (
          <Window
            key={w.id}
            window={w}
            focused={w.id === focusedId}
            viewport={viewport}
            onFocus={() => focus(w.id)}
            onClose={() => void close(w.id)}
            onMinimize={() => void minimize(w.id)}
            onMaximize={() => void maximize(w.id)}
            onMove={(x, y) => move(w.id, x, y)}
          >
            {renderApp(w.appId, w.sessionId, w.params)}
          </Window>
        ),
      )}
    </>
  );
}
