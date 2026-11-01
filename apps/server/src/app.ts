import { Hono } from 'hono';
import { healthRoutes } from './routes/health.js';
import { agentRoutes } from './routes/agents.js';
import { sessionRoutes } from './routes/sessions.js';
import { toolRoutes } from './routes/tools.js';
import { eventRoutes } from './routes/events.js';
import type { DB } from './db/index.js';
import type { MessageRepository } from './db/repositories/messages.js';
import type { SessionRepository } from './db/repositories/sessions.js';
import type { AgentRegistry } from './agent/registry.js';
import type { ToolRegistry } from './agent/tool-registry.js';
import type { EventBus } from './lib/event-bus.js';

export interface AppDeps {
  db: DB;
  sessions: SessionRepository;
  messages: MessageRepository;
  agents: AgentRegistry;
  tools: ToolRegistry;
  bus: EventBus;
  checkLlm: () => Promise<{ ok: boolean; latencyMs: number | null } | boolean>;
  /** 发送消息后异步执行 agent */
  dispatch: (sessionId: string, text: string) => Promise<void>;
}

export function createApp(deps: AppDeps) {
  const app = new Hono();
  app.route(
    '/',
    healthRoutes({
      db: deps.db,
      sessions: deps.sessions,
      agentCount: deps.agents.list().length,
      checkLlm: deps.checkLlm,
    }),
  );
  app.route('/', agentRoutes(deps.agents));
  app.route('/', toolRoutes(deps.tools));
  app.route('/', eventRoutes(deps.bus));
  app.route(
    '/',
    sessionRoutes({
      sessions: deps.sessions,
      messages: deps.messages,
      dispatch: deps.dispatch,
    }),
  );
  app.notFound((c) => c.json({ error: { code: 'NOT_FOUND', message: '资源不存在' } }, 404));
  app.onError((err, c) => {
    return c.json({ error: { code: 'INTERNAL', message: err.message } }, 500);
  });
  return app;
}
