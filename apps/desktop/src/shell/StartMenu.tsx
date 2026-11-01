import type { AppDefinition } from '@tashkent/shared';
import { useDesktopStore } from '../state/desktopStore.js';
import { AppIcon } from '../components/icons/index.js';

/** 开始菜单分组顺序：附件在前，系统工具在后 */
const GROUP_ORDER: AppDefinition['group'][] = ['accessories', 'system'];

/**
 * 开始菜单。
 *
 * 列表来自应用注册表（服务端 /api/apps），按 group 分两段渲染，
 * 与 XP 的「程序 / 系统」分段习惯一致。
 */
export default function StartMenu() {
  const open = useDesktopStore((s) => s.startMenuOpen);
  const setOpen = useDesktopStore((s) => s.setStartMenuOpen);
  const openApp = useDesktopStore((s) => s.openApp);
  const apps = useDesktopStore((s) => s.apps);

  if (!open) return null;

  const groups = GROUP_ORDER.map((group) => ({
    group,
    items: apps.filter((a) => a.group === group),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="xp-start-menu" data-testid="start-menu">
      <div className="xp-start-menu-header">Tashkent</div>
      {groups.map((g, gi) => (
        <div key={g.group} data-testid={`start-menu-group-${g.group}`}>
          {gi > 0 ? <hr className="xp-menu-separator" /> : null}
          {g.items.map((a) => (
            <div
              key={a.appId}
              className="xp-menu-item"
              data-testid={`start-menu-item-${a.appId}`}
              onClick={() => {
                void openApp(a.appId);
                setOpen(false);
              }}
            >
              <span className="xp-icon xp-icon-menu">
                <AppIcon appId={a.appId} emoji={a.icon} size={32} />
              </span>
              <span>{a.title}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
