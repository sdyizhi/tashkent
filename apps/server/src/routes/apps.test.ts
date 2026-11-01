import { describe, expect, it } from 'vitest';
import { APP_REGISTRY } from '@tashkent/shared';
import { Hono } from 'hono';
import { appRoutes } from './apps.js';

describe('GET /api/apps', () => {
  it('返回全部七个应用', async () => {
    const app = new Hono();
    app.route('/', appRoutes());
    const res = await app.request('/api/apps');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { apps: unknown[] };
    expect(body.apps.length).toBe(7);
  });

  it('每个应用都有唯一 appId 且绑定了存在的 agentId', async () => {
    const ids = APP_REGISTRY.map((a) => a.appId);
    expect(new Set(ids).size).toBe(ids.length);
    for (const a of APP_REGISTRY) {
      expect(a.agentId).toBeTruthy();
      expect(a.title).toBeTruthy();
      expect(a.width).toBeGreaterThan(0);
    }
  });

  it('按 appId 查单个应用，查不到返回 404', async () => {
    const app = new Hono();
    app.route('/', appRoutes());
    const ok = await app.request('/api/apps/notes');
    expect(ok.status).toBe(200);
    const miss = await app.request('/api/apps/ghost');
    expect(miss.status).toBe(404);
  });
});
