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

/**
 * 幂等打开的结果。
 *
 * created = true 表示新建了窗口；false 表示命中已有窗口并执行了聚焦 / 恢复。
 */
export interface OpenOrFocusResult {
  window: WindowState;
  created: boolean;
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
    // 一个应用一个窗口：恢复时按 appId 去重，保留 zIndex 更高（更靠前）的那个
    const byApp = new Map<string, WindowState>();
    for (const item of saved) {
      if (!isWindowState(item)) continue;
      this.zIndex = Math.max(this.zIndex, item.zIndex);
      const kept = byApp.get(item.appId);
      if (!kept || item.zIndex >= kept.zIndex) byApp.set(item.appId, item);
    }
    for (const item of byApp.values()) {
      this.windows.set(item.id, item);
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

  /**
   * 按 appId 查出该应用已打开的窗口。
   *
   * 桌面语义是「一个应用一个窗口」：无论窗口处于 normal / minimized / maximized，
   * 都算该应用已打开。
   */
  findByApp(appId: string): WindowState | undefined {
    for (const win of this.windows.values()) {
      if (win.appId === appId) return win;
    }
    return undefined;
  }

  /**
   * 幂等打开应用：已有窗口则聚焦（并从最小化恢复），否则新建。
   *
   * 对应 Windows XP 的双击图标行为：已打开的应用再次双击只把窗口带到前台，
   * 而不是再开一个副本。
   */
  openOrFocus(appId: string, params?: Record<string, unknown>): OpenOrFocusResult {
    const existing = this.findByApp(appId);
    if (!existing) {
      return { window: this.open(appId, params), created: true };
    }

    this.zIndex += 1;
    const focused: WindowState = {
      ...existing,
      mode: existing.mode === 'minimized' ? 'normal' : existing.mode,
      zIndex: this.zIndex,
    };
    this.windows.set(focused.id, focused);
    this.persist();
    return { window: focused, created: false };
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
