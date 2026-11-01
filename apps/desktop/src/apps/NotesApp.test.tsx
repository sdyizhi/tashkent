import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import NotesApp from './NotesApp.js';

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

interface FetchCall {
  url: string;
  method: string;
  body: unknown;
}

let calls: FetchCall[] = [];
/** 由各用例设置的路由响应表 */
let routes: Record<string, unknown> = {};

function installFetch(): void {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    calls.push({ url: String(url), method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
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
    root.render(createElement(NotesApp, { sessionId: 's1' }));
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

describe('NotesApp 记事本', () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    calls = [];
    routes = {
      'GET /api/files': {
        path: '.',
        entries: [
          { name: 'note.txt', type: 'file', size: 12 },
          { name: 'sub', type: 'dir', size: 0 },
        ],
      },
      'GET /api/files/note.txt': { path: 'note.txt', content: '你好，世界' },
      'PUT /api/files': { ok: true },
    };
    installFetch();
  });

  afterEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = undefined;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('列出工作区中的文本文件', async () => {
    const view = render();
    await flush();

    expect(view.container.querySelector('[data-testid="notes-list"]')).not.toBeNull();
    expect(view.container.textContent).toContain('note.txt');
    view.unmount();
  });

  it('点击文件后读入内容到编辑区', async () => {
    const view = render();
    await flush();

    const item = view.container.querySelector<HTMLElement>('[data-testid="notes-file-note.txt"]');
    expect(item).not.toBeNull();
    await act(async () => {
      item!.click();
    });
    await flush();

    const editor = view.container.querySelector<HTMLTextAreaElement>('[data-testid="notes-editor"]');
    expect(editor?.value).toBe('你好，世界');
    view.unmount();
  });

  it('保存时把内容写回服务端', async () => {
    const view = render();
    await flush();

    const item = view.container.querySelector<HTMLElement>('[data-testid="notes-file-note.txt"]');
    await act(async () => {
      item!.click();
    });
    await flush();

    const editor = view.container.querySelector<HTMLTextAreaElement>('[data-testid="notes-editor"]');
    expect(editor).not.toBeNull();
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        'value',
      )?.set;
      setter?.call(editor, '改过的内容');
      editor!.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await flush();

    const save = view.container.querySelector<HTMLButtonElement>('[data-testid="notes-save"]');
    await act(async () => {
      save!.click();
    });
    await flush();

    const put = calls.find((c) => c.method === 'PUT');
    expect(put).toBeTruthy();
    expect(put?.url).toBe('/api/files');
    expect(put?.body).toEqual({ path: 'note.txt', content: '改过的内容' });
    expect(view.container.querySelector('[data-testid="notes-status"]')?.textContent).toContain('已保存');
    view.unmount();
  });

  it('未选择文件时保存按钮禁用', async () => {
    const view = render();
    await flush();

    const save = view.container.querySelector<HTMLButtonElement>('[data-testid="notes-save"]');
    expect(save?.disabled).toBe(true);
    view.unmount();
  });

  it('保存失败时如实展示错误', async () => {
    routes['PUT /api/files'] = { error: { message: '写入失败' } };
    const view = render();
    await flush();

    const item = view.container.querySelector<HTMLElement>('[data-testid="notes-file-note.txt"]');
    await act(async () => {
      item!.click();
    });
    await flush();

    const save = view.container.querySelector<HTMLButtonElement>('[data-testid="notes-save"]');
    await act(async () => {
      save!.click();
    });
    await flush();

    expect(view.container.querySelector('[data-testid="notes-status"]')?.textContent).toContain('写入失败');
    view.unmount();
  });
});
