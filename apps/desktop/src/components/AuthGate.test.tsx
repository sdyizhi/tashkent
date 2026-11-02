import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import AuthGate from './AuthGate.js';

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

function render() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  act(() => {
    root.render(
      createElement(AuthGate, null, createElement('div', { 'data-testid': 'desktop' }, '桌面')),
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

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('AuthGate', () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = undefined;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('未启用口令保护时直接渲染桌面', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"agents":[]}', { status: 200 })));
    const view = render();
    await flush();
    expect(view.container.querySelector('[data-testid="desktop"]')).not.toBeNull();
    expect(view.container.querySelector('[data-testid="login-dialog"]')).toBeNull();
    view.unmount();
  });

  it('收到 401 时展示登录框而不是桌面', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{"error":{"code":"UNAUTHORIZED"}}', { status: 401 })),
    );
    const view = render();
    await flush();
    expect(view.container.querySelector('[data-testid="login-dialog"]')).not.toBeNull();
    expect(view.container.querySelector('[data-testid="desktop"]')).toBeNull();
    view.unmount();
  });

  it('后端不可达时不阻塞桌面', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      }),
    );
    const view = render();
    await flush();
    expect(view.container.querySelector('[data-testid="desktop"]')).not.toBeNull();
    expect(view.container.querySelector('[data-testid="login-dialog"]')).toBeNull();
    view.unmount();
  });

  it('登录成功后重新探测并恢复桌面', async () => {
    let authorized = false;
    const fetchMock = vi.fn(async (url: string) => {
      if (url === '/api/auth/login') {
        authorized = true;
        return new Response('{"ok":true}', { status: 200 });
      }
      return authorized
        ? new Response('{"agents":[]}', { status: 200 })
        : new Response('{"error":{"code":"UNAUTHORIZED"}}', { status: 401 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const view = render();
    await flush();
    expect(view.container.querySelector('[data-testid="login-dialog"]')).not.toBeNull();

    await act(async () => {
      view.container.querySelector<HTMLButtonElement>('[data-testid="login-submit"]')!.click();
    });
    await flush();

    expect(view.container.querySelector('[data-testid="login-dialog"]')).toBeNull();
    expect(view.container.querySelector('[data-testid="desktop"]')).not.toBeNull();
    view.unmount();
  });
});
