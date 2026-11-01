import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import XPErrorBoundary from './XPErrorBoundary.js';

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

/** 渲染时必定抛错的组件 */
function Boom(): never {
  throw new Error('窗口崩了');
}

function render(children: React.ReactNode, onClose?: () => void) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);

  act(() => {
    root.render(
      createElement(XPErrorBoundary, { onClose }, children),
    );
  });

  return {
    container,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe('XPErrorBoundary', () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    // React 捕获错误时会打 console.error，这里静音以免污染测试输出
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = undefined;
    vi.restoreAllMocks();
  });

  it('子组件正常时不渲染降级 UI', () => {
    const view = render(createElement('div', null, '正常内容'));
    expect(view.container.textContent).toContain('正常内容');
    expect(view.container.querySelector('[data-testid="xp-error-boundary"]')).toBeNull();
    view.unmount();
  });

  it('捕获子组件错误后渲染降级 UI 而不是让错误继续冒泡', () => {
    const view = render(createElement(Boom));
    const panel = view.container.querySelector('[data-testid="xp-error-boundary"]');
    expect(panel).not.toBeNull();
    expect(panel?.textContent).toContain('窗口崩了');
    view.unmount();
  });

  it('降级 UI 展示错误标题与错误信息', () => {
    const view = render(createElement(Boom));
    const panel = view.container.querySelector('[data-testid="xp-error-boundary"]');
    expect(panel?.textContent).toContain('错误');
    expect(panel?.textContent).toContain('窗口崩了');
    view.unmount();
  });

  it('点击「关闭」按钮触发 onClose 回调', () => {
    const onClose = vi.fn();
    const view = render(createElement(Boom), onClose);

    const close = view.container.querySelector<HTMLButtonElement>(
      '[data-testid="xp-error-boundary-close"]',
    );
    expect(close).not.toBeNull();
    act(() => close!.click());

    expect(onClose).toHaveBeenCalledTimes(1);
    view.unmount();
  });

  it('错误发生后兄弟节点不受影响（单窗口崩溃不拖垮整桌）', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root: Root = createRoot(container);

    act(() => {
      root.render(
        createElement(
          'div',
          null,
          createElement(XPErrorBoundary, null, createElement(Boom)),
          createElement('span', { 'data-testid': 'sibling' }, '兄弟还在'),
        ),
      );
    });

    expect(container.querySelector('[data-testid="sibling"]')?.textContent).toBe('兄弟还在');
    expect(container.querySelector('[data-testid="xp-error-boundary"]')).not.toBeNull();

    act(() => root.unmount());
    container.remove();
  });
});
