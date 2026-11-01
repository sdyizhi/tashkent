import { useEffect, useState, type ReactNode } from 'react';
import { useDesktopStore } from '../state/desktopStore.js';
import Window from '../windows/Window.js';
import XPErrorBoundary from '../components/XPErrorBoundary.js';

interface Props {
  renderApp: (appId: string, sessionId?: string, params?: Record<string, unknown>) => ReactNode;
}

/**
 * 窗口内容的承载组件。
 *
 * 单独抽一层是为了让 renderApp 的调用发生在 ErrorBoundary 的子树里：
 * 否则应用渲染函数在 WindowLayer 自身的渲染阶段就抛错，
 * 错误边界捕获不到，整桌会白屏。
 */
function AppContent({
  renderApp,
  appId,
  sessionId,
  params,
}: {
  renderApp: Props['renderApp'];
  appId: string;
  sessionId?: string;
  params?: Record<string, unknown>;
}) {
  return <>{renderApp(appId, sessionId, params)}</>;
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
            {/* 单窗口崩溃只影响该窗口，不影响整个桌面（设计文档 5.6） */}
            <XPErrorBoundary onClose={() => void close(w.id)}>
              <AppContent
                renderApp={renderApp}
                appId={w.appId}
                sessionId={w.sessionId}
                params={w.params}
              />
            </XPErrorBoundary>
          </Window>
        ),
      )}
    </>
  );
}
