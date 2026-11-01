import { describe, expect, it } from 'vitest';
import type { WindowState } from '@tashkent/shared';
import {
  createWindow,
  maximizeWindow,
  minimizeWindow,
  restoreWindow,
  moveWindow,
  focusWindow,
  closeWindow,
  resizeWindow,
} from './windowMachine.js';

const base: WindowState = {
  id: 'w1',
  appId: 'chat',
  title: '对话',
  icon: '💬',
  mode: 'normal',
  x: 100,
  y: 80,
  width: 640,
  height: 480,
  zIndex: 1,
  restoreGeometry: { x: 100, y: 80, width: 640, height: 480 },
  resizable: true,
  minimizable: true,
  maximizable: true,
};

describe('createWindow', () => {
  it('按 appId 查找应用元信息填充标题与图标', () => {
    const w = createWindow({
      id: 'w2',
      appId: 'notes',
      x: 0, y: 0, width: 300, height: 200, zIndex: 3,
      apps: [{ appId: 'notes', title: '记事本', icon: '📝' }],
    });
    expect(w.title).toBe('记事本');
    expect(w.icon).toBe('📝');
    expect(w.mode).toBe('normal');
  });

  it('应用元信息缺失时回退到 appId 作为标题', () => {
    const w = createWindow({
      id: 'w3', appId: 'ghost', x: 0, y: 0, width: 300, height: 200, zIndex: 4,
      apps: [],
    });
    expect(w.title).toBe('ghost');
  });
});

describe('窗口状态迁移', () => {
  it('maximize 记录 restoreGeometry 并进入 maximized', () => {
    const w = maximizeWindow(base);
    expect(w.mode).toBe('maximized');
    expect(w.restoreGeometry).toEqual({ x: 100, y: 80, width: 640, height: 480 });
  });

  it('restore 从 maximized 回到 normal 并还原几何', () => {
    const maximized = maximizeWindow(base);
    const back = restoreWindow(maximized);
    expect(back.mode).toBe('normal');
    expect(back.x).toBe(100);
    expect(back.width).toBe(640);
  });

  it('minimize 只改 mode，不动几何', () => {
    const w = minimizeWindow(base);
    expect(w.mode).toBe('minimized');
    expect(w.x).toBe(100);
    expect(w.width).toBe(640);
  });

  it('restore 从 minimized 也回到 normal', () => {
    const w = restoreWindow(minimizeWindow(base));
    expect(w.mode).toBe('normal');
  });

  it('不可最大化的窗口 maximize 后仍是 normal', () => {
    const w = maximizeWindow({ ...base, maximizable: false });
    expect(w.mode).toBe('normal');
  });

  it('不可最小化的窗口 minimize 后仍是 normal', () => {
    const w = minimizeWindow({ ...base, minimizable: false });
    expect(w.mode).toBe('normal');
  });

  it('move 更新坐标但不改尺寸', () => {
    const w = moveWindow(base, 200, 300);
    expect(w.x).toBe(200);
    expect(w.y).toBe(300);
    expect(w.width).toBe(640);
  });

  it('move 期间保留当前 geometry 作为 restoreGeometry', () => {
    const w = moveWindow(base, 200, 300);
    expect(w.restoreGeometry.width).toBe(640);
  });

  it('resize 更新尺寸', () => {
    const w = resizeWindow(base, 800, 600);
    expect(w.width).toBe(800);
    expect(w.height).toBe(600);
  });

  it('不可缩放的窗口 resize 不生效', () => {
    const w = resizeWindow({ ...base, resizable: false }, 800, 600);
    expect(w.width).toBe(640);
  });

  it('focus 提升 zIndex', () => {
    const w = focusWindow(base, 10);
    expect(w.zIndex).toBe(10);
  });

  it('closeWindow 返回 null', () => {
    expect(closeWindow(base)).toBeNull();
  });
});
