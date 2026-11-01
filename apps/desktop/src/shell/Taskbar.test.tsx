import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useErrorStore } from '../state/errorStore.js';
import { useDesktopStore } from '../state/desktopStore.js';
import Taskbar from './Taskbar.js';

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

function render(element: React.ReactNode) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  act(() => {
    root.render(element);
  });
  return {
    container,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

/** 按 URL 匹配的 fetch mock */
function mockFetch(routes: Record<string, unknown>): void {
  const fetchMock = vi.fn(async (url: string) => {
    const key = String(url).split('?')[0] ?? '';
    const body = routes[key];
    if (body === undefined) return new Response('{"error":{"message":"不存在"}}', { status: 404 });
    return new Response(JSON.stringify(body), { status: 200 });
  });
  vi.stubGlobal('fetch', fetchMock);
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

/** 模拟双击 */
function doubleClick(el: HTMLElement): void {
  act(() => {
    el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
  });
}

describe('Taskbar 托盘红点', () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    useErrorStore.setState({ errors: [] });
    useDesktopStore.setState({ windows: [], icons: [], focusedId: null, nextZIndex: 10 });
  });

  afterEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = undefined;
    vi.restoreAllMocks();
  });

  it('没有错误时不显示红点', () => {
    const view = render(createElement(Taskbar));
    expect(view.container.querySelector('[data-testid="tray-error-badge"]')).toBeNull();
    view.unmount();
  });

  it('有未处理异常时显示红点与计数', () => {
    useErrorStore.getState().pushError('炸了');
    useErrorStore.getState().pushError('又炸了');

    const view = render(createElement(Taskbar));
    const badge = view.container.querySelector('[data-testid="tray-error-badge"]');
    expect(badge).not.toBeNull();
    expect(view.container.querySelector('[data-testid="tray-error-count"]')?.textContent).toBe('2');
    view.unmount();
  });

  it('点击红点清空未处理异常', () => {
    useErrorStore.getState().pushError('炸了');

    const view = render(createElement(Taskbar));
    const badge = view.container.querySelector<HTMLButtonElement>(
      '[data-testid="tray-error-badge"]',
    );
    act(() => badge!.click());

    expect(useErrorStore.getState().errors).toHaveLength(0);
    view.unmount();
  });
});

describe('Taskbar 时钟日历', () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    useErrorStore.setState({ errors: [] });
    useDesktopStore.setState({ windows: [], icons: [], focusedId: null, nextZIndex: 10 });
  });

  afterEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = undefined;
    vi.restoreAllMocks();
  });

  it('默认不显示日历', () => {
    const view = render(createElement(Taskbar));
    expect(view.container.querySelector('[data-testid="calendar-popup"]')).toBeNull();
    view.unmount();
  });

  it('双击时钟弹出日历', () => {
    const view = render(createElement(Taskbar));
    const clock = view.container.querySelector<HTMLElement>('[data-testid="clock"]')!;
    doubleClick(clock);

    expect(view.container.querySelector('[data-testid="calendar-popup"]')).not.toBeNull();
    view.unmount();
  });

  it('日历展示当前月网格并高亮今天', () => {
    const view = render(createElement(Taskbar));
    const clock = view.container.querySelector<HTMLElement>('[data-testid="clock"]')!;
    doubleClick(clock);

    const grid = view.container.querySelector('[data-testid="calendar-grid"]');
    expect(grid?.children.length).toBe(42);

    const today = view.container.querySelectorAll('[data-today="true"]');
    expect(today).toHaveLength(1);
    view.unmount();
  });

  it('再次双击时钟收起日历', () => {
    const view = render(createElement(Taskbar));
    const clock = view.container.querySelector<HTMLElement>('[data-testid="clock"]')!;
    doubleClick(clock);
    doubleClick(clock);

    expect(view.container.querySelector('[data-testid="calendar-popup"]')).toBeNull();
    view.unmount();
  });

  it('点击「关闭」收起日历', () => {
    const view = render(createElement(Taskbar));
    const clock = view.container.querySelector<HTMLElement>('[data-testid="clock"]')!;
    doubleClick(clock);

    const close = view.container.querySelector<HTMLButtonElement>('[data-testid="calendar-close"]')!;
    act(() => close.click());

    expect(view.container.querySelector('[data-testid="calendar-popup"]')).toBeNull();
    view.unmount();
  });

  it('可以翻到上个月与下个月', () => {
    const view = render(createElement(Taskbar));
    const clock = view.container.querySelector<HTMLElement>('[data-testid="clock"]')!;
    doubleClick(clock);

    const title = view.container.querySelector('[data-testid="calendar-title"]');
    const before = title?.textContent;

    const prev = view.container.querySelector<HTMLButtonElement>('[data-testid="calendar-prev"]')!;
    act(() => prev.click());
    expect(view.container.querySelector('[data-testid="calendar-title"]')?.textContent).not.toBe(before);

    const next = view.container.querySelector<HTMLButtonElement>('[data-testid="calendar-next"]')!;
    act(() => next.click());
    expect(view.container.querySelector('[data-testid="calendar-title"]')?.textContent).toBe(before);
    view.unmount();
  });
});

