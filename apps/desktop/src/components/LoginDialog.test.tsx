import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import LoginDialog from './LoginDialog.js';

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

function render(props: { onSuccess?: () => void } = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  act(() => {
    root.render(createElement(LoginDialog, { onSuccess: props.onSuccess ?? (() => {}) }));
  });
  return {
    container,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('LoginDialog', () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = undefined;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('渲染 XP 风格登录框', () => {
    const view = render();
    expect(view.container.querySelector('[data-testid="login-dialog"]')).not.toBeNull();
    expect(view.container.textContent).toContain('口令');
    view.unmount();
  });

  it('输入口令后点击「确定」调用登录接口', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      new Response('{"ok":true}', { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const view = render();
    const input = view.container.querySelector<HTMLInputElement>('[data-testid="login-input"]');
    expect(input).not.toBeNull();

    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )!.set!;
      setter.call(input, 'test123');
      input!.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const button = view.container.querySelector<HTMLButtonElement>('[data-testid="login-submit"]');
    await act(async () => {
      button!.click();
    });
    await flush();

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/login',
      expect.objectContaining({ method: 'POST' }),
    );
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(JSON.parse(String(init?.body))).toEqual({ password: 'test123' });
    view.unmount();
  });

  it('登录成功时触发 onSuccess 回调', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{"ok":true}', { status: 200 })),
    );
    const onSuccess = vi.fn();
    const view = render({ onSuccess });

    await act(async () => {
      view.container.querySelector<HTMLButtonElement>('[data-testid="login-submit"]')!.click();
    });
    await flush();

    expect(onSuccess).toHaveBeenCalledTimes(1);
    view.unmount();
  });

  it('口令错误时展示错误提示且不触发 onSuccess', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{"error":{"message":"口令不正确"}}', { status: 401 })),
    );
    const onSuccess = vi.fn();
    const view = render({ onSuccess });

    await act(async () => {
      view.container.querySelector<HTMLButtonElement>('[data-testid="login-submit"]')!.click();
    });
    await flush();

    expect(onSuccess).not.toHaveBeenCalled();
    expect(view.container.querySelector('[data-testid="login-error"]')?.textContent).toContain(
      '口令不正确',
    );
    view.unmount();
  });

  it('网络不可达时展示错误提示', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      }),
    );
    const view = render();

    await act(async () => {
      view.container.querySelector<HTMLButtonElement>('[data-testid="login-submit"]')!.click();
    });
    await flush();

    expect(view.container.querySelector('[data-testid="login-error"]')?.textContent).toContain(
      '无法连接',
    );
    view.unmount();
  });

  it('按回车键提交', async () => {
    const fetchMock = vi.fn(async () => new Response('{"ok":true}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const view = render();
    const input = view.container.querySelector<HTMLInputElement>('[data-testid="login-input"]')!;
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    await flush();

    expect(fetchMock).toHaveBeenCalled();
    view.unmount();
  });
});
