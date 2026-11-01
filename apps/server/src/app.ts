import { Hono } from 'hono';
import { healthRoutes } from './routes/health.js';
import type { DB } from './db/index.js';
import type { SessionRepository } from './db/repositories/sessions.js';

export interface AppDeps {
  db: DB;
  sessions: SessionRepository;
  checkLlm: () => Promise<{ ok: boolean; latencyMs: number | null } | boolean>;
}

export function createApp(deps: AppDeps) {
  const app = new Hono();
  app.route('/', healthRoutes(deps));
  app.notFound((c) => c.json({ error: { code: 'NOT_FOUND', message: '资源不存在' } }, 404));
  app.onError((err, c) => {
    return c.json({ error: { code: 'INTERNAL', message: err.message } }, 500);
  });
  return app;
}
