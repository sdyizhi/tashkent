import { useDesktopStore } from '../state/desktopStore.js';

export default function DesktopIcons() {
  const icons = useDesktopStore((s) => s.icons);
  const openApp = useDesktopStore((s) => s.openApp);
  const setStartMenuOpen = useDesktopStore((s) => s.setStartMenuOpen);

  if (icons.length === 0) return null;

  return (
    <div className="xp-desktop-icons" data-testid="desktop-icons">
      {icons.map((icon) => (
        <div
          key={icon.appId}
          className="xp-desktop-icon"
          data-testid={`desktop-icon-${icon.appId}`}
          onDoubleClick={() => void openApp(icon.appId)}
          onClick={() => setStartMenuOpen(false)}
        >
          <div className="xp-icon">{icon.icon}</div>
          <div className="xp-desktop-icon-label">{icon.title}</div>
        </div>
      ))}
    </div>
  );
}
