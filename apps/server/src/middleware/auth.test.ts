import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { createAuth, type AuthOptions } from './auth.js';

const PUBLIC = ['/api/health', '/api/auth/login', '/assets/'];

function makeApp(opts: Partial<AuthOptions> = {}) {
  const app = new Hono();
  app.use(
    '*',
    createAuth({
      password: 'test123',
      cookieSecret: 'secret-key',
      publicPaths: PUBLIC,
      ...opts,
    }),
  );
  app.get('/api/health', (c) => c.json({ status: 'ok' }));
  app.post('/api/auth/login', (c) => c.json({ ok: true }));
  app.get('/api/agents', (c) => c.json({ agents: [] }));
  app.get('/assets/app.js', (c) => c.text('js'));
  app.get('/api/config', (c) => c.json({ provider: 'openai' }));
  return app;
}

describe('口令保护中间件', () => {
  it('未设置口令时完全放行（本地开发便利）', async () => {
    const app = makeApp({ password: '' });
    const res = await app.request('/api/agents');
    expect(res.status).toBe(200);
  });

  it('未设置口令时不写任何会话 Cookie', async () => {
    const app = makeApp({ password: '' });
    const res = await app.request('/api/agents');
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('未登录访问受保护路径返回 401', async () => {
    const app = makeApp();
    const res = await app.request('/api/agents');
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('publicPaths 中的路径无需登录即可访问', async () => {
    const app = makeApp();
    expect((await app.request('/api/health')).status).toBe(200);
    expect((await app.request('/assets/app.js')).status).toBe(200);
  });

  it('登录接口本身是公开的（未带 Cookie 也能调用）', async () => {
    const app = makeApp();
    const res = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'test123' }),
    });
    expect(res.status).toBe(200);
  });

  it('口令正确时下发会话 Cookie 并返回 ok', async () => {
    const app = makeApp();
    const res = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'test123' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);

    const cookie = res.headers.get('set-cookie');
    expect(cookie).toBeTruthy();
    expect(cookie).toContain('tashkent_session=');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Path=/');
  });

  it('口令错误时返回 401 且不下发 Cookie', async () => {
    const app = makeApp();
    const res = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'wrong' }),
    });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('BAD_PASSWORD');
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('口令缺失时同样返回 401', async () => {
    const app = makeApp();
    const res = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(401);
  });

  it('带有效 Cookie 可访问受保护路径', async () => {
    const app = makeApp();
    const login = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'test123' }),
    });
    const cookie = login.headers.get('set-cookie')!.split(';')[0]!;
    const res = await app.request('/api/agents', { headers: { cookie } });
    expect(res.status).toBe(200);
  });

  it('Cookie 被篡改后访问被拒绝', async () => {
    const app = makeApp();
    const login = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'test123' }),
    });
    const raw = login.headers.get('set-cookie')!.split(';')[0]!;
    const [name, value] = raw.split('=');
    // 篡改签名部分
    const tampered = `${name}=${value!.slice(0, -4)}AAAA`;
    const res = await app.request('/api/agents', { headers: { cookie: tampered } });
    expect(res.status).toBe(401);
  });

  it('伪造的会话 id 无效', async () => {
    const app = makeApp();
    const res = await app.request('/api/agents', {
      headers: { cookie: 'tashkent_session=made-up-id.signature' },
    });
    expect(res.status).toBe(401);
  });

  it('格式非法的 Cookie 被拒绝', async () => {
    const app = makeApp();
    const res = await app.request('/api/agents', {
      headers: { cookie: 'tashkent_session=nosignature' },
    });
    expect(res.status).toBe(401);
  });

  it('不同 cookieSecret 签发的 Cookie 不可用（密钥隔离）', async () => {
    const appA = makeApp({ cookieSecret: 'secret-a' });
    const appB = makeApp({ cookieSecret: 'secret-b' });

    const login = await appA.request('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'test123' }),
    });
    const cookie = login.headers.get('set-cookie')!.split(';')[0]!;

    const res = await appB.request('/api/agents', { headers: { cookie } });
    expect(res.status).toBe(401);
  });

  it('会话过期后 Cookie 失效', async () => {
    const app = makeApp({ sessionTtlMs: 30 });
    const login = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'test123' }),
    });
    const cookie = login.headers.get('set-cookie')!.split(';')[0]!;
    expect((await app.request('/api/agents', { headers: { cookie } })).status).toBe(200);

    // 等待 TTL 过期
    await new Promise((r) => setTimeout(r, 60));
    const res = await app.request('/api/agents', { headers: { cookie } });
    expect(res.status).toBe(401);
  });

  it('Cookie 值里含其它 Cookie 时也能正确解析', async () => {
    const app = makeApp();
    const login = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'test123' }),
    });
    const raw = login.headers.get('set-cookie')!.split(';')[0]!;
    const res = await app.request('/api/agents', {
      headers: { cookie: `other=1; ${raw}; another=2` },
    });
    expect(res.status).toBe(200);
  });
});
