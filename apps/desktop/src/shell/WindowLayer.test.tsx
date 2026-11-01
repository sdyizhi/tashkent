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

describe('WindowLayer 标题栏菜单与 Alt+Tab', () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    useDesktopStore.setState({ windows: [windowState], focusedId: 'srv-1', nextZIndex: 10 });
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = undefined;
    vi.restoreAllMocks();
  });

  /** 右键标题栏 */
  function rightClickTitlebar(container: HTMLElement): void {
    const bar = container.querySelector<HTMLElement>('.xp-titlebar');
    if (!bar) throw new Error('no titlebar');
    act(() => {
      bar.dispatchEvent(
        new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 180, clientY: 120 }),
      );
    });
  }

  it('右键标题栏弹出菜单并包含全部菜单项', () => {
    const view = render(() => createElement('div', null, '应用'));
    rightClickTitlebar(view.container);

    const menu = view.container.querySelector('[data-testid="context-menu"]');
    expect(menu).not.toBeNull();
    const labels = Array.from(
      view.container.querySelectorAll('[data-testid^="context-menu-item-"]'),
    ).map((el) => el.textContent);
    expect(labels).toEqual(['还原', '移动', '大小', '最小化', '最大化', '关闭']);
    view.unmount();
  });

  it('普通窗口的「还原」菜单项置灰，最大化窗口时可用', () => {
    const view = render(() => createElement('div', null, '应用'));
    rightClickTitlebar(view.container);
    expect(
      view.container
        .querySelector('[data-testid="context-menu-item-还原"]')
        ?.getAttribute('aria-disabled'),
    ).toBe('true');
    view.unmount();

    useDesktopStore.setState({
      windows: [{ ...windowState, mode: 'maximized' }],
      focusedId: 'srv-1',
      nextZIndex: 10,
    });
    const view2 = render(() => createElement('div', null, '应用'));
    rightClickTitlebar(view2.container);
    expect(
      view2.container
        .querySelector('[data-testid="context-menu-item-还原"]')
        ?.getAttribute('aria-disabled'),
    ).toBeNull();
    view2.unmount();
  });

  it('「移动」「大小」菜单项在本阶段置灰', () => {
    const view = render(() => createElement('div', null, '应用'));
    rightClickTitlebar(view.container);

    expect(
      view.container
        .querySelector('[data-testid="context-menu-item-移动"]')
        ?.getAttribute('aria-disabled'),
    ).toBe('true');
    expect(
      view.container
        .querySelector('[data-testid="context-menu-item-大小"]')
        ?.getAttribute('aria-disabled'),
    ).toBe('true');
    view.unmount();
  });

  it('点击「关闭」菜单项关闭窗口', () => {
    const fetchMock = vi.fn(async () => new Response('{"ok":true}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const view = render(() => createElement('div', null, '应用'));
    rightClickTitlebar(view.container);

    const item = view.container.querySelector<HTMLElement>(
      '[data-testid="context-menu-item-关闭"]',
    );
    act(() => item!.click());

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/desktop/windows/srv-1',
      expect.objectContaining({ method: 'DELETE' }),
    );
    vi.unstubAllGlobals();
    view.unmount();
  });

  it('按住 Alt 弹出窗口切换对话框', () => {
    const view = render(() => createElement('div', null, '应用'));

    act(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Alt', bubbles: true, cancelable: true }),
      );
    });

    expect(view.container.querySelector('[data-testid="alt-tab-switcher"]')).not.toBeNull();
    expect(view.container.textContent).toContain('对话');
    view.unmount();
  });

  it('松开 Alt 关闭切换对话框', () => {
    const view = render(() => createElement('div', null, '应用'));

    act(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Alt', bubbles: true, cancelable: true }),
      );
    });
    expect(view.container.querySelector('[data-testid="alt-tab-switcher"]')).not.toBeNull();

    act(() => {
      window.dispatchEvent(
        new KeyboardEvent('keyup', { key: 'Alt', bubbles: true, cancelable: true }),
      );
    });
    expect(view.container.querySelector('[data-testid="alt-tab-switcher"]')).toBeNull();
    view.unmount();
  });
});
