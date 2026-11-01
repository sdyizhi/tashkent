import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import FilesApp from './FilesApp.js';

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

/** 按 URL 匹配的 fetch mock */
function mockFetch(routes: Record<string, unknown>): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (url: string) => {
    const key = String(url).split('?')[0] ?? '';
    const body = routes[key];
    if (body === undefined) return new Response('{"error":{"message":"不存在"}}', { status: 404 });
    return new Response(JSON.stringify(body), { status: 200 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock as unknown as ReturnType<typeof vi.fn>;
}

function render(): { container: HTMLElement; unmount: () => void } {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  act(() => {
    root.render(createElement(FilesApp, { sessionId: 's1' }));
  });
  return {
    container,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

/** 等待一次异步的 fetch 与 React 更新完成 */
async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('FilesApp 真实文件浏览', () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = undefined;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('加载后渲染目录下的文件与子目录', async () => {
    mockFetch({
      '/api/files': {
        path: '.',
        entries: [
          { name: 'readme.md', type: 'file', size: 128 },
          { name: 'sub', type: 'dir', size: 0 },
        ],
      },
    });

    const view = render();
    await flush();

    const list = view.container.querySelector('[data-testid="files-list"]');
    expect(list).not.toBeNull();
    expect(view.container.textContent).toContain('readme.md');
    expect(view.container.textContent).toContain('sub');
    // 文件显示字节数
    expect(view.container.textContent).toContain('128 B');
    view.unmount();
  });

  it('点击子目录加载下一层', async () => {
    const fetchMock = mockFetch({
      '/api/files': { path: '.', entries: [{ name: 'sub', type: 'dir', size: 0 }] },
    });

    const view = render();
    await flush();

    const item = view.container.querySelector<HTMLElement>('[data-testid="file-sub"]');
    expect(item).not.toBeNull();
    await act(async () => {
      item!.click();
    });
    await flush();

    // 请求带上了子目录路径
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes('path=sub'))).toBe(true);
    view.unmount();
  });

  it('空目录给出提示', async () => {
    mockFetch({ '/api/files': { path: '.', entries: [] } });

    const view = render();
    await flush();

    expect(view.container.textContent).toContain('此目录为空');
    view.unmount();
  });

  it('服务端报错时展示错误信息', async () => {
    const fetchMock = vi.fn(async () => new Response('{"error":{"message":"读取失败"}}', { status: 400 }));
    vi.stubGlobal('fetch', fetchMock);

    const view = render();
    await flush();

    expect(view.container.textContent).toContain('读取失败');
    view.unmount();
  });

  it('服务端不可达时提示无法连接', async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error('network down');
    });
    vi.stubGlobal('fetch', fetchMock);

    const view = render();
    await flush();

    expect(view.container.textContent).toContain('无法连接到服务端');
    view.unmount();
  });

  it('根目录时「上一级」按钮禁用', async () => {
    mockFetch({ '/api/files': { path: '.', entries: [] } });

    const view = render();
    await flush();

    const up = view.container.querySelector<HTMLButtonElement>('[data-testid="files-up"]');
    expect(up?.disabled).toBe(true);
    view.unmount();
  });
});
