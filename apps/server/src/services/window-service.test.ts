import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WindowService } from './window-service.js';

describe('WindowService', () => {
  let svc: WindowService;

  beforeEach(() => {
    svc = new WindowService({
      apps: [
        { appId: 'chat', title: '对话', icon: '💬' },
        { appId: 'files', title: '我的文档', icon: '📁', width: 520, height: 400 },
      ],
      defaultWidth: 640,
      defaultHeight: 480,
    });
  });

  it('打开窗口返回带 id 的窗口对象', () => {
    const w = svc.open('chat');
    expect(w.id).toBeTruthy();
    expect(w.appId).toBe('chat');
    expect(w.mode).toBe('normal');
  });

  it('按 appId 查出对应标题与图标', () => {
    expect(svc.open('chat').title).toBe('对话');
    expect(svc.open('files').title).toBe('我的文档');
    expect(svc.open('files').icon).toBe('📁');
  });

  it('未知 appId 回退为 appId 本身', () => {
    expect(svc.open('ghost').title).toBe('ghost');
  });

  it('应用可覆盖默认尺寸', () => {
    expect(svc.open('files').width).toBe(520);
    expect(svc.open('chat').width).toBe(640);
  });

  it('连续打开的窗口位置错开，不完全重叠', () => {
    const a = svc.open('chat');
    const b = svc.open('chat');
    expect(b.x).not.toBe(a.x);
  });

  it('列表包含所有打开的窗口', () => {
    svc.open('chat');
    svc.open('files');
    expect(svc.list().length).toBe(2);
  });

  it('关闭后从列表移除', () => {
    const w = svc.open('chat');
    svc.close(w.id);
    expect(svc.list().length).toBe(0);
  });

  it('更新几何信息', () => {
    const w = svc.open('chat');
    const updated = svc.update(w.id, { x: 100, y: 200 });
    expect(updated?.x).toBe(100);
    expect(updated?.y).toBe(200);
  });

  it('更新不存在的窗口返回 undefined', () => {
    expect(svc.update('ghost', { x: 1 })).toBeUndefined();
  });

  it('zIndex 随打开顺序递增', () => {
    const a = svc.open('chat');
    const b = svc.open('chat');
    expect(b.zIndex).toBeGreaterThan(a.zIndex);
  });
});

describe('WindowService 持久化', () => {
  /** 模拟一个持久化存储（内存里的一份快照） */
  function createStore() {
    let snapshot: unknown = null;
    return {
      load: vi.fn(() => snapshot),
      save: vi.fn((windows: unknown) => {
        snapshot = windows;
      }),
      read: () => snapshot,
    };
  }

  function buildService(store: ReturnType<typeof createStore>) {
    return new WindowService({
      apps: [{ appId: 'chat', title: '对话', icon: '💬' }],
      defaultWidth: 640,
      defaultHeight: 480,
      persistence: {
        load: store.load,
        save: store.save,
      },
    });
  }

  it('启动时从存储恢复窗口列表', () => {
    const store = createStore();
    store.save([
      {
        id: 'w1',
        appId: 'chat',
        title: '对话',
        icon: '💬',
        mode: 'normal',
        x: 10,
        y: 20,
        width: 640,
        height: 480,
        zIndex: 11,
        restoreGeometry: { x: 10, y: 20, width: 640, height: 480 },
        resizable: true,
        minimizable: true,
        maximizable: true,
      },
    ]);

    const svc = buildService(store);
    expect(svc.list()).toHaveLength(1);
    expect(svc.list()[0]?.id).toBe('w1');
    expect(svc.list()[0]?.x).toBe(10);
  });

  it('新 service 实例加载同一存储后窗口仍在（模拟重启恢复）', () => {
    const store = createStore();
    const first = buildService(store);
    first.open('chat');
    first.update(first.list()[0]!.id, { x: 300, y: 200 });

    // 新实例：模拟进程重启后从存储加载
    const second = buildService(store);
    expect(second.list()).toHaveLength(1);
    expect(second.list()[0]?.x).toBe(300);
    expect(second.list()[0]?.y).toBe(200);
  });

  it('打开窗口后写入存储', () => {
    const store = createStore();
    const svc = buildService(store);
    const win = svc.open('chat');
    expect(store.save).toHaveBeenCalled();
    const saved = store.read() as Array<{ id: string }>;
    expect(saved[0]?.id).toBe(win.id);
  });

  it('关闭窗口后同步到存储', () => {
    const store = createStore();
    const svc = buildService(store);
    const win = svc.open('chat');
    svc.close(win.id);

    const second = buildService(store);
    expect(second.list()).toHaveLength(0);
  });

  it('更新窗口后同步到存储', () => {
    const store = createStore();
    const svc = buildService(store);
    const win = svc.open('chat');
    svc.update(win.id, { width: 800, height: 600 });

    const second = buildService(store);
    expect(second.list()[0]?.width).toBe(800);
    expect(second.list()[0]?.height).toBe(600);
  });

  it('没有持久化回调时正常工作', () => {
    const svc = new WindowService({
      apps: [{ appId: 'chat', title: '对话', icon: '💬' }],
      defaultWidth: 640,
      defaultHeight: 480,
    });
    svc.open('chat');
    expect(svc.list()).toHaveLength(1);
  });

  it('存储中的非法数据被忽略', () => {
    const store = createStore();
    store.save([{ id: 'broken' }]);
    const svc = buildService(store);
    expect(svc.list()).toHaveLength(0);
  });
});
