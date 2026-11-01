import { useEffect } from 'react';

export interface ContextMenuItem {
  /** 菜单项文字 */
  label: string;
  /** 点击菜单项时执行 */
  onSelect: () => void;
  /** 禁用态：置灰且不响应点击 */
  disabled?: boolean;
}

interface Props {
  /** 菜单项列表 */
  items: ContextMenuItem[];
  /** 菜单左上角的屏幕坐标 */
  x: number;
  /** 菜单左上角的屏幕坐标 */
  y: number;
  /** 菜单关闭回调（选中菜单项或点击外部时触发） */
  onClose: () => void;
}

/**
 * XP 风格右键菜单。
 *
 * 受控组件：位置由调用方给出（右键事件坐标），
 * 点击菜单项或点击菜单外部时关闭。
 */
export default function ContextMenu({ items, x, y, onClose }: Props) {
  useEffect(() => {
    const close = () => onClose();
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [onClose]);

  return (
    <div
      className="xp-context-menu"
      data-testid="context-menu"
      style={{ left: x, top: y }}
      onClick={(e) => e.stopPropagation()}
    >
      {items.map((it) => (
        <div
          key={it.label}
          className="xp-menu-item"
          data-testid={`context-menu-item-${it.label}`}
          aria-disabled={it.disabled ? 'true' : undefined}
          onClick={() => {
            if (it.disabled) return;
            it.onSelect();
            onClose();
          }}
        >
          {it.label}
        </div>
      ))}
    </div>
  );
}
