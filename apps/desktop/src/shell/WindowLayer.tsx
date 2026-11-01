import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useDesktopStore } from '../state/desktopStore.js';
import Window from '../windows/Window.js';
import XPErrorBoundary from '../components/XPErrorBoundary.js';
import ContextMenu, { type ContextMenuItem } from './ContextMenu.js';
import AltTabSwitcher from './AltTabSwitcher.js';
import { useAltTab } from './useAltTab.js';

interface Props {
  renderApp: (appId: string, sessionId?: string, params?: Record<string, unknown>) => ReactNode;
}

/** 右键标题栏弹出的菜单上下文 */
interface TitleMenuState {
  windowId: string;
  x: number;
  y: number;
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
  const restore = useDesktopStore((s) => s.restore);
  const move = useDesktopStore((s) => s.move);
  const focus = useDesktopStore((s) => s.focus);

  const [viewport, setViewport] = useState({ width: window.innerWidth, height: window.innerHeight });
  /** 右键标题栏菜单的上下文 */
  const [titleMenu, setTitleMenu] = useState<TitleMenuState | null>(null);

  useEffect(() => {
    const onResize = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Alt+Tab 切换窗口：激活时把目标窗口置顶（最小化的先还原）
  const altTab = useAltTab({
    windows,
    focusedId,
    onActivate: (id) => {
      const target = windows.find((w) => w.id === id);
      if (!target) return;
      if (target.mode === 'minimized') void restore(id);
      else focus(id);
    },
  });

  const closeTitleMenu = useCallback(() => setTitleMenu(null), []);

  /** 构造右键标题栏菜单的菜单项 */
  const buildTitleMenuItems = (windowId: string): ContextMenuItem[] => {
    const target = windows.find((w) => w.id === windowId);
    const notNormal = target?.mode !== 'normal';
    return [
      {
        label: '还原',
        onSelect: () => void restore(windowId),
        disabled: !notNormal,
      },
      {
        // 键盘移动窗口在本阶段未实现，先置灰
        label: '移动',
        onSelect: () => {},
        disabled: true,
      },
      {
        // 键盘调整窗口大小在本阶段未实现，先置灰
        label: '大小',
        onSelect: () => {},
        disabled: true,
      },
      {
        label: '最小化',
        onSelect: () => void minimize(windowId),
        disabled: target?.minimizable === false,
      },
      {
        label: '最大化',
        onSelect: () => void maximize(windowId),
        disabled: target?.maximizable === false,
      },
      {
        label: '关闭',
        onSelect: () => void close(windowId),
      },
    ];
  };

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
            onRestore={() => void restore(w.id)}
            onMove={(x, y) => move(w.id, x, y)}
            onContextMenu={(e) => setTitleMenu({ windowId: w.id, x: e.clientX, y: e.clientY })}
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
      {titleMenu ? (
        <ContextMenu
          items={buildTitleMenuItems(titleMenu.windowId)}
          x={titleMenu.x}
          y={titleMenu.y}
          onClose={closeTitleMenu}
        />
      ) : null}
      {altTab.visible ? (
        <AltTabSwitcher
          candidates={altTab.candidates}
          activeId={altTab.activeId}
          onActivate={altTab.activate}
          onCancel={altTab.cancel}
        />
      ) : null}
    </>
  );
}
