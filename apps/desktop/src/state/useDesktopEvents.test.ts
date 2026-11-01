import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { AgentEvent } from '@tashkent/shared';
import type { AgentEventSource } from './agentEvents.js';
import { useDesktopStore } from './desktopStore.js';
import { useAuthorizationStore } from './authorizationStore.js';
import { useDesktopEvents } from './useDesktopEvents.js';

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

class FakeSource implements AgentEventSource {
  private readonly listeners = new Set<(e: AgentEvent, id: number) => void>();
  connected = false;
  seq = 0;

  connect(): void {}
  disconnect(): void {}

  subscribe(fn: (e: AgentEvent, id: number) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  subscribeConnection(): () => void {
    return () => {};
  }

  get isConnected(): boolean {
    return this.connected;
  }

  emit(event: AgentEvent): void {
    this.seq += 1;
    for (const fn of this.listeners) fn(event, this.seq);
  }
}

function render(source: AgentEventSource) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);

  function Probe() {
    useDesktopEvents({ source });
    return null;
  }

  act(() => {
    root.render(createElement(Probe));
  });

  return {
    /** 等待权威快照加载完成（hydration） */
    hydrate: async () => {
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
    },
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe('useDesktopEvents', () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    useDesktopStore.setState({ windows: [], icons: [], focusedId: null, nextZIndex: 10 });
    useAuthorizationStore.setState({ request: null });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{"windows":[]}', { status: 200 })),
    );
  });

  afterEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = undefined;
    vi.unstubAllGlobals();
  });

  it('desktop_window_opened 事件创建窗口', async () => {
    const source = new FakeSource();
    const view = render(source);
    await view.hydrate();

    act(() => {
      source.emit({
        type: 'desktop_window_opened',
        sessionId: '__desktop__',
        window: {
          id: 'srv-1',
          appId: 'files',
          title: '我的文档',
          icon: '📁',
          mode: 'normal',
          x: 0,
          y: 0,
          width: 520,
          height: 400,
          zIndex: 11,
          restoreGeometry: { x: 0, y: 0, width: 520, height: 400 },
          resizable: true,
          minimizable: true,
          maximizable: true,
        },
      });
    });

    const windows = useDesktopStore.getState().windows;
    expect(windows.map((w) => w.id)).toContain('srv-1');
    view.unmount();
  });

  it('desktop_window_closed 事件移除窗口', async () => {
    const source = new FakeSource();
    const view = render(source);
    await view.hydrate();

    act(() => {
      source.emit({
        type: 'desktop_window_closed',
        sessionId: '__desktop__',
        windowId: 'srv-1',
      });
    });

    expect(useDesktopStore.getState().windows.map((w) => w.id)).not.toContain('srv-1');
    view.unmount();
  });

  it('authorization_required 事件进入授权状态', async () => {
    const source = new FakeSource();
    const view = render(source);
    await view.hydrate();

    act(() => {
      source.emit({
        type: 'authorization_required',
        sessionId: 's1',
        authorizationId: 'auth-1',
        toolCallId: 'c1',
        toolName: 'fs.write',
        args: { path: 'a.txt' },
        reason: '需要确认',
      });
    });

    const request = useAuthorizationStore.getState().request;
    expect(request?.authorizationId).toBe('auth-1');
    expect(request?.toolName).toBe('fs.write');
    view.unmount();
  });

  it('desktop_notify 事件产生桌面通知', async () => {
    const source = new FakeSource();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root: Root = createRoot(container);

    function Probe() {
      const { notifications } = useDesktopEvents({ source });
      return createElement('div', { 'data-testid': 'count' }, String(notifications.length));
    }

    act(() => {
      root.render(createElement(Probe));
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    act(() => {
      source.emit({
        type: 'desktop_notify',
        sessionId: 's1',
        message: '文件已生成',
      });
    });

    expect(container.querySelector('[data-testid="count"]')?.textContent).toBe('1');
    act(() => root.unmount());
    container.remove();
  });

  it('快照就绪前到达的事件不会丢失', async () => {
    const source = new FakeSource();
    const view = render(source);

    // hydration 完成前先发事件
    act(() => {
      source.emit({
        type: 'desktop_window_opened',
        sessionId: '__desktop__',
        window: {
          id: 'early',
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
      });
    });

    await view.hydrate();

    expect(useDesktopStore.getState().windows.map((w) => w.id)).toContain('early');
    view.unmount();
  });
});
