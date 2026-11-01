import { Hono } from 'hono';
import { healthRoutes } from './routes/health.js';
import { agentRoutes } from './routes/agents.js';
import { sessionRoutes } from './routes/sessions.js';
import { toolRoutes } from './routes/tools.js';
import { eventRoutes } from './routes/events.js';
import { desktopRoutes } from './routes/desktop.js';
import { desktopStateRoutes } from './routes/desktop-state.js';
import { appRoutes } from './routes/apps.js';
import { registerStaticAssets } from './lib/static-assets.js';
import type { Runtime } from './runtime.js';

export function createApp(rt: Runtime) {
  const app = new Hono();

  app.route(
    '/',
    healthRoutes({
      db: rt.db,
      sessions: rt.sessions,
      agentCount: rt.registry.list().length,
      checkLlm: rt.checkLlm,
    }),
  );
  app.route('/', agentRoutes(rt.registry));
  app.route('/', toolRoutes(rt.toolRegistry, rt.authz));
  app.route('/', eventRoutes(rt.bus));
  app.route(
    '/',
    sessionRoutes({
      sessions: rt.sessions,
      messages: rt.messages,
      dispatch: async (sessionId, text) => {
        const session = rt.sessions.get(sessionId);
        if (!session) return;
        const agent = rt.registry.get(session.agentId);
        if (!agent) return;
        const result = await rt.runner.run({ sessionId, agentId: agent.id, agent, userText: text });
        rt.messages.append({
          sessionId,
          role: 'assistant',
          content: result.text,
          toolCalls: result.toolCalls,
        });
      },
    }),
  );
  app.route('/', desktopRoutes(rt.windowService, (event) => rt.bus.publish(event)));
  app.route('/', desktopStateRoutes(rt.desktopState));
  app.route('/', appRoutes());

  // 静态托管放在所有 API 路由之后：API 先匹配，未命中的路径才落到前端产物
  registerStaticAssets(app);

  app.notFound((c) => c.json({ error: { code: 'NOT_FOUND', message: '资源不存在' } }, 404));
  app.onError((err, c) => {
    return c.json({ error: { code: 'INTERNAL', message: err.message } }, 500);
  });
  return app;
}
