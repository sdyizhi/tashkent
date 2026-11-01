import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useErrorStore } from '../state/errorStore.js';
import { useDesktopStore } from '../state/desktopStore.js';
import Taskbar from './Taskbar.js';

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

function render(element: React.ReactNode) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  act(() => {
    root.render(element);
  });
  return {
    container,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe('Taskbar 托盘红点', () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    useErrorStore.setState({ errors: [] });
    useDesktopStore.setState({ windows: [], icons: [], focusedId: null, nextZIndex: 10 });
  });

  afterEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = undefined;
    vi.restoreAllMocks();
  });

  it('没有错误时不显示红点', () => {
    const view = render(createElement(Taskbar));
    expect(view.container.querySelector('[data-testid="tray-error-badge"]')).toBeNull();
    view.unmount();
  });

  it('有未处理异常时显示红点与计数', () => {
    useErrorStore.getState().pushError('炸了');
    useErrorStore.getState().pushError('又炸了');

    const view = render(createElement(Taskbar));
    const badge = view.container.querySelector('[data-testid="tray-error-badge"]');
    expect(badge).not.toBeNull();
    expect(view.container.querySelector('[data-testid="tray-error-count"]')?.textContent).toBe('2');
    view.unmount();
  });

  it('点击红点清空未处理异常', () => {
    useErrorStore.getState().pushError('炸了');

    const view = render(createElement(Taskbar));
    const badge = view.container.querySelector<HTMLButtonElement>(
      '[data-testid="tray-error-badge"]',
    );
    act(() => badge!.click());

    expect(useErrorStore.getState().errors).toHaveLength(0);
    view.unmount();
  });
});
