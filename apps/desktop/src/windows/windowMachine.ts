import type { WindowGeometry, WindowState } from '@tashkent/shared';

export interface AppMeta {
  appId: string;
  title: string;
  icon: string;
}

export interface CreateWindowInput {
  id: string;
  appId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  apps: AppMeta[];
  sessionId?: string;
  params?: Record<string, unknown>;
}

export function createWindow(input: CreateWindowInput): WindowState {
  const meta = input.apps.find((a) => a.appId === input.appId);
  const geometry: WindowGeometry = {
    x: input.x,
    y: input.y,
    width: input.width,
    height: input.height,
  };
  return {
    id: input.id,
    appId: input.appId,
    title: meta?.title ?? input.appId,
    icon: meta?.icon ?? '📁',
    mode: 'normal',
    ...geometry,
    zIndex: input.zIndex,
    restoreGeometry: geometry,
    resizable: true,
    minimizable: true,
    maximizable: true,
    sessionId: input.sessionId,
    params: input.params,
  };
}

export function maximizeWindow(w: WindowState): WindowState {
  if (!w.maximizable || w.mode === 'maximized') return w;
  return {
    ...w,
    mode: 'maximized',
    restoreGeometry: { x: w.x, y: w.y, width: w.width, height: w.height },
  };
}

export function minimizeWindow(w: WindowState): WindowState {
  if (!w.minimizable || w.mode === 'minimized') return w;
  return { ...w, mode: 'minimized' };
}

export function restoreWindow(w: WindowState): WindowState {
  if (w.mode === 'normal') return w;
  const g = w.restoreGeometry;
  return { ...w, mode: 'normal', x: g.x, y: g.y, width: g.width, height: g.height };
}

export function moveWindow(w: WindowState, x: number, y: number): WindowState {
  return { ...w, x, y };
}

export function resizeWindow(w: WindowState, width: number, height: number): WindowState {
  if (!w.resizable) return w;
  return { ...w, width, height };
}

export function focusWindow(w: WindowState, zIndex: number): WindowState {
  return { ...w, zIndex };
}

export function closeWindow(_w: WindowState): null {
  return null;
}
