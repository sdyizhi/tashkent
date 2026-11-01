import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { createDatabase } from '../db/index.js';
import { SessionRepository } from '../db/repositories/sessions.js';
import { healthRoutes } from './health.js';

function buildApp(llmOk: boolean) {
  const db = createDatabase(':memory:');
  const sessions = new SessionRepository(db);
  sessions.create({ id: 's1', agentId: 'chat' });
  const app = new Hono();
  app.route('/', healthRoutes({ db, sessions, checkLlm: async () => llmOk }));
  return app;
}

describe('GET /api/health', () => {
  it('LLM 可用时返回 status=ok', async () => {
    const res = await buildApp(true).request('/api/health');
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.status).toBe('ok');
    expect(body.db.ok).toBe(true);
    expect(body.db.sessions).toBe(1);
  });

  it('LLM 不可用时降级为 degraded 但仍是 200', async () => {
    const res = await buildApp(false).request('/api/health');
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.status).toBe('degraded');
  });
});
