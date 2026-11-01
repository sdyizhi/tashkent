import { useEffect, useState } from 'react';

interface Props {
  items: Array<{ label: string; onSelect: () => void }>;
}

export default function ContextMenu({ items }: Props) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const close = () => setPos(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, []);

  if (!pos) return null;

  return (
    <div
      className="xp-context-menu"
      style={{ left: pos.x, top: pos.y }}
      onClick={(e) => e.stopPropagation()}
    >
      {items.map((it) => (
        <div
          key={it.label}
          className="xp-menu-item"
          onClick={() => {
            it.onSelect();
            setPos(null);
          }}
        >
          {it.label}
        </div>
      ))}
    </div>
  );
}
