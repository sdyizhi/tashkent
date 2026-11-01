export type WindowMode = 'normal' | 'minimized' | 'maximized';

export interface WindowGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WindowState extends WindowGeometry {
  id: string;
  appId: string;
  title: string;
  icon: string;
  mode: WindowMode;
  zIndex: number;
  /** 最大化前保存的几何信息，用于还原 */
  restoreGeometry: WindowGeometry;
  resizable: boolean;
  minimizable: boolean;
  maximizable: boolean;
  sessionId?: string;
  params?: Record<string, unknown>;
}
