import { create } from 'zustand';
import type { WindowState, WindowsResponse } from '@tashkent/shared';
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

export interface PersistedWindow {
  appId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  mode: 'normal' | 'minimized' | 'maximized';
}

export interface DesktopPersisted {
  icons?: DesktopIcon[];
  windows?: PersistedWindow[];
}

interface DesktopStore {
  windows: WindowState[];
  icons: DesktopIcon[];
  focusedId: string | null;
  startMenuOpen: boolean;
  nextZIndex: number;
  apps: AppMeta[];

  openApp: (appId: string, params?: Record<string, unknown>) => Promise<string | null>;
  close: (id: string) => Promise<void>;
  minimize: (id: string) => Promise<void>;
  maximize: (id: string) => Promise<void>;
  restore: (id: string) => Promise<void>;
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
  /** 把桌面布局写入服务端 */
  persist: () => Promise<void>;
  /** 从服务端恢复桌面布局（与窗口的 restore(id) 区分） */
  restoreLayout: () => Promise<void>;
  /** 从服务端恢复窗口列表（服务端是窗口状态的权威源） */
  restoreWindows: () => Promise<void>;
}

let idCounter = 0;
function nextId(): string {
  idCounter += 1;
  return `w_${Date.now().toString(36)}_${idCounter}`;
}

/** 命令提交结果：ok 表示服务端确认成功，body 是服务端返回的载荷 */
interface CommandResult {
  ok: boolean;
  body: unknown;
  /** HTTP 状态码；请求失败时为 0 */
  status: number;
}

/**
 * 提交窗口命令到服务端。
 *
 * 服务端是窗口状态的权威源（ADR-004）：前端只提交「意图」，
 * 权威状态由服务端更新后再通过响应 / 事件广播回来。
 */
