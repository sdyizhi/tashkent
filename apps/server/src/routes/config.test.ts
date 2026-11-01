import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { configRoutes } from './config.js';

describe('GET /api/config', () => {
  it('返回非敏感的运行时配置', async () => {
    const app = new Hono();
    app.route('/', configRoutes());
    const res = await app.request('/api/config');
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.model).toBeTruthy();
    expect(typeof body.shellEnabled).toBe('boolean');
    expect(Array.isArray(body.shellAllowed)).toBe(true);
  });

  it('不泄露 apiKey 等凭据', async () => {
    const app = new Hono();
    app.route('/', configRoutes());
    const res = await app.request('/api/config');
    const raw = await res.text();
    expect(raw).not.toContain('apiKey');
    expect(raw).not.toContain('LLM_API_KEY');
    expect(raw).not.toContain('baseUrl');
  });
});
