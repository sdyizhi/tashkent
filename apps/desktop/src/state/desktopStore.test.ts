import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WindowState } from '@tashkent/shared';
import { useDesktopStore } from './desktopStore.js';

function remoteWindow(id: string, overrides: Partial<WindowState> = {}): WindowState {
  return {
    id,
    appId: 'chat',
    title: '对话',
    icon: '💬',
    mode: 'normal',
    x: 100,
    y: 80,
    width: 640,
    height: 480,
    zIndex: 11,
    restoreGeometry: { x: 100, y: 80, width: 640, height: 480 },
    resizable: true,
    minimizable: true,
    maximizable: true,
    ...overrides,
  };
}

/** 可手动兑现的 Promise，用于模拟「服务端还没回话」 */
function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('desktopStore 服务端窗口同步', () => {
  beforeEach(() => {
    useDesktopStore.setState({ windows: [], focusedId: null, nextZIndex: 10 });
  });

  it('upsertRemoteWindow 新增不存在的窗口', () => {
    const win = remoteWindow('srv-1');
    useDesktopStore.getState().upsertRemoteWindow(win);
    expect(useDesktopStore.getState().windows).toHaveLength(1);
    expect(useDesktopStore.getState().windows[0]?.id).toBe('srv-1');
  });

  it('upsertRemoteWindow 用事件载荷完整替换同 id 窗口', () => {
    useDesktopStore.getState().upsertRemoteWindow(remoteWindow('srv-1', { x: 10, y: 20 }));
    useDesktopStore
      .getState()
      .upsertRemoteWindow(remoteWindow('srv-1', { x: 999, y: 888, title: '新标题' }));

    const windows = useDesktopStore.getState().windows;
    expect(windows).toHaveLength(1);
    expect(windows[0]?.x).toBe(999);
    expect(windows[0]?.title).toBe('新标题');
  });

  it('removeRemoteWindow 移除指定窗口', () => {
    useDesktopStore.getState().upsertRemoteWindow(remoteWindow('srv-1'));
    useDesktopStore.getState().upsertRemoteWindow(remoteWindow('srv-2'));
    useDesktopStore.getState().removeRemoteWindow('srv-1');

    const windows = useDesktopStore.getState().windows;
    expect(windows).toHaveLength(1);
    expect(windows[0]?.id).toBe('srv-2');
  });

  it('removeRemoteWindow 移除当前聚焦窗口时清空 focusedId', () => {
    useDesktopStore.getState().upsertRemoteWindow(remoteWindow('srv-1'));
    useDesktopStore.setState({ focusedId: 'srv-1' });
    useDesktopStore.getState().removeRemoteWindow('srv-1');
    expect(useDesktopStore.getState().focusedId).toBeNull();
  });

  it('applyRemoteWindows 整体替换窗口列表', () => {
    useDesktopStore.getState().upsertRemoteWindow(remoteWindow('srv-1'));
    useDesktopStore.getState().applyRemoteWindows([remoteWindow('srv-2')]);
    const windows = useDesktopStore.getState().windows;
    expect(windows).toHaveLength(1);
    expect(windows[0]?.id).toBe('srv-2');
  });

  it('patchRemoteWindow 局部更新窗口字段', () => {
    useDesktopStore.getState().upsertRemoteWindow(remoteWindow('srv-1'));
    useDesktopStore.getState().patchRemoteWindow('srv-1', { x: 55, y: 66 });

    const win = useDesktopStore.getState().windows[0];
    expect(win?.x).toBe(55);
    expect(win?.y).toBe(66);
    expect(win?.width).toBe(640);
  });

  it('patchRemoteWindow 更新不存在的窗口时不做任何事', () => {
    useDesktopStore.getState().patchRemoteWindow('ghost', { x: 1 });
    expect(useDesktopStore.getState().windows).toHaveLength(0);
  });

  it('patchRemoteWindow 不能改写窗口 id', () => {
    useDesktopStore.getState().upsertRemoteWindow(remoteWindow('srv-1'));
    useDesktopStore
      .getState()
      .patchRemoteWindow('srv-1', { id: 'hacked', title: '改过了' } as never);

    const win = useDesktopStore.getState().windows[0];
    expect(win?.id).toBe('srv-1');
    expect(win?.title).toBe('改过了');
  });
});

