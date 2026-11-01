import { beforeEach, describe, expect, it } from 'vitest';
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
