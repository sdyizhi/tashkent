import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import TerminalApp from './TerminalApp.js';

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
    root.render(createElement(TerminalApp, { sessionId: 's1' }));
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

describe('TerminalApp 命令提示符', () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    calls = [];
    routes = {
      'GET /api/config': {
        provider: 'openai',
        model: 'gpt-4o-mini',
        temperature: 0.7,
        maxSteps: 8,
        maxOutputTokens: 4096,
        contextKeepTurns: 20,
        shellEnabled: false,
        shellAllowed: [],
        allowedDomains: [],
        version: '1.0.0',
      },
      'POST /api/sessions': { id: 'sess-1', agentId: 'shell-agent' },
      'POST /api/sessions/sess-1/messages': { runId: 'r1' },
    };
    installFetch();
  });

  afterEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = undefined;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('shell 未启用时如实提示「shell 工具未启用」', async () => {
    const view = render();
    await flush();

    expect(view.container.querySelector('[data-testid="terminal-disabled"]')?.textContent).toContain(
      'shell 工具未启用',
    );
    // 未启用时提交按钮禁用
    const submit = view.container.querySelector<HTMLButtonElement>('[data-testid="terminal-run"]');
    expect(submit?.disabled).toBe(true);
    view.unmount();
  });

  it('shell 已启用时允许提交命令', async () => {
    routes['GET /api/config'] = {
      provider: 'openai',
      model: 'gpt-4o-mini',
      temperature: 0.7,
      maxSteps: 8,
      maxOutputTokens: 4096,
      contextKeepTurns: 20,
      shellEnabled: true,
      shellAllowed: ['node'],
      allowedDomains: [],
      version: '1.0.0',
    };

    const view = render();
    await flush();

    expect(view.container.querySelector('[data-testid="terminal-disabled"]')).toBeNull();

    const input = view.container.querySelector<HTMLInputElement>('[data-testid="terminal-input"]');
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      setter?.call(input, 'node --version');
      input!.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await flush();

    const run = view.container.querySelector<HTMLButtonElement>('[data-testid="terminal-run"]');
    expect(run?.disabled).toBe(false);
    await act(async () => {
      run!.click();
    });
    await flush();

    const post = calls.find((c) => c.method === 'POST' && c.url.includes('/messages'));
    expect(post).toBeTruthy();
    expect(String((post?.body as { text: string }).text)).toContain('node --version');
    // 命令回显到输出区
    expect(view.container.querySelector('[data-testid="terminal-output"]')?.textContent).toContain(
      'node --version',
    );
    view.unmount();
  });

  it('配置接口不可达时提示未启用而不是假装可用', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      calls.push({ url: String(url), method, body: undefined });
      throw new Error('network down');
    });
    vi.stubGlobal('fetch', fetchMock);

    const view = render();
    await flush();

    expect(view.container.querySelector('[data-testid="terminal-disabled"]')?.textContent).toContain(
      'shell 工具未启用',
    );
    view.unmount();
  });
});
