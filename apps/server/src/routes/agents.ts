import { Hono } from 'hono';
import type { AgentsResponse } from '@tashkent/shared';
import type { AgentRegistry } from '../agent/registry.js';

export function agentRoutes(registry: AgentRegistry) {
  const app = new Hono();
  app.get('/api/agents', (c) => {
    const body: AgentsResponse = { agents: registry.list() };
    return c.json(body);
  });
  app.get('/api/agents/:id', (c) => {
    const agent = registry.get(c.req.param('id'));
    if (!agent) return c.json({ error: { code: 'NOT_FOUND', message: 'Agent 不存在' } }, 404);
    return c.json(agent);
  });
  return app;
}