describe('Taskbar 托盘状态气泡', () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    useErrorStore.setState({ errors: [] });
    useDesktopStore.setState({ windows: [], icons: [], focusedId: null, nextZIndex: 10 });
    mockFetch({
      '/api/config': {
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
      '/api/stats': {
        agents: [
          { id: 'chat', name: '对话', icon: '💬', description: 'x', toolIds: [] },
          { id: 'notepad', name: '记事本', icon: '📝', description: 'y', toolIds: [] },
        ],
        tools: [],
        sessions: 1,
        uptimeSec: 10,
        memoryMb: 32,
      },
    });
  });

  afterEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = undefined;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('默认不显示气泡', () => {
    const view = render(createElement(Taskbar));
    expect(view.container.querySelector('[data-testid="tray-bubble"]')).toBeNull();
    view.unmount();
  });

  it('点击托盘图标弹出气泡，显示连接状态、模型与 Agent 数', async () => {
    const view = render(createElement(Taskbar));
    const icon = view.container.querySelector<HTMLButtonElement>('[data-testid="tray-icon"]')!;
    act(() => icon.click());
    await flush();

    const bubble = view.container.querySelector('[data-testid="tray-bubble"]');
    expect(bubble).not.toBeNull();
    expect(view.container.querySelector('[data-testid="bubble-connection"]')).not.toBeNull();
    expect(view.container.querySelector('[data-testid="bubble-model"]')?.textContent).toBe(
      'gpt-4o-mini',
    );
    expect(view.container.querySelector('[data-testid="bubble-agent-count"]')?.textContent).toBe(
      '2 个',
    );
    view.unmount();
  });

  it('再次点击托盘图标收起气泡', async () => {
    const view = render(createElement(Taskbar));
    const icon = view.container.querySelector<HTMLButtonElement>('[data-testid="tray-icon"]')!;
    act(() => icon.click());
    await flush();
    act(() => icon.click());

    expect(view.container.querySelector('[data-testid="tray-bubble"]')).toBeNull();
    view.unmount();
  });

  it('点击「关闭」收起气泡', async () => {
    const view = render(createElement(Taskbar));
    const icon = view.container.querySelector<HTMLButtonElement>('[data-testid="tray-icon"]')!;
    act(() => icon.click());
    await flush();

    const close = view.container.querySelector<HTMLButtonElement>('[data-testid="bubble-close"]')!;
    act(() => close.click());

    expect(view.container.querySelector('[data-testid="tray-bubble"]')).toBeNull();
    view.unmount();
  });

  it('打开气泡时收起日历（两层浮层互斥）', () => {
    const view = render(createElement(Taskbar));
    const clock = view.container.querySelector<HTMLElement>('[data-testid="clock"]')!;
    doubleClick(clock);
    expect(view.container.querySelector('[data-testid="calendar-popup"]')).not.toBeNull();

    const icon = view.container.querySelector<HTMLButtonElement>('[data-testid="tray-icon"]')!;
    act(() => icon.click());

    expect(view.container.querySelector('[data-testid="calendar-popup"]')).toBeNull();
    expect(view.container.querySelector('[data-testid="tray-bubble"]')).not.toBeNull();
    view.unmount();
  });

  it('接口不可达时如实提示而非白屏', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      }),
    );

    const view = render(createElement(Taskbar));
    const icon = view.container.querySelector<HTMLButtonElement>('[data-testid="tray-icon"]')!;
    act(() => icon.click());
    await flush();

    expect(view.container.querySelector('[data-testid="bubble-error"]')).not.toBeNull();
    view.unmount();
  });
});
