import { describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { createRuntime } from './runtime.js';
import { createDatabase } from './db/index.js';
import { loadConfig } from './lib/config.js';

function makeConfig(overrides: Record<string, string> = {}) {
  return loadConfig({ DB_FILE: ':memory:', ...overrides });
}

function makeAppWith(overrides: Record<string, string> = {}) {
  const config = makeConfig(overrides);
  const db = createDatabase(':memory:');
  const rt = createRuntime({ db, config });
  return { app: createApp(rt, config), rt, db };
}

describe('应用装配：口令保护', () => {
  it('未设置 AUTH_PASSWORD 时接口保持开放', async () => {
    const { app } = makeAppWith();
    const res = await app.request('/api/agents');
    expect(res.status).toBe(200);
  });

  it('设置 AUTH_PASSWORD 后受保护接口返回 401', async () => {
    const { app } = makeAppWith({ AUTH_PASSWORD: 'test123' });
    const res = await app.request('/api/agents');
    expect(res.status).toBe(401);
  });

  it('设置 AUTH_PASSWORD 后健康检查仍可访问', async () => {
    const { app } = makeAppWith({ AUTH_PASSWORD: 'test123' });
    const res = await app.request('/api/health');
    expect(res.status).toBe(200);
  });

  it('登录成功后的 Cookie 可访问受保护接口', async () => {
    const { app } = makeAppWith({ AUTH_PASSWORD: 'test123' });
    const login = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'test123' }),
    });
    expect(login.status).toBe(200);
    const cookie = login.headers.get('set-cookie')!.split(';')[0]!;
    const res = await app.request('/api/agents', { headers: { cookie } });
    expect(res.status).toBe(200);
  });

  it('登录失败返回 401', async () => {
    const { app } = makeAppWith({ AUTH_PASSWORD: 'test123' });
    const res = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'nope' }),
    });
    expect(res.status).toBe(401);
  });

  it('/api/config 需要鉴权（前端靠它的 401 判断要弹登录框），且不泄露凭据', async () => {
    const { app } = makeAppWith({ AUTH_PASSWORD: 'test123', LLM_API_KEY: 'super-secret' });
    const res = await app.request('/api/config');
    expect(res.status).toBe(401);
  });

  it('/api/config 在未启用口令时公开，且不含凭据', async () => {
    const { app } = makeAppWith({ LLM_API_KEY: 'super-secret' });
    const res = await app.request('/api/config');
    expect(res.status).toBe(200);
    expect(await res.text()).not.toContain('super-secret');
  });

  it('登录后 /api/config 可访问且不含凭据', async () => {
    const { app } = makeAppWith({ AUTH_PASSWORD: 'test123', LLM_API_KEY: 'super-secret' });
    const login = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'test123' }),
    });
    const cookie = login.headers.get('set-cookie')!.split(';')[0]!;
    const res = await app.request('/api/config', { headers: { cookie } });
    expect(res.status).toBe(200);
    expect(await res.text()).not.toContain('super-secret');
  });
});

describe('应用装配：限流', () => {
  it('高频写接口超过阈值后返回 429', async () => {
    const { app } = makeAppWith({ RATE_LIMIT_MAX: '2' });
    const session = await (
      await app.request('/api/sessions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ agentId: 'chat' }),
      })
    ).json();
    const id = (session as { id: string }).id;

    const send = () =>
      app.request(`/api/sessions/${id}/messages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: '你好' }),
      });

    expect((await send()).status).toBe(202);
    expect((await send()).status).toBe(202);
    expect((await send()).status).toBe(429);
  });

  it('其他接口不受限流影响', async () => {
    const { app } = makeAppWith({ RATE_LIMIT_MAX: '1' });
    for (let i = 0; i < 5; i++) {
      expect((await app.request('/api/agents')).status).toBe(200);
    }
  });
});

describe('应用装配：指标端点', () => {
  it('METRICS_ENABLED 未开启时 /api/metrics 不存在', async () => {
    const { app } = makeAppWith();
    const res = await app.request('/api/metrics');
    expect(res.status).toBe(404);
  });

  it('METRICS_ENABLED=true 时返回 Prometheus 文本', async () => {
    const { app } = makeAppWith({ METRICS_ENABLED: 'true' });
    const res = await app.request('/api/metrics');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/plain');
    const text = await res.text();
    expect(text).toContain('tashkent_runs_total');
    expect(text).toContain('tashkent_tool_calls_total');
    expect(text).toContain('tashkent_tool_duration_seconds');
    expect(text).toContain('tashkent_llm_tokens_total');
    expect(text).toContain('tashkent_active_sessions');
  });
});
