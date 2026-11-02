import { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import type { CreateSessionRequest, SendMessageResponse } from '@tashkent/shared';
import type { MessageRepository } from '../db/repositories/messages.js';
import type { SessionRepository } from '../db/repositories/sessions.js';
import { metrics } from '../lib/metrics.js';

export interface SessionDeps {
  sessions: SessionRepository;
  messages: MessageRepository;
  /** 发送消息后异步执行 agent；实现由 runtime 层注入 */
  dispatch: (sessionId: string, text: string) => Promise<void>;
}

export function sessionRoutes(deps: SessionDeps) {
  const app = new Hono();

  app.get('/api/sessions', (c) => c.json({ sessions: deps.sessions.list() }));

  app.post('/api/sessions', async (c) => {
    const body = (await c.req.json()) as CreateSessionRequest;
    if (!body || typeof body.agentId !== 'string') {
      return c.json({ error: { code: 'BAD_REQUEST', message: 'agentId 必填' } }, 400);
    }
    const session = deps.sessions.create({ agentId: body.agentId });
    // 活跃会话数变化时同步指标（设计文档 7.3）
    metrics.activeSessions(deps.sessions.count());
    return c.json(session, 201);
  });

  app.get('/api/sessions/:id', (c) => {
    const id = c.req.param('id');
    const session = deps.sessions.get(id);
    if (!session) return c.json({ error: { code: 'NOT_FOUND', message: '会话不存在' } }, 404);
    return c.json({ session, messages: deps.messages.listBySession(id) });
  });

  app.delete('/api/sessions/:id', (c) => {
    deps.sessions.remove(c.req.param('id'));
    metrics.activeSessions(deps.sessions.count());
    return c.json({ ok: true });
  });

  app.post('/api/sessions/:id/messages', async (c) => {
    const id = c.req.param('id');
    if (!deps.sessions.get(id)) {
      return c.json({ error: { code: 'NOT_FOUND', message: '会话不存在' } }, 404);
    }
    const body = (await c.req.json()) as { text?: string };
    if (!body || typeof body.text !== 'string' || body.text.trim() === '') {
      return c.json({ error: { code: 'BAD_REQUEST', message: 'text 必填' } }, 400);
    }
    deps.messages.append({ sessionId: id, role: 'user', content: body.text });
    void deps.dispatch(id, body.text);
    const res: SendMessageResponse = { runId: randomUUID() };
    return c.json(res, 202);
  });

  return app;
}
