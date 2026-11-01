import { Hono } from 'hono';
import type { AgentEvent, WindowsResponse } from '@tashkent/shared';
import type { WindowService } from '../services/window-service.js';

/**
 * 桌面窗口命令不是会话内的行为，因此用固定 sessionId 标记。
 * 前端按 sessionId 过滤会话流，但窗口类事件必须始终应用到桌面。
 */
export const DESKTOP_SESSION_ID = '__desktop__';

export type DesktopEventSink = (event: AgentEvent) => void;

export function desktopRoutes(svc: WindowService, emit: DesktopEventSink) {
  const app = new Hono();

  app.get('/api/desktop/windows', (c) => {
    const body: WindowsResponse = { windows: svc.list() };
    return c.json(body);
  });

  /**
   * 幂等打开窗口。
   *
   * XP 语义：双击桌面图标时，若该应用已打开则聚焦已有窗口（并从最小化恢复），
   * 而不是再开一个副本。因此这里用 openOrFocus：命中已有窗口时返回 200 与该窗口，
   * 新建时返回 201。
   */
  app.post('/api/desktop/windows', async (c) => {
    const body = (await c.req.json()) as { appId?: string; params?: Record<string, unknown> };
    if (!body?.appId) {
      return c.json({ error: { code: 'BAD_REQUEST', message: 'appId 必填' } }, 400);
    }
    const { window: win, created } = svc.openOrFocus(body.appId, body.params);
    if (created) {
      emit({
        type: 'desktop_window_opened',
        sessionId: DESKTOP_SESSION_ID,
        window: win,
      });
      return c.json(win, 201);
    }
    // 聚焦已有窗口：广播一次更新，让其它客户端同步置顶 / 恢复
    emit({
      type: 'desktop_window_updated',
      sessionId: DESKTOP_SESSION_ID,
      windowId: win.id,
      patch: { mode: win.mode, zIndex: win.zIndex },
    });
    return c.json(win, 200);
  });

  app.patch('/api/desktop/windows/:id', async (c) => {
    const patch = (await c.req.json()) as Record<string, unknown>;
    const updated = svc.update(c.req.param('id'), patch);
    if (!updated) return c.json({ error: { code: 'NOT_FOUND', message: '窗口不存在' } }, 404);
    emit({
      type: 'desktop_window_updated',
      sessionId: DESKTOP_SESSION_ID,
      windowId: updated.id,
      patch,
    });
    return c.json(updated);
  });

  app.delete('/api/desktop/windows/:id', (c) => {
    const id = c.req.param('id');
    const ok = svc.close(id);
    if (!ok) return c.json({ error: { code: 'NOT_FOUND', message: '窗口不存在' } }, 404);
    emit({
      type: 'desktop_window_closed',
      sessionId: DESKTOP_SESSION_ID,
      windowId: id,
    });
    return c.json({ ok: true });
  });

  return app;
}
