import { useEffect } from 'react';
import { APP_REGISTRY, type AppDefinition } from '@tashkent/shared';
import { useDesktopStore } from '../state/desktopStore.js';
import { useDesktopEvents } from '../state/useDesktopEvents.js';
import { useAuthorizationStore } from '../state/authorizationStore.js';
import { setupUnhandledRejectionCapture } from '../state/unhandledRejection.js';
import Wallpaper from './Wallpaper.js';
import DesktopIcons from './DesktopIcons.js';
import WindowLayer from './WindowLayer.js';
import Taskbar from './Taskbar.js';
import StartMenu from './StartMenu.js';
import ChatApp from '../apps/ChatApp.js';
import FilesApp from '../apps/FilesApp.js';
import AuthorizationDialog from '../components/AuthorizationDialog.js';

export default function DesktopRoot() {
  const setApps = useDesktopStore((s) => s.setApps);
  const setStartMenuOpen = useDesktopStore((s) => s.setStartMenuOpen);
  const persist = useDesktopStore((s) => s.persist);
  const restoreLayout = useDesktopStore((s) => s.restoreLayout);
  const windows = useDesktopStore((s) => s.windows);
  const icons = useDesktopStore((s) => s.icons);

  // useDesktopEvents 会在启动时拉取服务端权威的窗口列表快照（重启后布局得以恢复）
  const { notifications, dismissNotification } = useDesktopEvents();

  const authRequest = useAuthorizationStore((s) => s.request);
  const clearRequest = useAuthorizationStore((s) => s.clearRequest);

  // 从服务端取应用注册表 → 恢复旧布局 → 按注册表派生桌面图标。
  // 注册表以服务端为准，离线时回退到共享常量，桌面依然可用。
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let list = APP_REGISTRY;
      try {
        const res = await fetch('/api/apps');
        if (res.ok) {
          const body = (await res.json()) as { apps: AppDefinition[] };
          if (body.apps.length > 0) list = body.apps;
        }
      } catch {
        // 离线时用共享常量兜底
      }
      if (cancelled) return;
      setApps(list);
      await restoreLayout();
      if (cancelled) return;
      // restoreLayout 写回的是旧布局里的图标，这里按注册表重新派生一次
      setApps(list);
    })();
    return () => {
      cancelled = true;
    };
  }, [restoreLayout, setApps]);

  // 桌面状态变化后持久化到服务端（去抖，避免拖拽时高频写入）
  useEffect(() => {
    if (icons.length === 0) return;
    const timer = setTimeout(() => void persist(), 300);
    return () => clearTimeout(timer);
  }, [icons, windows, persist]);

  useEffect(() => {
    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      setStartMenuOpen(false);
    };
    window.addEventListener('contextmenu', onContextMenu);
    return () => window.removeEventListener('contextmenu', onContextMenu);
  }, [setStartMenuOpen]);

  // 全局未捕获的 Promise rejection → 托盘红点提示（设计文档 5.6）
  useEffect(() => setupUnhandledRejectionCapture(), []);

  const decideAuthorization = async (approved: boolean, remember: boolean) => {
    const request = useAuthorizationStore.getState().request;
    if (!request) return;
    clearRequest(request.authorizationId);
    try {
      await fetch(`/api/tools/${encodeURIComponent(request.toolName)}/authorize`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          authorizationId: request.authorizationId,
          approved,
          remember,
        }),
      });
    } catch {
      // 回传失败时服务端会在超时后按拒绝处理
    }
  };

  return (
    <div style={{ position: 'relative', height: '100%', overflow: 'hidden' }}>
      <Wallpaper />
      <DesktopIcons />
      <WindowLayer
        renderApp={(appId, sessionId) => {
          if (appId === 'files') return <FilesApp sessionId={sessionId} />;
          return <ChatApp sessionId={sessionId} />;
        }}
      />
      <StartMenu />
      <Taskbar />
      <div className="xp-notifications" data-testid="desktop-notifications">
        {notifications.map((n) => (
          <div
            key={n.id}
            className="xp-notification"
            data-testid="desktop-notification"
            onClick={() => dismissNotification(n.id)}
          >
            <span className="xp-notification-icon" aria-hidden="true">
              {n.icon}
            </span>
            <span>{n.message}</span>
          </div>
        ))}
      </div>
      <AuthorizationDialog
        request={authRequest}
        onDecide={(approved, remember) => void decideAuthorization(approved, remember)}
      />
    </div>
  );
}
