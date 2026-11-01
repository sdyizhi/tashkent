import { randomUUID } from 'node:crypto';
import type { WindowState } from '@tashkent/shared';

export interface WindowAppMeta {
  appId: string;
  title: string;
  icon: string;
  width?: number;
  height?: number;
}

/**
 * 窗口列表的持久化回调。
 *
 * WindowService 本身对「存到哪里」无感知：
 * 由运行时装配层提供 load / save 实现（落 desktop_state 表）。
 */
export interface WindowPersistence {
  /** 启动时读取已保存的窗口列表 */
  load: () => WindowState[];
  /** 窗口列表变化后写入 */
  save: (windows: WindowState[]) => void;
}

export interface WindowServiceOptions {
  /** 应用元信息表；按 appId 查标题与图标，未知 appId 回退到 appId 本身 */
  apps: WindowAppMeta[];
  /** 未在 apps 中声明的窗口使用的默认尺寸 */
  defaultWidth?: number;
  defaultHeight?: number;
  baseX?: number;
  baseY?: number;
  /** 可选的持久化回调；提供后重启可恢复窗口布局 */
  persistence?: WindowPersistence;
}

/** 判断一条记录是否是结构完整的窗口状态 */
function isWindowState(value: unknown): value is WindowState {
  if (!value || typeof value !== 'object') return false;
  const w = value as Partial<WindowState>;
  return (
    typeof w.id === 'string' &&
    typeof w.appId === 'string' &&
    typeof w.x === 'number' &&
    typeof w.y === 'number' &&
    typeof w.width === 'number' &&
    typeof w.height === 'number' &&
    typeof w.zIndex === 'number' &&
    typeof w.mode === 'string'
  );
}

export class WindowService {
  private readonly windows = new Map<string, WindowState>();
  private zIndex = 10;
  private cascade = 0;

  constructor(private readonly options: WindowServiceOptions) {
    this.restore();
  }

  /** 从持久化存储恢复窗口列表 */
  private restore(): void {
    const persistence = this.options.persistence;
    if (!persistence) return;
    let saved: WindowState[];
    try {
      saved = persistence.load();
    } catch {
      return;
    }
    if (!Array.isArray(saved)) return;
    for (const item of saved) {
      if (!isWindowState(item)) continue;
      this.windows.set(item.id, item);
      this.zIndex = Math.max(this.zIndex, item.zIndex);
    }
  }

  /** 把当前窗口列表写回持久化存储 */
  private persist(): void {
    const persistence = this.options.persistence;
    if (!persistence) return;
    try {
      persistence.save(this.list());
    } catch {
      // 持久化失败不影响桌面使用
    }
  }

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
    this.persist();
    return win;
  }

  list(): WindowState[] {
    return [...this.windows.values()];
  }

  get(id: string): WindowState | undefined {
    return this.windows.get(id);
  }

  close(id: string): boolean {
    const ok = this.windows.delete(id);
    if (ok) this.persist();
    return ok;
  }

  update(id: string, patch: Partial<WindowState>): WindowState | undefined {
    const current = this.windows.get(id);
    if (!current) return undefined;
    const next: WindowState = { ...current, ...patch, id: current.id };
    this.windows.set(id, next);
    this.persist();
    return next;
  }
}
