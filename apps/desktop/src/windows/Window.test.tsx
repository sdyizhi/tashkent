import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { WindowState } from '@tashkent/shared';
import Window from './Window.js';

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

const baseWindow: WindowState = {
  id: 'w1',
  appId: 'chat',
  title: '对话',
  icon: '💬',
  mode: 'normal',
  x: 100,
  y: 80,
  width: 640,
  height: 480,
  zIndex: 11,
  restoreGeometry: { x: 100, y: 80, width: 640, height: 480 },
  resizable: true,
  minimizable: true,
  maximizable: true,
};

interface Handlers {
  onMove: ReturnType<typeof vi.fn>;
  onMaximize: ReturnType<typeof vi.fn>;
  onRestore: ReturnType<typeof vi.fn>;
  onClose: ReturnType<typeof vi.fn>;
  onMinimize: ReturnType<typeof vi.fn>;
  onContextMenu: ReturnType<typeof vi.fn>;
  container: HTMLElement;
  root: Root;
  unmount: () => void;
}

function render(overrides: Partial<WindowState> = {}): Handlers {
  const onMove = vi.fn();
  const onMaximize = vi.fn();
  const onRestore = vi.fn();
  const onClose = vi.fn();
  const onMinimize = vi.fn();
  const onContextMenu = vi.fn();
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);

  function Probe() {
    return createElement(Window, {
      window: { ...baseWindow, ...overrides },
      focused: true,
      viewport: { width: 1024, height: 768 },
      onFocus: () => {},
      onClose,
      onMinimize,
      onMaximize,
      onRestore,
      onMove,
      onContextMenu,
      children: createElement('div', null, '内容'),
    });
  }

  act(() => {
    root.render(createElement(Probe));
  });

  return {
    onMove,
    onMaximize,
    onRestore,
    onClose,
    onMinimize,
    onContextMenu,
    container,
    root,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

function titlebar(container: HTMLElement): HTMLElement {
  const el = container.querySelector<HTMLElement>('.xp-titlebar');
  if (!el) throw new Error('no titlebar');
  return el;
}

function windowEl(container: HTMLElement): HTMLElement {
  const el = container.querySelector<HTMLElement>('.xp-window');
  if (!el) throw new Error('no window');
  return el;
}

function bodyEl(container: HTMLElement): HTMLElement {
  const el = container.querySelector<HTMLElement>('.xp-window-body');
  if (!el) throw new Error('no body');
  return el;
}

/**
 * 模拟一次指针事件。
 *
 * jsdom 没有 PointerEvent，用 MouseEvent 带上对应的 type 即可：
 * React 按事件名分发，clientX / clientY 语义一致。
 */
function firePointer(target: EventTarget, type: string, clientX: number, clientY: number): void {
  target.dispatchEvent(
    new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      clientX,
      clientY,
    }),
  );
}

/** 模拟一次 pointerdown（起点） */
function pointerDown(el: HTMLElement, clientX: number, clientY: number): void {
  act(() => {
    firePointer(el, 'pointerdown', clientX, clientY);
  });
}

/** 模拟一次 window 级别的 pointermove */
function pointerMove(clientX: number, clientY: number): void {
  act(() => {
    firePointer(window, 'pointermove', clientX, clientY);
  });
}

/** 模拟一次 window 级别的 pointerup */
function pointerUp(clientX: number, clientY: number): void {
  act(() => {
    firePointer(window, 'pointerup', clientX, clientY);
  });
}

/** 推进 requestAnimationFrame 队列 */
async function flushFrames(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 32));
  });
}

