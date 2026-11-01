import { useDesktopStore } from '../state/desktopStore.js';

export default function StartMenu() {
  const open = useDesktopStore((s) => s.startMenuOpen);
  const setOpen = useDesktopStore((s) => s.setStartMenuOpen);
  const openApp = useDesktopStore((s) => s.openApp);
  const apps = useDesktopStore((s) => s.apps);

  if (!open) return null;

  return (
    <div className="xp-start-menu" data-testid="start-menu">
      <div className="xp-start-menu-header">Tashkent</div>
      {apps.map((a) => (
        <div
          key={a.appId}
          className="xp-menu-item"
          data-testid={`start-menu-item-${a.appId}`}
          onClick={() => {
            openApp(a.appId);
            setOpen(false);
          }}
        >
          <span className="xp-icon" style={{ width: 24, height: 24, fontSize: 16 }}>
            {a.icon}
          </span>
          <span>{a.title}</span>
        </div>
      ))}
    </div>
  );
}
