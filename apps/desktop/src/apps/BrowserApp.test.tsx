import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import BrowserApp from './BrowserApp.js';
import { isSafeBrowserUrl } from './BrowserApp.js';

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

let calls: Array<{ url: string; method: string; body: unknown }> = [];
let routes: Record<string, unknown> = {};

function installFetch(): void {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    calls.push({
      url: String(url),
      method,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    const key = `${method} ${String(url).split('?')[0]}`;
    const body = routes[key];
    if (body === undefined) {
      return new Response(JSON.stringify({ error: { message: '不存在' } }), { status: 404 });
    }
    return new Response(JSON.stringify(body), { status: 200 });
  });
  vi.stubGlobal('fetch', fetchMock);
}

function render(): { container: HTMLElement; unmount: () => void } {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  act(() => {
    root.render(createElement(BrowserApp, { sessionId: 's1' }));
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
  });
}

describe('isSafeBrowserUrl 协议白名单', () => {
  it('允许 http / https', () => {
    expect(isSafeBrowserUrl('http://example.com')).toBe(true);
    expect(isSafeBrowserUrl('https://example.com/path')).toBe(true);
  });

  it('拒绝 javascript: / data: 等危险协议', () => {
    expect(isSafeBrowserUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeBrowserUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
    expect(isSafeBrowserUrl('vbscript:msgbox')).toBe(false);
    expect(isSafeBrowserUrl('file:///C:/Windows')).toBe(false);
  });

  it('拒绝空串与非法 URL', () => {
    expect(isSafeBrowserUrl('')).toBe(false);
    expect(isSafeBrowserUrl('not a url')).toBe(false);
  });
});

describe('BrowserApp 浏览器', () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    calls = [];
    routes = {
      'POST /api/sessions': { id: 'sess-1', agentId: 'web-research' },
      'POST /api/sessions/sess-1/messages': { runId: 'r1' },
    };
    installFetch();
  });

  afterEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = undefined;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('地址栏输入合法 URL 后渲染 iframe', async () => {
    const view = render();
    await flush();

    const input = view.container.querySelector<HTMLInputElement>('[data-testid="browser-url"]');
    expect(input).not.toBeNull();

    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      setter?.call(input, 'https://example.com');
      input!.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await flush();

    const go = view.container.querySelector<HTMLButtonElement>('[data-testid="browser-go"]');
    await act(async () => {
      go!.click();
    });
    await flush();

    const frame = view.container.querySelector<HTMLIFrameElement>('[data-testid="browser-frame"]');
    expect(frame?.getAttribute('src')).toBe('https://example.com');
    view.unmount();
  });

  it('拒绝 javascript: 协议并提示', async () => {
    const view = render();
    await flush();

    const input = view.container.querySelector<HTMLInputElement>('[data-testid="browser-url"]');
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      setter?.call(input, 'javascript:alert(1)');
      input!.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await flush();

    const go = view.container.querySelector<HTMLButtonElement>('[data-testid="browser-go"]');
    await act(async () => {
      go!.click();
    });
    await flush();

    // 危险协议下不渲染 iframe
    expect(view.container.querySelector('[data-testid="browser-frame"]')).toBeNull();
    expect(view.container.querySelector('[data-testid="browser-error"]')?.textContent).toContain(
      '只支持 http/https',
    );
    view.unmount();
  });

  it('iframe 加载失败时如实提示可在新窗口打开', async () => {
    vi.useFakeTimers();
    try {
      const view = render();
      await act(async () => {
        await Promise.resolve();
      });

      const input = view.container.querySelector<HTMLInputElement>('[data-testid="browser-url"]');
      await act(async () => {
        const setter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          'value',
        )?.set;
        setter?.call(input, 'https://blocked.example.com');
        input!.dispatchEvent(new Event('input', { bubbles: true }));
      });
      const go = view.container.querySelector<HTMLButtonElement>('[data-testid="browser-go"]');
      await act(async () => {
        go!.click();
      });

      expect(view.container.querySelector('[data-testid="browser-frame"]')).not.toBeNull();

      // 站点拒绝嵌入时 iframe 不会触发 load 事件，靠超时判定
      await act(async () => {
        vi.advanceTimersByTime(7000);
      });

      const notice = view.container.querySelector('[data-testid="browser-frame-notice"]');
      expect(notice).not.toBeNull();
      expect(notice?.textContent).toContain('拒绝嵌入');
      // 提供「在新窗口打开」的入口
      expect(view.container.querySelector('[data-testid="browser-open-new"]')).not.toBeNull();
      view.unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it('「让 Agent 检索」会向会话发送消息', async () => {
    const view = render();
    await flush();

    const input = view.container.querySelector<HTMLInputElement>('[data-testid="browser-url"]');
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      setter?.call(input, 'https://example.com');
      input!.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await flush();

    const go = view.container.querySelector<HTMLButtonElement>('[data-testid="browser-go"]');
    await act(async () => {
      go!.click();
    });
    await flush();

    const ask = view.container.querySelector<HTMLButtonElement>('[data-testid="browser-ask"]');
    expect(ask?.disabled).toBe(false);
    await act(async () => {
      ask!.click();
    });
    await flush();

    const post = calls.find((c) => c.method === 'POST' && c.url.includes('/messages'));
    expect(post).toBeTruthy();
    expect(String((post?.body as { text: string }).text)).toContain('https://example.com');
    view.unmount();
  });
});
