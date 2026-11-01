import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { WindowState } from '@tashkent/shared';
import { useAltTab, type UseAltTabResult } from './useAltTab.js';

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

function win(id: string, zIndex: number, overrides: Partial<WindowState> = {}): WindowState {
  return {
    id,
    appId: 'chat',
    title: id,
    icon: '💬',
    mode: 'normal',
    x: 0,
    y: 0,
    width: 640,
    height: 480,
    zIndex,
    restoreGeometry: { x: 0, y: 0, width: 640, height: 480 },
    resizable: true,
    minimizable: true,
    maximizable: true,
    ...overrides,
  };
}

interface Rendered {
  result: () => UseAltTabResult;
  unmount: () => void;
}

function renderHook(windows: WindowState[], focusedId: string | null, onActivate = vi.fn()): Rendered {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  let latest: UseAltTabResult | null = null;

  function Probe() {
    latest = useAltTab({ windows, focusedId, onActivate });
    return null;
  }

  act(() => {
    root.render(createElement(Probe));
  });

  return {
    result: () => latest!,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

function keyDown(key: string, altKey = false): void {
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key, altKey, bubbles: true, cancelable: true }));
  });
}

function keyUp(key: string, altKey = false): void {
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keyup', { key, altKey, bubbles: true, cancelable: true }));
  });
}

describe('useAltTab', () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = undefined;
    vi.restoreAllMocks();
  });

  it('没有窗口时 Alt+Tab 不显示切换对话框', () => {
    const view = renderHook([], null);
    keyDown('Alt');
    expect(view.result().visible).toBe(false);
    view.unmount();
  });

  it('按住 Alt 显示切换对话框', () => {
    const view = renderHook([win('w1', 11), win('w2', 12)], 'w1');
    keyDown('Alt');
    expect(view.result().visible).toBe(true);
    expect(view.result().candidates).toHaveLength(2);
    view.unmount();
  });

  it('候选窗口按 zIndex 倒序（最近使用在前）', () => {
    const view = renderHook([win('w1', 11), win('w2', 12)], 'w2');
    keyDown('Alt');
    expect(view.result().candidates.map((c) => c.id)).toEqual(['w2', 'w1']);
    view.unmount();
  });

  it('Alt 后按 Tab 切换到下一个窗口', () => {
    const view = renderHook([win('w1', 11), win('w2', 12)], 'w1');
    keyDown('Alt');
    expect(view.result().activeId).toBe('w1');

    keyDown('Tab');
    expect(view.result().activeId).toBe('w2');

    keyDown('Tab');
    expect(view.result().activeId).toBe('w1');
    view.unmount();
  });

  it('松开 Alt 激活选中的窗口并关闭对话框', () => {
    const onActivate = vi.fn();
    const view = renderHook([win('w1', 11), win('w2', 12)], 'w1', onActivate);

    keyDown('Alt');
    keyDown('Tab');
    keyUp('Alt');

    expect(onActivate).toHaveBeenCalledWith('w2');
    expect(view.result().visible).toBe(false);
    view.unmount();
  });

  it('Tab 阻止浏览器默认行为', () => {
    const view = renderHook([win('w1', 11)], 'w1');
    keyDown('Alt');

    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    act(() => {
      window.dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(true);
    view.unmount();
  });

  it('没有按 Alt 直接按 Tab 不触发切换', () => {
    const view = renderHook([win('w1', 11), win('w2', 12)], 'w1');
    keyDown('Tab');
    expect(view.result().visible).toBe(false);
    view.unmount();
  });

  it('对话框可见时可直接激活某个窗口', () => {
    const onActivate = vi.fn();
    const view = renderHook([win('w1', 11), win('w2', 12)], 'w1', onActivate);

    keyDown('Alt');
    act(() => view.result().activate('w2'));

    expect(onActivate).toHaveBeenCalledWith('w2');
    expect(view.result().visible).toBe(false);
    view.unmount();
  });

  it('取消切换不激活任何窗口', () => {
    const onActivate = vi.fn();
    const view = renderHook([win('w1', 11), win('w2', 12)], 'w1', onActivate);

    keyDown('Alt');
    act(() => view.result().cancel());

    expect(onActivate).not.toHaveBeenCalled();
    expect(view.result().visible).toBe(false);
    view.unmount();
  });
});
