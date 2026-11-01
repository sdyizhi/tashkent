import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import XPDialog from './XPDialog.js';

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

function render(props: {
  title: string;
  message: string;
  onClose: () => void;
  icon?: string;
}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);

  act(() => {
    root.render(
      createElement(XPDialog, {
        title: props.title,
        message: props.message,
        icon: props.icon ?? '⚠️',
        onClose: props.onClose,
      }),
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

describe('XPDialog', () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = undefined;
    vi.restoreAllMocks();
  });

  it('展示标题与错误信息', () => {
    const view = render({ title: '工具执行失败', message: '权限不足', onClose: () => {} });
    const dialog = view.container.querySelector('[data-testid="xp-dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.textContent).toContain('工具执行失败');
    expect(dialog?.textContent).toContain('权限不足');
    view.unmount();
  });

  it('点击「关闭」触发 onClose 回调', () => {
    const onClose = vi.fn();
    const view = render({ title: '工具执行失败', message: '权限不足', onClose });

    const close = view.container.querySelector<HTMLButtonElement>('[data-testid="xp-dialog-close"]');
    expect(close).not.toBeNull();
    act(() => close!.click());

    expect(onClose).toHaveBeenCalledTimes(1);
    view.unmount();
  });

  it('渲染 XP 风格的标题栏与模态遮罩', () => {
    const view = render({ title: '工具执行失败', message: '权限不足', onClose: () => {} });
    expect(view.container.querySelector('.xp-modal-mask')).not.toBeNull();
    expect(view.container.querySelector('.xp-dialog-title')).not.toBeNull();
    expect(view.container.querySelector('.xp-dialog-body')).not.toBeNull();
    view.unmount();
  });

  it('可自定义图标（黄色感叹号）', () => {
    const view = render({ title: '工具执行失败', message: 'x', onClose: () => {}, icon: '❗' });
    expect(view.container.textContent).toContain('❗');
    view.unmount();
  });
});