describe('Window 拖拽性能', () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = undefined;
    vi.restoreAllMocks();
  });

  it('拖拽期间用 transform 移动，而不是改 left/top', async () => {
    const view = render();
    pointerDown(titlebar(view.container), 150, 90);
    pointerMove(250, 190);
    await flushFrames();

    const el = windowEl(view.container);
    expect(el.style.transform).toContain('translate3d');
    expect(el.style.left).toBe('100px');
    expect(el.style.top).toBe('80px');

    view.unmount();
  });

  it('拖拽期间不提交到 store（不调用 onMove）', async () => {
    const view = render();
    pointerDown(titlebar(view.container), 150, 90);
    pointerMove(250, 190);
    pointerMove(350, 290);
    await flushFrames();

    expect(view.onMove).not.toHaveBeenCalled();

    view.unmount();
  });

  it('pointerup 时才把最终位置提交到 store', async () => {
    const view = render();
    pointerDown(titlebar(view.container), 150, 90);
    pointerMove(250, 190);
    pointerUp(250, 190);

    expect(view.onMove).toHaveBeenCalledTimes(1);
    expect(view.onMove).toHaveBeenCalledWith(200, 180);

    view.unmount();
  });

  it('拖拽结束后清掉 transform', async () => {
    const view = render();
    pointerDown(titlebar(view.container), 150, 90);
    pointerMove(250, 190);
    await flushFrames();
    pointerUp(250, 190);

    const el = windowEl(view.container);
    expect(el.style.transform).toBe('');

    view.unmount();
  });

  it('拖拽期间内容区 pointer-events 为 none，结束后恢复', async () => {
    const view = render();
    const body = bodyEl(view.container);

    pointerDown(titlebar(view.container), 150, 90);
    expect(body.style.pointerEvents).toBe('none');
    expect(body.style.willChange).toBe('transform');

    pointerMove(250, 190);
    pointerUp(250, 190);
    expect(body.style.pointerEvents).toBe('');
    expect(body.style.willChange).toBe('');

    view.unmount();
  });

  it('拖拽期间用 requestAnimationFrame 节流 pointermove', async () => {
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame');
    const view = render();

    pointerDown(titlebar(view.container), 150, 90);
    pointerMove(250, 190);
    pointerMove(260, 200);
    pointerMove(270, 210);

    // 多次 pointermove 只应调度少量帧
    expect(rafSpy.mock.calls.length).toBeLessThanOrEqual(3);

    await flushFrames();
    view.unmount();
  });

  it('最大化窗口不响应拖拽', () => {
    const view = render({ mode: 'maximized' });
    pointerDown(titlebar(view.container), 150, 90);
    pointerMove(250, 190);
    pointerUp(250, 190);

    expect(view.onMove).not.toHaveBeenCalled();
    view.unmount();
  });

  it('拖出窗口外释放仍能提交位置', () => {
    const view = render();
    pointerDown(titlebar(view.container), 150, 90);
    // 指针已离开窗口元素，但事件挂在 window 上
    pointerMove(900, 700);
    pointerUp(900, 700);

    expect(view.onMove).toHaveBeenCalledTimes(1);
    expect(view.onMove).toHaveBeenCalledWith(850, 690);

    view.unmount();
  });
});

describe('Window 标题栏交互', () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = undefined;
    vi.restoreAllMocks();
  });

  /** 模拟双击 */
  function doubleClick(el: HTMLElement): void {
    act(() => {
      el.dispatchEvent(
        new MouseEvent('dblclick', { bubbles: true, cancelable: true, clientX: 150, clientY: 90 }),
      );
    });
  }

  /** 模拟右键 */
  function rightClick(el: HTMLElement, clientX = 150, clientY = 90): void {
    act(() => {
      el.dispatchEvent(
        new MouseEvent('contextmenu', {
          bubbles: true,
          cancelable: true,
          clientX,
          clientY,
        }),
      );
    });
  }

  it('普通窗口双击标题栏时最大化', () => {
    const view = render({ mode: 'normal' });
    doubleClick(titlebar(view.container));

    expect(view.onMaximize).toHaveBeenCalledTimes(1);
    expect(view.onRestore).not.toHaveBeenCalled();
    view.unmount();
  });

  it('已最大化窗口双击标题栏时还原', () => {
    const view = render({ mode: 'maximized' });
    doubleClick(titlebar(view.container));

    expect(view.onRestore).toHaveBeenCalledTimes(1);
    expect(view.onMaximize).not.toHaveBeenCalled();
    view.unmount();
  });

  it('已最小化窗口双击标题栏时最大化', () => {
    const view = render({ mode: 'minimized' });
    doubleClick(titlebar(view.container));

    expect(view.onMaximize).toHaveBeenCalledTimes(1);
    view.unmount();
  });

  it('右键标题栏时上报事件坐标', () => {
    const view = render();
    rightClick(titlebar(view.container), 220, 130);

    expect(view.onContextMenu).toHaveBeenCalledTimes(1);
    expect(view.onContextMenu).toHaveBeenCalledWith(
      expect.objectContaining({ clientX: 220, clientY: 130 }),
    );
    view.unmount();
  });

  it('右键标题栏不触发浏览器默认菜单', () => {
    const view = render();
    const bar = titlebar(view.container);
    const event = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      clientX: 220,
      clientY: 130,
    });
    act(() => {
      bar.dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(true);
    view.unmount();
  });
});