describe('desktopStore 窗口命令（服务端为权威源）', () => {
  beforeEach(() => {
    useDesktopStore.setState({ windows: [], icons: [], focusedId: null, nextZIndex: 10 });
    vi.restoreAllMocks();
  });

  it('openApp 向服务端提交命令，而不是本地造窗口', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);

    useDesktopStore.getState().openApp('chat');
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/desktop/windows');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ appId: 'chat', params: undefined });

    // 窗口由服务端广播的 desktop_window_opened 事件落地
    expect(useDesktopStore.getState().windows).toHaveLength(0);

    vi.unstubAllGlobals();
  });

  it('close 向服务端提交关闭命令，服务端确认后才移除本地窗口', async () => {
    const fetchMock = vi.fn(async () => new Response('{"ok":true}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    useDesktopStore.getState().upsertRemoteWindow(remoteWindow('srv-1'));
    await useDesktopStore.getState().close('srv-1');

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/desktop/windows/srv-1');
    expect(init.method).toBe('DELETE');
    expect(useDesktopStore.getState().windows).toHaveLength(0);

    vi.unstubAllGlobals();
  });

  it('move 向服务端提交几何补丁', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    useDesktopStore.getState().upsertRemoteWindow(remoteWindow('srv-1'));
    useDesktopStore.getState().move('srv-1', 300, 400);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/desktop/windows/srv-1');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(String(init.body))).toEqual({ x: 300, y: 400 });
    expect(useDesktopStore.getState().windows[0]?.x).toBe(300);

    vi.unstubAllGlobals();
  });

  it('服务端不可达时退化为本地窗口', async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error('network down');
    });
    vi.stubGlobal('fetch', fetchMock);

    useDesktopStore.getState().openApp('chat');
    await vi.waitFor(() => expect(useDesktopStore.getState().windows).toHaveLength(1));
    expect(useDesktopStore.getState().windows[0]?.appId).toBe('chat');

    vi.unstubAllGlobals();
  });
});

