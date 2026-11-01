import type { ReactNode } from 'react';

interface Props {
  label: string;
  active?: boolean;
  /** 任务栏按钮左侧的小图标 */
  icon?: ReactNode;
  onClick: () => void;
}

export default function XPTaskbarButton({ label, active, icon, onClick }: Props) {
  return (
    <button type="button" className={`xp-taskbar-button${active ? ' active' : ''}`} onClick={onClick}>
      {icon ? <span className="xp-taskbar-button-icon">{icon}</span> : null}
      <span className="xp-taskbar-button-label">{label}</span>
    </button>
  );
}
