import { Hono } from 'hono';
import type { Runtime } from '../runtime.js';

/**
 * 运行统计。
 *
 * 只暴露可观测性数据（Agent / 工具清单、会话数、运行时长、内存），
 * 绝不包含任何凭据。
 */
export function statsRoutes(rt: Runtime) {
  const app = new Hono();

  app.get('/api/stats', (c) =>
    c.json({
      agents: rt.registry.list().map((a) => ({
        id: a.id,
        name: a.name,
        icon: a.icon,
        description: a.description,
        toolIds: a.toolIds,
      })),
      tools: rt.toolRegistry.list().map((t) => ({
        name: t.name,
        description: t.description,
        permission: t.permission,
      })),
      sessions: rt.sessions.list().length,
      uptimeSec: Math.round(process.uptime()),
      memoryMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    }),
  );

  return app;
}
