import { Hono } from 'hono';
import type { ToolsResponse } from '@tashkent/shared';
import type { ToolRegistry } from '../agent/tool-registry.js';
import type { AuthzService } from '../services/authz-service.js';

export function toolRoutes(registry: ToolRegistry, authz: AuthzService) {
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

  /**
   * 前端在授权对话框中给出用户决策后调用本端点。
   * 只接受服务端此前发出的 authorizationId，不接受前端自述的「已授权」标记。
   */
  app.post('/api/tools/:name/authorize', async (c) => {
    const body = (await c.req.json()) as {
      authorizationId?: string;
      approved?: boolean;
      remember?: boolean;
    };
    if (!body || typeof body.authorizationId !== 'string' || typeof body.approved !== 'boolean') {
      return c.json({ error: { code: 'BAD_REQUEST', message: 'authorizationId 与 approved 必填' } }, 400);
    }
    const ok = authz.resolvePending(
      body.authorizationId,
      body.approved,
      body.remember === true,
      c.req.param('name'),
    );
    if (!ok) {
      return c.json({ error: { code: 'NOT_FOUND', message: '授权请求不存在或已过期' } }, 404);
    }
    return c.json({ ok: true });
  });

  return app;
}
