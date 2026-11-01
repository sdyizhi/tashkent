import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { z } from 'zod';
import type { ToolDefinition } from '@tashkent/shared';
import { ToolRegistry } from '../agent/tool-registry.js';
import { AuthzService } from '../services/authz-service.js';
import { toolRoutes } from './tools.js';

function writeTool(): ToolDefinition {
  return {
    name: 'fs.write',
    description: '写入文件',
    inputSchema: z.object({ path: z.string() }),
    permission: 'write',
    execute: async () => ({ ok: true }),
  };
}

function buildApp() {
  const registry = new ToolRegistry();
  registry.register(writeTool());
  const authz = new AuthzService({ timeoutMs: 1000 });
  const app = new Hono();
  app.route('/', toolRoutes(registry, authz));
  return { app, authz };
}

/** 发起一次授权请求，返回 authorizationId 与结算 Promise */
function startPending(authz: AuthzService): { id: string; pending: Promise<{ allowed: boolean }> } {
  let id = '';
  const pending = authz.request(writeTool(), (info) => {
    id = info.authorizationId;
  });
  return { id, pending };
}

function post(app: Hono, name: string, body: unknown) {
  return app.request(`/api/tools/${name}/authorize`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('GET /api/tools', () => {
  it('返回工具清单', async () => {
    const { app } = buildApp();
    const res = await app.request('/api/tools');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { tools: Array<{ name: string; permission: string }> };
    expect(body.tools).toHaveLength(1);
    expect(body.tools[0]!.name).toBe('fs.write');
    expect(body.tools[0]!.permission).toBe('write');
  });
});

describe('POST /api/tools/:name/authorize', () => {
  it('批准待决授权后放行工具', async () => {
    const { app, authz } = buildApp();
    const { id, pending } = startPending(authz);

    const res = await post(app, 'fs.write', { authorizationId: id, approved: true, remember: true });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    await expect(pending).resolves.toMatchObject({ allowed: true });
  });

  it('授权请求在决策前保持挂起', async () => {
    const { app, authz } = buildApp();
    const { id, pending } = startPending(authz);

    let settled = false;
    void pending.then(() => {
      settled = true;
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(settled).toBe(false);

    await post(app, 'fs.write', { authorizationId: id, approved: true });
    await expect(pending).resolves.toMatchObject({ allowed: true });
  });

  it('拒绝授权后工具不放行', async () => {
    const { app, authz } = buildApp();
    const { id, pending } = startPending(authz);

    const res = await post(app, 'fs.write', { authorizationId: id, approved: false });
    expect(res.status).toBe(200);
    await expect(pending).resolves.toMatchObject({ allowed: false });
  });

  it('不存在的 authorizationId 返回 404', async () => {
    const { app } = buildApp();
    const res = await post(app, 'fs.write', { authorizationId: 'nope', approved: true });
    expect(res.status).toBe(404);
  });

  it('缺少 authorizationId 返回 400', async () => {
    const { app } = buildApp();
    const res = await post(app, 'fs.write', { approved: true });
    expect(res.status).toBe(400);
  });

  it('工具名与待决请求不匹配时返回 404', async () => {
    const { app, authz } = buildApp();
    const { id, pending } = startPending(authz);

    const res = await post(app, 'other.tool', { authorizationId: id, approved: true });
    expect(res.status).toBe(404);

    // 不匹配的请求不应消耗掉待决授权
    const ok = await post(app, 'fs.write', { authorizationId: id, approved: true });
    expect(ok.status).toBe(200);
    await expect(pending).resolves.toMatchObject({ allowed: true });
  });
});
