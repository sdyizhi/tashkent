import { z } from 'zod';
import type { ToolDefinition } from '@tashkent/shared';
import type { WindowService } from '../services/window-service.js';

export function createDesktopTools(svc: WindowService): ToolDefinition[] {
  const openApp: ToolDefinition = {
    name: 'desktop.open_app',
    description: '在工作台中打开一个应用程序窗口（幂等：已打开则聚焦已有窗口）',
    inputSchema: z.object({
      appId: z.string().describe('目标应用 ID，如 chat / files'),
      params: z.record(z.string(), z.unknown()).optional(),
    }),
    permission: 'safe',
    execute: async (input: { appId: string; params?: Record<string, unknown> }, ctx) => {
      // 与前端双击图标共用同一套幂等语义：已有窗口则聚焦，不新建副本
      const { window: win, created } = svc.openOrFocus(input.appId, input.params);
      if (created) {
        ctx.emit({
          type: 'desktop_window_opened',
          sessionId: ctx.sessionId,
          window: win,
        });
        return { ok: true, data: { windowId: win.id }, summary: `已打开 ${input.appId}` };
      }
      ctx.emit({
        type: 'desktop_window_updated',
        sessionId: ctx.sessionId,
        windowId: win.id,
        patch: { mode: win.mode, zIndex: win.zIndex },
      });
      return {
        ok: true,
        data: { windowId: win.id },
        summary: `${input.appId} 已打开，已聚焦现有窗口`,
      };
    },
  };

  const closeWindow: ToolDefinition = {
    name: 'desktop.close_window',
    description: '关闭指定窗口',
    inputSchema: z.object({ windowId: z.string() }),
    permission: 'safe',
    execute: async (input: { windowId: string }, ctx) => {
      const ok = svc.close(input.windowId);
      if (!ok) return { ok: false, error: '窗口不存在' };
      ctx.emit({ type: 'desktop_window_closed', sessionId: ctx.sessionId, windowId: input.windowId });
      return { ok: true, summary: '已关闭窗口' };
    },
  };

  const notify: ToolDefinition = {
    name: 'desktop.notify',
    description: '在桌面右下角弹出气泡通知',
    inputSchema: z.object({
      message: z.string(),
      icon: z.string().optional(),
    }),
    permission: 'safe',
    execute: async (input: { message: string; icon?: string }, ctx) => {
      ctx.emit({
        type: 'desktop_notify',
        sessionId: ctx.sessionId,
        message: input.message,
        icon: input.icon,
      });
      return { ok: true, summary: '已发送通知' };
    },
  };

  return [openApp, closeWindow, notify];
}
