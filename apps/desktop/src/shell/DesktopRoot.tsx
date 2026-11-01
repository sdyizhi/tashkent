import { useEffect } from 'react';
import { useDesktopStore } from '../state/desktopStore.js';
import Wallpaper from './Wallpaper.js';
import DesktopIcons from './DesktopIcons.js';
import WindowLayer from './WindowLayer.js';
import Taskbar from './Taskbar.js';
import StartMenu from './StartMenu.js';
import ChatApp from '../apps/ChatApp.js';
import FilesApp from '../apps/FilesApp.js';

export default function DesktopRoot() {
  const setIcons = useDesktopStore((s) => s.setIcons);
  const setStartMenuOpen = useDesktopStore((s) => s.setStartMenuOpen);

  useEffect(() => {
    setIcons([
      { appId: 'chat', title: '对话', icon: '💬', x: 0, y: 0 },
      { appId: 'files', title: '我的文档', icon: '📁', x: 0, y: 0 },
    ]);
  }, [setIcons]);

  useEffect(() => {
    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      setStartMenuOpen(false);
    };
    window.addEventListener('contextmenu', onContextMenu);
    return () => window.removeEventListener('contextmenu', onContextMenu);
  }, [setStartMenuOpen]);

  return (
    <div style={{ position: 'relative', height: '100%', overflow: 'hidden' }}>
      <Wallpaper />
      <DesktopIcons />
      <WindowLayer
        renderApp={(appId) => {
          if (appId === 'files') return <FilesApp />;
          return <ChatApp />;
        }}
      />
      <StartMenu />
      <Taskbar />
    </div>
  );
}
