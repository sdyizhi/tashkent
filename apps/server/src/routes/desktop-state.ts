import { Hono } from 'hono';
import type { DesktopStateRepository } from '../db/repositories/desktop-state.js';

export function desktopStateRoutes(repo: DesktopStateRepository) {
  const app = new Hono();

  app.get('/api/desktop/state', (c) => {
    const key = c.req.query('key');
    if (!key) {
      return c.json({ error: { code: 'BAD_REQUEST', message: 'key 必填' } }, 400);
    }
    return c.json({ key, value: repo.get<unknown>(key, null) });
  });

  app.put('/api/desktop/state', async (c) => {
    const body = (await c.req.json()) as { key?: string; value?: unknown };
    if (!body?.key) {
      return c.json({ error: { code: 'BAD_REQUEST', message: 'key 必填' } }, 400);
    }
    repo.set(body.key, body.value ?? null);
    return c.json({ ok: true });
  });

  return app;
}