describe('desktopStore 窗口命令不做乐观更新（ADR-004）', () => {
  beforeEach(() => {
    useDesktopStore.setState({ windows: [], icons: [], focusedId: null, nextZIndex: 10 });
    vi.restoreAllMocks();
  });

  it('openApp 在服务端响应前不落地任何本地窗口', async () => {
    const gate = deferred<Response>();
    const fetchMock = vi.fn(() => gate.promise);
    vi.stubGlobal('fetch', fetchMock);

    useDesktopStore.getState().openApp('chat');
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    // 服务端还没回话：本地不得出现窗口（不做乐观更新）
    expect(useDesktopStore.getState().windows).toHaveLength(0);

    gate.resolve(new Response('{}', { status: 201 }));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    vi.unstubAllGlobals();
  });

  it('openApp 在服务端响应后按服务端返回的窗口落地', async () => {
    const serverWindow = remoteWindow('srv-new', { appId: 'chat' });
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify(serverWindow), { status: 201 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await useDesktopStore.getState().openApp('chat');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const windows = useDesktopStore.getState().windows;
    expect(windows).toHaveLength(1);
    expect(windows[0]?.id).toBe('srv-new');
    expect(useDesktopStore.getState().focusedId).toBe('srv-new');

    vi.unstubAllGlobals();
  });

  it('openApp 返回新窗口的 id', async () => {
    const serverWindow = remoteWindow('srv-id', { appId: 'chat' });
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify(serverWindow), { status: 201 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const id = await useDesktopStore.getState().openApp('chat');
    expect(id).toBe('srv-id');

    vi.unstubAllGlobals();
  });

  it('openApp 在服务端返回失败状态时退化为本地窗口', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);

    await useDesktopStore.getState().openApp('chat');

    const windows = useDesktopStore.getState().windows;
    expect(windows).toHaveLength(1);
    expect(windows[0]?.appId).toBe('chat');

    vi.unstubAllGlobals();
  });

  it('minimize 在服务端响应前不改本地状态', async () => {
    const gate = deferred<Response>();
    const fetchMock = vi.fn(() => gate.promise);
    vi.stubGlobal('fetch', fetchMock);

    useDesktopStore.getState().upsertRemoteWindow(remoteWindow('srv-1'));
    useDesktopStore.getState().minimize('srv-1');

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(useDesktopStore.getState().windows[0]?.mode).toBe('normal');

    gate.resolve(new Response('{}', { status: 200 }));
    await Promise.resolve();

    vi.unstubAllGlobals();
  });

  it('maximize 在服务端响应前不改本地状态', async () => {
    const gate = deferred<Response>();
    const fetchMock = vi.fn(() => gate.promise);
    vi.stubGlobal('fetch', fetchMock);

    useDesktopStore.getState().upsertRemoteWindow(remoteWindow('srv-1'));
    useDesktopStore.getState().maximize('srv-1');

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(useDesktopStore.getState().windows[0]?.mode).toBe('normal');

    gate.resolve(new Response('{}', { status: 200 }));
    await Promise.resolve();

    vi.unstubAllGlobals();
  });

  it('restore 在服务端响应前不改本地状态', async () => {
    const gate = deferred<Response>();
    const fetchMock = vi.fn(() => gate.promise);
    vi.stubGlobal('fetch', fetchMock);

    useDesktopStore.getState().upsertRemoteWindow(
      remoteWindow('srv-1', {
        mode: 'maximized',
        restoreGeometry: { x: 100, y: 80, width: 640, height: 480 },
      }),
    );
    useDesktopStore.getState().restore('srv-1');

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(useDesktopStore.getState().windows[0]?.mode).toBe('maximized');

    gate.resolve(new Response('{}', { status: 200 }));
    await Promise.resolve();

    vi.unstubAllGlobals();
  });

  it('close 在服务端响应前不删除本地窗口', async () => {
    const gate = deferred<Response>();
    const fetchMock = vi.fn(() => gate.promise);
    vi.stubGlobal('fetch', fetchMock);

    useDesktopStore.getState().upsertRemoteWindow(remoteWindow('srv-1'));
    useDesktopStore.getState().close('srv-1');

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(useDesktopStore.getState().windows).toHaveLength(1);

    gate.resolve(new Response('{}', { status: 200 }));
    await Promise.resolve();

    vi.unstubAllGlobals();
  });

  it('move 属于高频操作：本地即时更新并向服务端提交几何补丁', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    useDesktopStore.getState().upsertRemoteWindow(remoteWindow('srv-1'));
    useDesktopStore.getState().move('srv-1', 300, 400);

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/desktop/windows/srv-1');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(String(init.body))).toEqual({ x: 300, y: 400 });
    // 拖拽允许「本地即时 + 服务端确认」
    expect(useDesktopStore.getState().windows[0]?.x).toBe(300);

    vi.unstubAllGlobals();
  });
});