async function sendWindowCommand(
  method: 'POST' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<CommandResult> {
  try {
    const res = await fetch(path, {
      method,
      headers: { 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!res.ok) return { ok: false, body: null, status: res.status };
    let payload: unknown = null;
    try {
      payload = await res.json();
    } catch {
      payload = null;
    }
    return { ok: true, body: payload, status: res.status };
  } catch {
    return { ok: false, body: null, status: 0 };
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

/** 判断服务端载荷是否是完整的窗口对象 */
function isWindowState(value: unknown): value is WindowState {
  if (!value || typeof value !== 'object') return false;
  const w = value as Partial<WindowState>;
  return typeof w.id === 'string' && typeof w.appId === 'string' && typeof w.mode === 'string';
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
   * 幂等语义（对齐 Windows XP）：该应用已有窗口时聚焦它（并从最小化恢复），
   * 而不是再开一个副本。幂等由服务端保证（POST 幂等返回同一个窗口 id），
   * 前端只负责把服务端返回的权威窗口落地，不自行新增窗口。
   *
   * ADR-004：前端不做乐观更新。先把命令提交给服务端，
   * 等服务端确认（响应载荷 / desktop_window_opened 事件）后再落地本地状态。
   * 只有命令失败（服务端不可达）时才退化为本地窗口，保证离线时桌面仍可用。
   *
   * @returns 窗口的 id；命令失败且本地退化时返回本地 id
   */
  openApp: async (appId, params) => {
    const res = await sendWindowCommand('POST', '/api/desktop/windows', { appId, params });
    if (res.ok) {
      // 服务端返回权威窗口对象：按它落地（事件回写是幂等的二次确认）
      if (isWindowState(res.body)) {
        const win = res.body;
        set((s) => {
          // 同一 appId 的本地旧窗口是陈旧副本，被服务端返回的窗口原位取代，
          // 保持列表顺序稳定（任务栏按钮顺序不随聚焦变化，符合 XP 行为）
          const index = s.windows.findIndex((w) => w.appId === win.appId);
          const windows = [...s.windows];
          if (index >= 0) windows[index] = win;
          else windows.push(win);
          return {
            windows,
            focusedId: win.id,
            nextZIndex: Math.max(s.nextZIndex, win.zIndex),
          };
        });
        return win.id;
      }
      // 服务端没给出窗口对象：等 desktop_window_opened 事件回写
      return null;
    }

    // 服务端不可达：退化为本地窗口（同样遵循幂等：已有则聚焦）
    const existing = get().windows.find((w) => w.appId === appId);
    if (existing) {
      const z = get().nextZIndex + 1;
      const focused = focusWindow(
        existing.mode === 'minimized' ? restoreWindow(existing) : existing,
        z,
      );
      set((s) => ({
        windows: s.windows.map((w) => (w.id === focused.id ? focused : w)),
        focusedId: focused.id,
        nextZIndex: z,
      }));
      return focused.id;
    }

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
    return id;
  },

  /**
   * 关闭窗口。
   *
   * 先提交命令，服务端确认后再移除本地窗口；
   * 服务端随后广播的 desktop_window_closed 事件是幂等的二次确认。
   * 服务端返回 404 表示窗口已不存在（服务端才是权威），此时本地也要清掉，
   * 否则窗口会永远卡在桌面上。
   */
  close: async (id) => {
    const res = await sendWindowCommand('DELETE', `/api/desktop/windows/${id}`);
    if (!res.ok && res.status !== 404) return; // 服务端未确认，本地保持原样
    set((s) => ({
      windows: s.windows.filter((w) => w.id !== id),
      focusedId: s.focusedId === id ? null : s.focusedId,
    }));
  },

  /** 最小化：提交命令，服务端确认后再改本地状态 */
  minimize: async (id) => {
    const current = get().windows.find((w) => w.id === id);
    if (!current) return;
    const res = await sendWindowCommand(
      'PATCH',
      `/api/desktop/windows/${id}`,
      toPatch(minimizeWindow(current)),
    );
    if (!res.ok) return;
    const next = isWindowState(res.body) ? res.body : minimizeWindow(current);
    set((s) => ({ windows: s.windows.map((w) => (w.id === id ? next : w)) }));
  },

  /** 最大化：提交命令，服务端确认后再改本地状态 */
  maximize: async (id) => {
    const current = get().windows.find((w) => w.id === id);
    if (!current) return;
    const res = await sendWindowCommand(
      'PATCH',
      `/api/desktop/windows/${id}`,
      toPatch(maximizeWindow(current)),
    );
    if (!res.ok) return;
    const next = isWindowState(res.body) ? res.body : maximizeWindow(current);
    set((s) => ({ windows: s.windows.map((w) => (w.id === id ? next : w)) }));
  },

  /** 还原：提交命令，服务端确认后再改本地状态 */
  restore: async (id) => {
    const current = get().windows.find((w) => w.id === id);
    if (!current) return;
    const res = await sendWindowCommand(
      'PATCH',
      `/api/desktop/windows/${id}`,
      toPatch(restoreWindow(current)),
    );
    if (!res.ok) return;
    const next = isWindowState(res.body) ? res.body : restoreWindow(current);
    set((s) => ({ windows: s.windows.map((w) => (w.id === id ? next : w)) }));
  },

  /**
   * 移动窗口。
   *
   * 拖拽是高频操作，设计文档 5.2 允许「本地即时 + 服务端节流确认」，
   * 因此这里保留乐观更新（否则拖拽会卡顿），服务端事件回写会做二次校正。
   */
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

  persist: async () => {
    const s = get();
    try {
      await fetch('/api/desktop/state', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          key: 'desktop',
          value: {
            icons: s.icons,
            windows: s.windows.map((w) => ({
              appId: w.appId,
              x: w.x,
              y: w.y,
              width: w.width,
              height: w.height,
              mode: w.mode,
            })),
          } satisfies DesktopPersisted,
        }),
      });
    } catch {
      // 持久化失败不影响桌面使用
    }
  },

  /**
   * 从服务端恢复桌面布局。
   *
   * 只恢复图标布局：窗口状态由服务端 WindowService 持有权威（ADR-004），
   * 前端启动时从 GET /api/desktop/windows 取快照恢复，不走这里的持久化数据，
   * 否则会与服务端权威状态冲突。
   */
  restoreLayout: async () => {
    try {
      const res = await fetch('/api/desktop/state?key=desktop');
      if (!res.ok) return;
      const body = (await res.json()) as { value: DesktopPersisted | null };
      if (!body.value) return;
      set((s) => ({
        icons: body.value?.icons ?? s.icons,
      }));
    } catch {
      // 恢复失败时使用默认桌面
    }
  },

  /**
   * 从服务端恢复窗口列表。
   *
   * 服务端是窗口状态的权威源（ADR-004）：重启后窗口布局由服务端持久化，
   * 前端启动时拉取权威快照并渲染，自身只做镜像。
   */
  restoreWindows: async () => {
    try {
      const res = await fetch('/api/desktop/windows');
      if (!res.ok) return;
      const body = (await res.json()) as WindowsResponse;
      get().applyRemoteWindows(body.windows ?? []);
    } catch {
      // 服务端不可达时保持空桌面
    }
  },
}));

export const selectFocusedWindow = (s: DesktopStore): WindowState | null =>
  s.windows.find((w) => w.id === s.focusedId) ?? null;
