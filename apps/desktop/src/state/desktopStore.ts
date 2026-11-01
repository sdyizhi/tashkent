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

  openApp: (appId: string, params?: Record<string, unknown>) => string;
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
}

let idCounter = 0;
function nextId(): string {
  idCounter += 1;
  return `w_${Date.now().toString(36)}_${idCounter}`;
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

  openApp: (appId, params) => {
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

  close: (id) =>
    set((s) => ({
      windows: s.windows.filter((w) => w.id !== id),
      focusedId: s.focusedId === id ? null : s.focusedId,
    })),

  minimize: (id) =>
    set((s) => ({ windows: s.windows.map((w) => (w.id === id ? minimizeWindow(w) : w)) })),

  maximize: (id) =>
    set((s) => ({ windows: s.windows.map((w) => (w.id === id ? maximizeWindow(w) : w)) })),

  restore: (id) =>
    set((s) => ({ windows: s.windows.map((w) => (w.id === id ? restoreWindow(w) : w)) })),

  move: (id, x, y) =>
    set((s) => ({ windows: s.windows.map((w) => (w.id === id ? moveWindow(w, x, y) : w)) })),

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

  applyRemoteWindows: (windows) => set({ windows }),
}));

export const selectFocusedWindow = (s: DesktopStore): WindowState | null =>
  s.windows.find((w) => w.id === s.focusedId) ?? null;
