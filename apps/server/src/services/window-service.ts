import { randomUUID } from 'node:crypto';
import type { WindowState } from '@tashkent/shared';

export interface WindowAppMeta {
  appId: string;
  title: string;
  icon: string;
  width?: number;
  height?: number;
}

export interface WindowServiceOptions {
  /** 应用元信息表；按 appId 查标题与图标，未知 appId 回退到 appId 本身 */
  apps: WindowAppMeta[];
  /** 未在 apps 中声明的窗口使用的默认尺寸 */
  defaultWidth?: number;
  defaultHeight?: number;
  baseX?: number;
  baseY?: number;
}

export class WindowService {
  private readonly windows = new Map<string, WindowState>();
  private zIndex = 10;
  private cascade = 0;

  constructor(private readonly options: WindowServiceOptions) {}

  open(appId: string, params?: Record<string, unknown>): WindowState {
    this.zIndex += 1;
    this.cascade += 1;
    const baseX = this.options.baseX ?? 120;
    const baseY = this.options.baseY ?? 80;
    const offset = ((this.cascade - 1) % 6) * 24;

    const meta = this.options.apps.find((a) => a.appId === appId);
    const width = meta?.width ?? this.options.defaultWidth ?? 640;
    const height = meta?.height ?? this.options.defaultHeight ?? 480;

    const win: WindowState = {
      id: randomUUID(),
      appId,
      title: meta?.title ?? appId,
      icon: meta?.icon ?? '📁',
      mode: 'normal',
      x: baseX + offset,
      y: baseY + offset,
      width,
      height,
      zIndex: this.zIndex,
      restoreGeometry: { x: baseX + offset, y: baseY + offset, width, height },
      resizable: true,
      minimizable: true,
      maximizable: true,
      params,
    };
    this.windows.set(win.id, win);
    return win;
  }

  list(): WindowState[] {
    return [...this.windows.values()];
  }

  get(id: string): WindowState | undefined {
    return this.windows.get(id);
  }

  close(id: string): boolean {
    return this.windows.delete(id);
  }

  update(id: string, patch: Partial<WindowState>): WindowState | undefined {
    const current = this.windows.get(id);
    if (!current) return undefined;
    const next: WindowState = { ...current, ...patch, id: current.id };
    this.windows.set(id, next);
    return next;
  }
}
