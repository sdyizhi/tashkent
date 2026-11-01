import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { WindowState } from '@tashkent/shared';
import XPButton from '../components/XPButton.js';

interface Props {
  window: WindowState;
  focused: boolean;
  viewport: { width: number; height: number };
  onFocus: () => void;
  onClose: () => void;
  onMinimize: () => void;
  onMaximize: () => void;
  onMove: (x: number, y: number) => void;
  children: ReactNode;
}

export default function Window({
  window: w,
  focused,
  viewport,
  onFocus,
  onClose,
  onMinimize,
  onMaximize,
  onMove,
  children,
}: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(null);

  const maximized = w.mode === 'maximized';

  const style: React.CSSProperties = maximized
    ? { left: 0, top: 0, width: viewport.width, height: viewport.height - 30, zIndex: w.zIndex }
    : {
        left: w.x + (dragOffset?.x ?? 0),
        top: w.y + (dragOffset?.y ?? 0),
        width: w.width,
        height: w.height,
        zIndex: w.zIndex,
      };

  useEffect(() => {
    if (!drag.current) return;
    const onMoveEvt = (e: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      setDragOffset({ x: e.clientX - d.startX, y: e.clientY - d.startY });
    };
    const onUp = (e: PointerEvent) => {
      const d = drag.current;
      drag.current = null;
      setDragOffset(null);
      if (d) onMove(d.originX + (e.clientX - d.startX), d.originY + (e.clientY - d.startY));
    };
    window.addEventListener('pointermove', onMoveEvt);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMoveEvt);
      window.removeEventListener('pointerup', onUp);
    };
  }, [onMove]);

  const startDrag = (e: React.PointerEvent) => {
    if (maximized) return;
    onFocus();
    drag.current = { startX: e.clientX, startY: e.clientY, originX: w.x, originY: w.y };
  };

  return (
    <div ref={ref} className="xp-window" style={style} onPointerDown={onFocus} data-testid={`window-${w.appId}`}>
      <div
        className={`xp-titlebar${focused ? '' : ' inactive'}`}
        onPointerDown={startDrag}
        onDoubleClick={() => onMaximize()}
      >
        <span className="xp-titlebar-title">
          {w.icon} {w.title}
        </span>
        <span className="xp-titlebar-buttons">
          <XPButton aria-label="最小化" onClick={onMinimize} disabled={!w.minimizable}>
            _
          </XPButton>
          <XPButton aria-label="最大化" onClick={onMaximize} disabled={!w.maximizable}>
            ▫
          </XPButton>
          <XPButton variant="close" aria-label="关闭" onClick={onClose}>
            ✕
          </XPButton>
        </span>
      </div>
      <div className="xp-window-body">{children}</div>
    </div>
  );
}
