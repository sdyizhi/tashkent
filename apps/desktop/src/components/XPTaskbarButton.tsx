interface Props {
  label: string;
  active?: boolean;
  onClick: () => void;
}

export default function XPTaskbarButton({ label, active, onClick }: Props) {
  return (
    <button type="button" className={`xp-taskbar-button${active ? ' active' : ''}`} onClick={onClick}>
      {label}
    </button>
  );
}
