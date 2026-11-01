import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import TasksApp from './TasksApp.js';

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

let routes: Record<string, unknown> = {};
let statsCalls = 0;

function installFetch(): void {
  const fetchMock = vi.fn(async (url: string) => {
    const key = String(url).split('?')[0] ?? '';
    if (key === '/api/stats') statsCalls += 1;
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
    root.render(createElement(TasksApp, {}));
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

describe('TasksApp 任务管理器', () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    statsCalls = 0;
    routes = {
      '/api/stats': {
        agents: [
          { id: 'chat', name: '对话', icon: '💬', description: '通用对话助手', toolIds: ['fs.read', 'fs.list'] },
          { id: 'notepad', name: '记事本', icon: '📝', description: '编辑纯文本文件', toolIds: ['fs.read'] },
        ],
        tools: [
          { name: 'fs.read', description: '读文件', permission: 'safe' },
          { name: 'shell.exec', description: '执行命令', permission: 'dangerous' },
        ],
        sessions: 3,
        uptimeSec: 3661,
        memoryMb: 128,
      },
    };
    installFetch();
  });

  afterEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = undefined;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('显示 Agent 列表与可用工具数', async () => {
    const view = render();
    await flush();

    const agents = view.container.querySelector('[data-testid="tasks-agents"]');
    expect(agents).not.toBeNull();
    expect(agents?.textContent).toContain('chat');
    expect(agents?.textContent).toContain('记事本');
    // 对话 Agent 有 2 个工具
    const chatRow = agents?.querySelector('[data-testid="tasks-agent-chat"]');
    expect(chatRow?.textContent).toContain('2');
    view.unmount();
  });

  it('显示工具列表与权限', async () => {
    const view = render();
    await flush();

    const tools = view.container.querySelector('[data-testid="tasks-tools"]');
    expect(tools?.textContent).toContain('fs.read');
    expect(tools?.textContent).toContain('dangerous');
    view.unmount();
  });

  it('显示会话数、运行时长与内存', async () => {
    const view = render();
    await flush();

    const summary = view.container.querySelector('[data-testid="tasks-summary"]');
    expect(summary?.textContent).toContain('会话 3');
    expect(summary?.textContent).toContain('1 小时');
    expect(summary?.textContent).toContain('128');
    view.unmount();
  });

  it('每 3 秒轮询刷新统计', async () => {
    vi.useFakeTimers();
    try {
      const view = render();
      await act(async () => {
        await Promise.resolve();
      });
      const initial = statsCalls;
      expect(initial).toBeGreaterThan(0);

      await act(async () => {
        vi.advanceTimersByTime(3000);
      });
      await act(async () => {
        await Promise.resolve();
      });
      expect(statsCalls).toBeGreaterThan(initial);
      view.unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it('接口不可达时如实提示', async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error('network down');
    });
    vi.stubGlobal('fetch', fetchMock);

    const view = render();
    await flush();

    expect(view.container.querySelector('[data-testid="tasks-error"]')).not.toBeNull();
    view.unmount();
  });
});
