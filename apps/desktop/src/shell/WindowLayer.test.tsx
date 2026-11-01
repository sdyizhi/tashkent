import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { WindowState } from '@tashkent/shared';
import { useDesktopStore } from '../state/desktopStore.js';
import WindowLayer from './WindowLayer.js';

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

const windowState: WindowState = {
  id: 'srv-1',
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

function render(renderApp: (appId: string) => React.ReactNode) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  act(() => {
    root.render(createElement(WindowLayer, { renderApp }));
  });
  return {
    container,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe('WindowLayer 错误边界', () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    useDesktopStore.setState({ windows: [windowState], focusedId: 'srv-1', nextZIndex: 10 });
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = undefined;
    vi.restoreAllMocks();
  });

  it('窗口内容崩溃时只在该窗口内显示降级 UI，桌面其余部分仍渲染', () => {
    const view = render(() => {
      throw new Error('应用崩了');
    });

    expect(view.container.querySelector('[data-testid="xp-error-boundary"]')).not.toBeNull();
    expect(view.container.querySelector('[data-testid="xp-error-boundary"]')?.textContent).toContain(
      '应用崩了',
    );
    // 窗口外壳仍在（没有整桌白屏）
    expect(view.container.querySelector('.xp-window')).not.toBeNull();
    view.unmount();
  });

  it('窗口内容正常时不显示降级 UI', () => {
    const view = render(() => createElement('div', null, '正常应用'));
    expect(view.container.querySelector('[data-testid="xp-error-boundary"]')).toBeNull();
    expect(view.container.textContent).toContain('正常应用');
    view.unmount();
  });

  it('一个窗口崩溃不影响其它窗口', () => {
    const second: WindowState = { ...windowState, id: 'srv-2', appId: 'files', title: '我的文档' };
    useDesktopStore.setState({ windows: [windowState, second], focusedId: 'srv-1', nextZIndex: 12 });

    const view = render((appId) => {
      if (appId === 'chat') throw new Error('对话崩了');
      return createElement('div', null, '文件窗口还在');
    });

    expect(view.container.querySelectorAll('[data-testid="xp-error-boundary"]')).toHaveLength(1);
    expect(view.container.textContent).toContain('文件窗口还在');
    view.unmount();
  });
});
