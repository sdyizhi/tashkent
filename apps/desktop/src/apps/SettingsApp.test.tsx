import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useDesktopStore } from '../state/desktopStore.js';
import SettingsApp from './SettingsApp.js';

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

let routes: Record<string, unknown> = {};
let calls: Array<{ url: string; method: string }> = [];

function installFetch(): void {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    calls.push({ url: String(url), method });
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
    root.render(createElement(SettingsApp, {}));
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

const CONFIG = {
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
};

const STATS = {
  agents: [
    { id: 'chat', name: '对话', icon: '💬', description: '通用对话助手', toolIds: ['fs.read'] },
  ],
  tools: [
    { name: 'fs.read', description: '读文件', permission: 'safe' },
    { name: 'shell.exec', description: '执行命令', permission: 'dangerous' },
  ],
  sessions: 2,
  uptimeSec: 120,
  memoryMb: 64,
};

describe('SettingsApp 控制面板', () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    calls = [];
    useDesktopStore.setState({ windows: [], icons: [], focusedId: null, nextZIndex: 10 });
    routes = {
      'GET /api/config': CONFIG,
      'GET /api/stats': STATS,
      'GET /api/tools': { tools: STATS.tools },
      'GET /api/desktop/windows': { windows: [] },
    };
    installFetch();
  });

  afterEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = undefined;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('显示模型配置（只读）', async () => {
    const view = render();
    await flush();

    const model = view.container.querySelector('[data-testid="settings-model"]');
    expect(model?.textContent).toContain('gpt-4o-mini');
    expect(model?.textContent).toContain('8');
    view.unmount();
  });

  it('列出所有工具及其权限级别，dangerous 醒目标记', async () => {
    const view = render();
    await flush();

    const tools = view.container.querySelector('[data-testid="settings-tools"]');
    expect(tools).not.toBeNull();
    expect(tools?.textContent).toContain('fs.read');
    expect(tools?.textContent).toContain('dangerous');
    expect(
      tools?.querySelector('[data-testid="settings-tool-shell.exec"]')?.getAttribute('data-permission'),
    ).toBe('dangerous');
    view.unmount();
  });

  it('提供清空图标布局与关闭全部窗口的操作', async () => {
    const view = render();
    await flush();

    expect(view.container.querySelector('[data-testid="settings-clear-icons"]')).not.toBeNull();
    expect(view.container.querySelector('[data-testid="settings-close-windows"]')).not.toBeNull();
    view.unmount();
  });

  it('点击「关闭全部窗口」会向服务端提交关闭命令', async () => {
    useDesktopStore.setState({
      windows: [
        {
          id: 'w1',
          appId: 'chat',
          title: '对话',
          icon: '💬',
          mode: 'normal',
          x: 0,
          y: 0,
          width: 640,
          height: 480,
          zIndex: 11,
          restoreGeometry: { x: 0, y: 0, width: 640, height: 480 },
          resizable: true,
          minimizable: true,
          maximizable: true,
        },
      ],
    });

    const view = render();
    await flush();

    const btn = view.container.querySelector<HTMLButtonElement>('[data-testid="settings-close-windows"]');
    await act(async () => {
      btn!.click();
    });
    await flush();

    expect(calls.some((c) => c.method === 'DELETE' && c.url.includes('/api/desktop/windows/w1'))).toBe(
      true,
    );
    view.unmount();
  });

  it('接口不可达时如实提示而非白屏', async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error('network down');
    });
    vi.stubGlobal('fetch', fetchMock);

    const view = render();
    await flush();

    expect(view.container.querySelector('[data-testid="settings-error"]')).not.toBeNull();
    view.unmount();
  });
});
