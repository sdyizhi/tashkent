import { Hono } from 'hono';
import { APP_REGISTRY, findApp } from '@tashkent/shared';

export function appRoutes() {
  const app = new Hono();
  app.get('/api/apps', (c) => c.json({ apps: APP_REGISTRY }));
  app.get('/api/apps/:id', (c) => {
    const found = findApp(c.req.param('id'));
    if (!found) return c.json({ error: { code: 'NOT_FOUND', message: '应用不存在' } }, 404);
    return c.json(found);
  });
  return app;
}