describe('desktopStore 桌面状态持久化', () => {
  beforeEach(() => {
    useDesktopStore.setState({ windows: [], icons: [], focusedId: null, nextZIndex: 10 });
    vi.restoreAllMocks();
  });
  it('persist 把图标与窗口几何写入 /api/desktop/state', async () => {
    const fetchMock = vi.fn(async () => new Response('{"ok":true}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    useDesktopStore.setState({
      icons: [{ appId: 'chat', title: '对话', icon: '💬', x: 0, y: 0 }],
    });
    useDesktopStore.getState().upsertRemoteWindow(remoteWindow('srv-1', { x: 33, y: 44 }));

    await useDesktopStore.getState().persist();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/desktop/state');
    expect(init.method).toBe('PUT');
    const body = JSON.parse(String(init.body)) as {
      key: string;
      value: { icons: unknown[]; windows: Array<{ appId: string; x: number }> };
    };
    expect(body.key).toBe('desktop');
    expect(body.value.icons).toHaveLength(1);
    expect(body.value.windows[0]?.appId).toBe('chat');
    expect(body.value.windows[0]?.x).toBe(33);

    vi.unstubAllGlobals();
  });

  it('restore 从服务端读回图标位置', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            key: 'desktop',
            value: {
              icons: [{ appId: 'chat', title: '对话', icon: '💬', x: 12, y: 34 }],
              windows: [],
            },
          }),
          { status: 200 },
        ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await useDesktopStore.getState().restoreLayout();

    const icons = useDesktopStore.getState().icons;
    expect(icons).toHaveLength(1);
    expect(icons[0]?.x).toBe(12);
    expect(icons[0]?.y).toBe(34);

    vi.unstubAllGlobals();
  });

  it('restore 在服务端无数据时保持现状', async () => {
    const fetchMock = vi.fn(async () => new Response('{"key":"desktop","value":null}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    useDesktopStore.setState({
      icons: [{ appId: 'files', title: '我的文档', icon: '📁', x: 0, y: 0 }],
    });
    await useDesktopStore.getState().restoreLayout();

    expect(useDesktopStore.getState().icons).toHaveLength(1);
    expect(useDesktopStore.getState().icons[0]?.appId).toBe('files');

    vi.unstubAllGlobals();
  });

  it('restore 请求失败时静默忽略', async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error('network down');
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(useDesktopStore.getState().restoreLayout()).resolves.toBeUndefined();

    vi.unstubAllGlobals();
  });
});

describe('desktopStore 窗口列表恢复（服务端权威源）', () => {
  beforeEach(() => {
    useDesktopStore.setState({ windows: [], icons: [], focusedId: null, nextZIndex: 10 });
    vi.restoreAllMocks();
  });

  it('restoreWindows 从服务端拉取权威窗口列表', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            windows: [
              {
                id: 'srv-1',
                appId: 'chat',
                title: '对话',
                icon: '💬',
                mode: 'normal',
                x: 120,
                y: 80,
                width: 640,
                height: 480,
                zIndex: 11,
                restoreGeometry: { x: 120, y: 80, width: 640, height: 480 },
                resizable: true,
                minimizable: true,
                maximizable: true,
              },
            ],
          }),
          { status: 200 },
        ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await useDesktopStore.getState().restoreWindows();

    expect(fetchMock).toHaveBeenCalledWith('/api/desktop/windows');
    const windows = useDesktopStore.getState().windows;
    expect(windows).toHaveLength(1);
    expect(windows[0]?.id).toBe('srv-1');
    expect(windows[0]?.x).toBe(120);

    vi.unstubAllGlobals();
  });

  it('restoreWindows 在服务端无窗口时清空列表', async () => {
    const fetchMock = vi.fn(async () => new Response('{"windows":[]}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    useDesktopStore.getState().upsertRemoteWindow(remoteWindow('old'));
    await useDesktopStore.getState().restoreWindows();

    expect(useDesktopStore.getState().windows).toHaveLength(0);

    vi.unstubAllGlobals();
  });

  it('restoreWindows 请求失败时保持现状', async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error('network down');
    });
    vi.stubGlobal('fetch', fetchMock);

    useDesktopStore.getState().upsertRemoteWindow(remoteWindow('srv-1'));
    await expect(useDesktopStore.getState().restoreWindows()).resolves.toBeUndefined();

    expect(useDesktopStore.getState().windows).toHaveLength(1);

    vi.unstubAllGlobals();
  });
});
