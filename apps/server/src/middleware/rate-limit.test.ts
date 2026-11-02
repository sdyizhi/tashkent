import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { createRateLimit } from './rate-limit.js';

function makeApp(opts: { windowMs?: number; max?: number } = {}) {
  const app = new Hono();
  app.use(
    '/api/sessions/:id/messages',
    createRateLimit({ windowMs: opts.windowMs ?? 60000, max: opts.max ?? 3 }),
  );
  app.post('/api/sessions/:id/messages', (c) => c.json({ ok: true }));
  app.get('/api/health', (c) => c.json({ status: 'ok' }));
  return app;
}

describe('限流中间件', () => {
  it('未超过阈值时正常放行', async () => {
    const app = makeApp({ max: 3 });
    for (let i = 0; i < 3; i++) {
      const res = await app.request('/api/sessions/s1/messages', { method: 'POST' });
      expect(res.status).toBe(200);
    }
  });

  it('超过阈值后返回 429', async () => {
    const app = makeApp({ max: 3 });
    for (let i = 0; i < 3; i++) {
      await app.request('/api/sessions/s1/messages', { method: 'POST' });
    }
    const res = await app.request('/api/sessions/s1/messages', { method: 'POST' });
    expect(res.status).toBe(429);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('RATE_LIMITED');
  });

  it('未命中的路径不受限流影响', async () => {
    const app = makeApp({ max: 1 });
    for (let i = 0; i < 5; i++) {
      const res = await app.request('/api/health');
      expect(res.status).toBe(200);
    }
  });

  it('不同 IP 各自计数', async () => {
    const app = makeApp({ max: 1 });
    const a = await app.request('/api/sessions/s1/messages', {
      method: 'POST',
      headers: { 'x-forwarded-for': '1.1.1.1' },
    });
    expect(a.status).toBe(200);

    const b = await app.request('/api/sessions/s1/messages', {
      method: 'POST',
      headers: { 'x-forwarded-for': '2.2.2.2' },
    });
    expect(b.status).toBe(200);

    const aAgain = await app.request('/api/sessions/s1/messages', {
      method: 'POST',
      headers: { 'x-forwarded-for': '1.1.1.1' },
    });
    expect(aAgain.status).toBe(429);
  });

  it('x-forwarded-for 含多个 IP 时取第一个', async () => {
    const app = makeApp({ max: 1 });
    const first = await app.request('/api/sessions/s1/messages', {
      method: 'POST',
      headers: { 'x-forwarded-for': '3.3.3.3, 4.4.4.4' },
    });
    expect(first.status).toBe(200);
    const second = await app.request('/api/sessions/s1/messages', {
      method: 'POST',
      headers: { 'x-forwarded-for': '3.3.3.3, 4.4.4.4' },
    });
    expect(second.status).toBe(429);
  });

  it('窗口滑过后计数恢复', async () => {
    const app = makeApp({ max: 1, windowMs: 40 });
    const first = await app.request('/api/sessions/s1/messages', { method: 'POST' });
    expect(first.status).toBe(200);
    const blocked = await app.request('/api/sessions/s1/messages', { method: 'POST' });
    expect(blocked.status).toBe(429);

    await new Promise((r) => setTimeout(r, 60));
    const after = await app.request('/api/sessions/s1/messages', { method: 'POST' });
    expect(after.status).toBe(200);
  });

  it('定期清理过期记录，Map 不无限增长', async () => {
    const limiter = createRateLimit({ windowMs: 20, max: 5, cleanupIntervalMs: 10 });
    const app = new Hono();
    app.use('/api/sessions/:id/messages', limiter);
    app.post('/api/sessions/:id/messages', (c) => c.json({ ok: true }));

    for (let i = 0; i < 20; i++) {
      await app.request('/api/sessions/s1/messages', {
        method: 'POST',
        headers: { 'x-forwarded-for': `10.0.0.${i}` },
      });
    }
    expect(limiter.size()).toBeGreaterThan(0);

    // 等待窗口过期 + 清理周期触发
    await new Promise((r) => setTimeout(r, 120));
    expect(limiter.size()).toBe(0);
  });

  it('受限时返回 429 且带 Retry-After 提示', async () => {
    const app = makeApp({ max: 1 });
    await app.request('/api/sessions/s1/messages', { method: 'POST' });
    const res = await app.request('/api/sessions/s1/messages', { method: 'POST' });
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBeTruthy();
  });
});
