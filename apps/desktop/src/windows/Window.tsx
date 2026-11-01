import { useCallback, useEffect, useRef, type ReactNode } from 'react';
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

interface DragState {
  /** 指针按下时的坐标 */
  startX: number;
  startY: number;
  /** 窗口原始位置 */
  originX: number;
  originY: number;
  /** 相对原始位置的偏移（最新值） */
  offsetX: number;
  offsetY: number;
  /** 已排队的动画帧 id */
  frame: number | null;
}

/**
 * XP 风格窗口。
 *
 * 拖拽性能策略（设计文档 5.1）：
 * - 用 transform: translate3d() 移动，走 GPU 合成层，不动 left/top；
 * - pointermove 用 requestAnimationFrame 节流；
 * - 拖拽期间内容区临时 pointer-events: none 与 will-change: transform；
 * - 拖拽过程中不触发 React 重渲染：直接操作 DOM ref，pointerup 时才提交到 store。
 */
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
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const drag = useRef<DragState | null>(null);

  const maximized = w.mode === 'maximized';

  // 静态定位用 left/top；拖拽偏移走 transform
  const style: React.CSSProperties = maximized
    ? { left: 0, top: 0, width: viewport.width, height: viewport.height - 30, zIndex: w.zIndex }
    : {
        left: w.x,
        top: w.y,
        width: w.width,
        height: w.height,
        zIndex: w.zIndex,
      };

  /** 结束拖拽：清 transform、恢复内容区样式、把最终位置提交到 store */
  const endDrag = useCallback(
    (clientX: number, clientY: number) => {
      const d = drag.current;
      if (!d) return;
      drag.current = null;
      if (d.frame !== null) {
        cancelAnimationFrame(d.frame);
        d.frame = null;
      }
      const el = ref.current;
      if (el) {
        el.style.transform = '';
        el.style.willChange = '';
      }
      const body = bodyRef.current;
      if (body) {
        body.style.pointerEvents = '';
        body.style.willChange = '';
      }
      onMove(d.originX + (clientX - d.startX), d.originY + (clientY - d.startY));
    },
    [onMove],
  );

  useEffect(() => {
    const onMoveEvt = (e: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      d.offsetX = e.clientX - d.startX;
      d.offsetY = e.clientY - d.startY;
      // 已排队的帧还没执行就跳过，避免堆积
      if (d.frame !== null) return;
      d.frame = requestAnimationFrame(() => {
        const cur = drag.current;
        if (!cur) return;
        cur.frame = null;
        const el = ref.current;
        if (!el) return;
        el.style.transform = `translate3d(${cur.offsetX}px, ${cur.offsetY}px, 0)`;
      });
    };
    const onUp = (e: PointerEvent) => {
      if (!drag.current) return;
      endDrag(e.clientX, e.clientY);
    };
    // 监听在 window 上：指针拖出窗口外释放仍能正确结束
    window.addEventListener('pointermove', onMoveEvt);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMoveEvt);
      window.removeEventListener('pointerup', onUp);
    };
  }, [endDrag]);

  const startDrag = (e: React.PointerEvent) => {
    if (maximized) return;
    onFocus();
    drag.current = {
      startX: e.clientX,
      startY: e.clientY,
      originX: w.x,
      originY: w.y,
      offsetX: 0,
      offsetY: 0,
      frame: null,
    };
    // 拖拽期间内容区不吃指针事件，并提示浏览器提前提升合成层
    const el = ref.current;
    if (el) el.style.willChange = 'transform';
    const body = bodyRef.current;
    if (body) {
      body.style.pointerEvents = 'none';
      body.style.willChange = 'transform';
    }
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
      <div className="xp-window-body" ref={bodyRef}>
        {children}
      </div>
    </div>
  );
}
