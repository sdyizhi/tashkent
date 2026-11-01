import { Hono } from 'hono';
import type { ToolsResponse } from '@tashkent/shared';
import type { ToolRegistry } from '../agent/tool-registry.js';

export function toolRoutes(registry: ToolRegistry) {
  const app = new Hono();
  app.get('/api/tools', (c) => {
    const body: ToolsResponse = {
      tools: registry.list().map((t) => ({
        name: t.name,
        description: t.description,
        permission: t.permission,
      })),
    };
    return c.json(body);
  });
  return app;
}
