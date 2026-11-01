import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { AgentEvent } from '@tashkent/shared';
import AuthorizationDialog from './AuthorizationDialog.js';

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

const pending: AgentEvent = {
  type: 'authorization_required',
  sessionId: 's1',
  authorizationId: 'auth-1',
  toolCallId: 'c1',
  toolName: 'fs.write',
  args: { path: 'a.txt', content: 'hello' },
  reason: '工具「fs.write」将修改文件或创建内容，需要确认',
};

function render(props: {
  request: Extract<AgentEvent, { type: 'authorization_required' }> | null;
  onDecide?: (approved: boolean, remember: boolean) => void;
}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);

  function Probe() {
    return createElement(AuthorizationDialog, {
      request: props.request,
      onDecide: props.onDecide ?? (() => {}),
    });
  }

  act(() => {
    root.render(createElement(Probe));
  });

  return {
    root,
    container,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe('AuthorizationDialog', () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = undefined;
    vi.restoreAllMocks();
  });

  it('没有待决请求时不渲染', () => {
    const view = render({ request: null });
    expect(view.container.querySelector('[data-testid="authorization-dialog"]')).toBeNull();
    view.unmount();
  });

  it('展示工具名与授权原因', () => {
    const view = render({ request: pending });
    const dialog = view.container.querySelector('[data-testid="authorization-dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.textContent).toContain('fs.write');
    expect(dialog?.textContent).toContain('需要确认');
    view.unmount();
  });

  it('展示工具参数', () => {
    const view = render({ request: pending });
    const dialog = view.container.querySelector('[data-testid="authorization-dialog"]');
    expect(dialog?.textContent).toContain('a.txt');
    view.unmount();
  });

  it('点击「同意」时回调 approved=true', () => {
    const onDecide = vi.fn();
    const view = render({ request: pending, onDecide });

    const approve = view.container.querySelector<HTMLButtonElement>(
      '[data-testid="authorization-approve"]',
    );
    expect(approve).not.toBeNull();
    act(() => approve!.click());

    expect(onDecide).toHaveBeenCalledWith(true, false);
    view.unmount();
  });

  it('勾选「记住」后同意时回调 approved=true, remember=true', () => {
    const onDecide = vi.fn();
    const view = render({ request: pending, onDecide });

    const remember = view.container.querySelector<HTMLInputElement>(
      '[data-testid="authorization-remember"]',
    );
    // React 用 value tracker 感知受控组件变化，必须走原生 setter 才能触发 onChange
    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'checked',
    )!.set!;
    act(() => {
      nativeSetter.call(remember, true);
      remember!.dispatchEvent(new Event('click', { bubbles: true }));
    });
    expect(remember!.checked).toBe(true);

    const approve = view.container.querySelector<HTMLButtonElement>(
      '[data-testid="authorization-approve"]',
    );
    act(() => approve!.click());

    expect(onDecide).toHaveBeenCalledWith(true, true);
    view.unmount();
  });

  it('点击「拒绝」时回调 approved=false', () => {
    const onDecide = vi.fn();
    const view = render({ request: pending, onDecide });

    const deny = view.container.querySelector<HTMLButtonElement>(
      '[data-testid="authorization-deny"]',
    );
    act(() => deny!.click());

    expect(onDecide).toHaveBeenCalledWith(false, false);
    view.unmount();
  });
});
