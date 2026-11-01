import { create } from 'zustand';
import type { WindowState } from '@tashkent/shared';
import {
  closeWindow,
  createWindow,
  focusWindow,
  maximizeWindow,
  minimizeWindow,
  moveWindow,
  resizeWindow,
  restoreWindow,
  type AppMeta,
} from '../windows/windowMachine.js';

export interface DesktopIcon {
  appId: string;
  title: string;
  icon: string;
  x: number;
  y: number;
}

interface DesktopStore {
  windows: WindowState[];
  icons: DesktopIcon[];
  focusedId: string | null;
  startMenuOpen: boolean;
  nextZIndex: number;
  apps: AppMeta[];

  openApp: (appId: string, params?: Record<string, unknown>) => void;
  close: (id: string) => void;
  minimize: (id: string) => void;
  maximize: (id: string) => void;
  restore: (id: string) => void;
  move: (id: string, x: number, y: number) => void;
  resize: (id: string, width: number, height: number) => void;
  focus: (id: string) => void;
  setStartMenuOpen: (open: boolean) => void;
  setIcons: (icons: DesktopIcon[]) => void;
  applyRemoteWindows: (windows: WindowState[]) => void;
  /** 用服务端广播的完整窗口载荷新增或替换窗口 */
  upsertRemoteWindow: (win: WindowState) => void;
  /** 用服务端广播的补丁局部更新窗口 */
  patchRemoteWindow: (id: string, patch: Partial<WindowState>) => void;
  /** 移除服务端广播已关闭的窗口 */
  removeRemoteWindow: (id: string) => void;
}

let idCounter = 0;
function nextId(): string {
  idCounter += 1;
  return `w_${Date.now().toString(36)}_${idCounter}`;
}

/**
 * 提交窗口命令到服务端。
 *
 * 服务端是窗口状态的权威源（ADR-004）：前端只提交「意图」，
 * 权威状态由服务端更新后再通过事件广播回来。
 */
async function sendWindowCommand(
  method: 'POST' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<boolean> {
  try {
    const res = await fetch(path, {
      method,
      headers: { 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** 把窗口状态机算出的新状态整理成服务端接受的补丁 */
function toPatch(w: WindowState): Partial<WindowState> {
  return {
    x: w.x,
    y: w.y,
    width: w.width,
    height: w.height,
    mode: w.mode,
    restoreGeometry: w.restoreGeometry,
  };
}

export const useDesktopStore = create<DesktopStore>((set, get) => ({
  windows: [],
  icons: [],
  focusedId: null,
  startMenuOpen: false,
  nextZIndex: 10,
  apps: [
    { appId: 'chat', title: '对话', icon: '💬' },
    { appId: 'files', title: '我的文档', icon: '📁' },
  ],

  /**
   * 打开应用。
   *
   * 服务端创建窗口并分配权威 id，前端用服务端返回的窗口对象落地；
   * 服务端随后广播的 desktop_window_opened 事件会再写回同一个 id（幂等）。
   * 只有服务端不可达时才退化为本地窗口，保证离线时桌面仍可用。
   */
  openApp: (appId, params) => {
    void (async () => {
      const res = await sendWindowCommand('POST', '/api/desktop/windows', { appId, params });
      if (res) return; // 服务端会广播事件，前端按事件落地
      const id = nextId();
      const z = get().nextZIndex + 1;
      const offset = (get().windows.length % 6) * 24;
      const win = createWindow({
        id,
        appId,
        x: 120 + offset,
        y: 80 + offset,
        width: 640,
        height: 480,
        zIndex: z,
        apps: get().apps,
        params,
      });
      set((s) => ({ windows: [...s.windows, win], focusedId: id, nextZIndex: z }));
    })();
  },

  close: (id) => {
    set((s) => ({
      windows: s.windows.filter((w) => w.id !== id),
      focusedId: s.focusedId === id ? null : s.focusedId,
    }));
    void sendWindowCommand('DELETE', `/api/desktop/windows/${id}`);
  },

  minimize: (id) =>
    set((s) => {
      const windows = s.windows.map((w) => (w.id === id ? minimizeWindow(w) : w));
      const target = windows.find((w) => w.id === id);
      if (target) void sendWindowCommand('PATCH', `/api/desktop/windows/${id}`, toPatch(target));
      return { windows };
    }),

  maximize: (id) =>
    set((s) => {
      const windows = s.windows.map((w) => (w.id === id ? maximizeWindow(w) : w));
      const target = windows.find((w) => w.id === id);
      if (target) void sendWindowCommand('PATCH', `/api/desktop/windows/${id}`, toPatch(target));
      return { windows };
    }),

  restore: (id) =>
    set((s) => {
      const windows = s.windows.map((w) => (w.id === id ? restoreWindow(w) : w));
      const target = windows.find((w) => w.id === id);
      if (target) void sendWindowCommand('PATCH', `/api/desktop/windows/${id}`, toPatch(target));
      return { windows };
    }),

  move: (id, x, y) => {
    set((s) => ({ windows: s.windows.map((w) => (w.id === id ? moveWindow(w, x, y) : w)) }));
    void sendWindowCommand('PATCH', `/api/desktop/windows/${id}`, { x, y });
  },

  resize: (id, width, height) =>
    set((s) => ({ windows: s.windows.map((w) => (w.id === id ? resizeWindow(w, width, height) : w)) })),

  focus: (id) =>
    set((s) => ({
      windows: s.windows.map((w) => (w.id === id ? focusWindow(w, s.nextZIndex + 1) : w)),
      focusedId: id,
      nextZIndex: s.nextZIndex + 1,
    })),

  setStartMenuOpen: (open) => set({ startMenuOpen: open }),
  setIcons: (icons) => set({ icons }),

  applyRemoteWindows: (windows) =>
    set((s) => ({
      windows,
      nextZIndex: Math.max(s.nextZIndex, ...windows.map((w) => w.zIndex)),
    })),

  upsertRemoteWindow: (win) =>
    set((s) => {
      const exists = s.windows.some((w) => w.id === win.id);
      return {
        windows: exists
          ? s.windows.map((w) => (w.id === win.id ? win : w))
          : [...s.windows, win],
        focusedId: s.focusedId ?? win.id,
        nextZIndex: Math.max(s.nextZIndex, win.zIndex),
      };
    }),

  removeRemoteWindow: (id) =>
    set((s) => ({
      windows: s.windows.filter((w) => w.id !== id),
      focusedId: s.focusedId === id ? null : s.focusedId,
    })),

  patchRemoteWindow: (id, patch) =>
    set((s) => {
      const exists = s.windows.some((w) => w.id === id);
      if (!exists) return {};
      return {
        windows: s.windows.map((w) => (w.id === id ? { ...w, ...patch, id: w.id } : w)),
      };
    }),

}));

export const selectFocusedWindow = (s: DesktopStore): WindowState | null =>
  s.windows.find((w) => w.id === s.focusedId) ?? null;
