import { Hono } from 'hono';
import type { WindowsResponse } from '@tashkent/shared';
import type { WindowService } from '../services/window-service.js';

export function desktopRoutes(svc: WindowService) {
  const app = new Hono();

  app.get('/api/desktop/windows', (c) => {
    const body: WindowsResponse = { windows: svc.list() };
    return c.json(body);
  });

  app.post('/api/desktop/windows', async (c) => {
    const body = (await c.req.json()) as { appId?: string; params?: Record<string, unknown> };
    if (!body?.appId) {
      return c.json({ error: { code: 'BAD_REQUEST', message: 'appId 必填' } }, 400);
    }
    const win = svc.open(body.appId, body.params);
    return c.json(win, 201);
  });

  app.patch('/api/desktop/windows/:id', async (c) => {
    const patch = (await c.req.json()) as Record<string, unknown>;
    const updated = svc.update(c.req.param('id'), patch);
    if (!updated) return c.json({ error: { code: 'NOT_FOUND', message: '窗口不存在' } }, 404);
    return c.json(updated);
  });

  app.delete('/api/desktop/windows/:id', (c) => {
    const ok = svc.close(c.req.param('id'));
    if (!ok) return c.json({ error: { code: 'NOT_FOUND', message: '窗口不存在' } }, 404);
    return c.json({ ok: true });
  });

  return app;
}
