import { useEffect } from 'react';
import { useDesktopStore } from '../state/desktopStore.js';
import { useDesktopEvents } from '../state/useDesktopEvents.js';
import { useAuthorizationStore } from '../state/authorizationStore.js';
import Wallpaper from './Wallpaper.js';
import DesktopIcons from './DesktopIcons.js';
import WindowLayer from './WindowLayer.js';
import Taskbar from './Taskbar.js';
import StartMenu from './StartMenu.js';
import ChatApp from '../apps/ChatApp.js';
import FilesApp from '../apps/FilesApp.js';
import AuthorizationDialog from '../components/AuthorizationDialog.js';

const DEFAULT_ICONS = [
  { appId: 'chat', title: '对话', icon: '💬', x: 0, y: 0 },
  { appId: 'files', title: '我的文档', icon: '📁', x: 0, y: 0 },
];

export default function DesktopRoot() {
  const setIcons = useDesktopStore((s) => s.setIcons);
  const setStartMenuOpen = useDesktopStore((s) => s.setStartMenuOpen);

  const { notifications, dismissNotification } = useDesktopEvents();

  const authRequest = useAuthorizationStore((s) => s.request);
  const clearRequest = useAuthorizationStore((s) => s.clearRequest);

  useEffect(() => {
    setIcons(DEFAULT_ICONS);
  }, [setIcons]);

  useEffect(() => {
    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      setStartMenuOpen(false);
    };
    window.addEventListener('contextmenu', onContextMenu);
    return () => window.removeEventListener('contextmenu', onContextMenu);
  }, [setStartMenuOpen]);

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
          if (appId === 'files') return <FilesApp />;
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
