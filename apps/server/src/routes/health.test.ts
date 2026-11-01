import { describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import { createDatabase } from '../db/index.js';
import { SessionRepository } from '../db/repositories/sessions.js';
import { healthRoutes } from './health.js';
import { createLlmHealthProbe, type LlmProbe } from '../lib/llm-health.js';

function buildApp(llmOk: boolean) {
  const db = createDatabase(':memory:');
  const sessions = new SessionRepository(db);
  sessions.create({ id: 's1', agentId: 'chat' });
  const app = new Hono();
  app.route('/', healthRoutes({ db, sessions, checkLlm: async () => llmOk }));
  return app;
}

describe('GET /api/health', () => {
  it('LLM 可用时返回 status=ok', async () => {
    const res = await buildApp(true).request('/api/health');
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.status).toBe('ok');
    expect(body.db.ok).toBe(true);
    expect(body.db.sessions).toBe(1);
  });

  it('LLM 不可用时降级为 degraded 但仍是 200', async () => {
    const res = await buildApp(false).request('/api/health');
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.status).toBe('degraded');
  });

  it('探测抛错时降级为 degraded 且不向外抛出', async () => {
    const db = createDatabase(':memory:');
    const sessions = new SessionRepository(db);
    const app = new Hono();
    app.route(
      '/',
      healthRoutes({
        db,
        sessions,
        checkLlm: async () => {
          throw new Error('network down');
        },
      }),
    );

    const res = await app.request('/api/health');
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.status).toBe('degraded');
    expect(body.llm.ok).toBe(false);
  });
});

describe('createLlmHealthProbe', () => {
  it('没有 apiKey 时直接判定不可用，不发请求', async () => {
    const probe = vi.fn<() => Promise<unknown>>();
    const check = createLlmHealthProbe({ apiKey: '', probe: probe as unknown as LlmProbe });

    const result = await check();
    expect(result.ok).toBe(false);
    expect(probe).not.toHaveBeenCalled();
  });

  it('探测成功时返回 ok 与延迟', async () => {
    const probe = vi.fn(async () => ({ ok: true }));
    const check = createLlmHealthProbe({ apiKey: 'sk-test', probe: probe as unknown as LlmProbe });

    const result = await check();
    expect(result.ok).toBe(true);
    expect(typeof result.latencyMs).toBe('number');
    expect(probe).toHaveBeenCalledTimes(1);
  });

  it('探测失败时返回 ok=false 且不抛出', async () => {
    const probe = vi.fn(async () => {
      throw new Error('连接失败');
    });
    const check = createLlmHealthProbe({ apiKey: 'sk-test', probe: probe as unknown as LlmProbe });

    const result = await check();
    expect(result.ok).toBe(false);
  });

  it('探测超时按失败处理且不拖慢响应', async () => {
    const probe = vi.fn(
      () =>
        new Promise<{ ok: boolean }>((resolve) => {
          setTimeout(() => resolve({ ok: true }), 5000);
        }),
    );
    const check = createLlmHealthProbe({
      apiKey: 'sk-test',
      probe: probe as unknown as LlmProbe,
      timeoutMs: 50,
    });

    const started = Date.now();
    const result = await check();
    const elapsed = Date.now() - started;

    expect(result.ok).toBe(false);
    expect(elapsed).toBeLessThan(1000);
  });

  it('探测结果被缓存，短时间内不重复请求', async () => {
    const probe = vi.fn(async () => ({ ok: true }));
    const check = createLlmHealthProbe({
      apiKey: 'sk-test',
      probe: probe as unknown as LlmProbe,
      cacheMs: 30000,
    });

    await check();
    await check();
    await check();
    expect(probe).toHaveBeenCalledTimes(1);
  });

  it('缓存过期后重新探测', async () => {
    const probe = vi.fn(async () => ({ ok: true }));
    const check = createLlmHealthProbe({
      apiKey: 'sk-test',
      probe: probe as unknown as LlmProbe,
      cacheMs: 0,
    });

    await check();
    await check();
    expect(probe).toHaveBeenCalledTimes(2);
  });

  it('缓存过期的失败结果也会重新探测', async () => {
    let calls = 0;
    const probe = vi.fn(async () => {
      calls += 1;
      if (calls === 1) throw new Error('暂时失败');
      return { ok: true };
    });
    const check = createLlmHealthProbe({
      apiKey: 'sk-test',
      probe: probe as unknown as LlmProbe,
      cacheMs: 0,
    });

    expect((await check()).ok).toBe(false);
    expect((await check()).ok).toBe(true);
  });
});

describe('健康检查与 LLM 探测联动', () => {
  it('无 apiKey 时健康检查返回 degraded', async () => {
    const db = createDatabase(':memory:');
    const sessions = new SessionRepository(db);
    const app = new Hono();
    app.route(
      '/',
      healthRoutes({
        db,
        sessions,
        checkLlm: createLlmHealthProbe({ apiKey: '', probe: async () => ({ ok: true }) }),
      }),
    );

    const res = await app.request('/api/health');
    const body = (await res.json()) as any;
    expect(body.status).toBe('degraded');
    expect(body.llm.ok).toBe(false);
  });

  it('有 apiKey 且探测成功时健康检查返回 ok', async () => {
    const db = createDatabase(':memory:');
    const sessions = new SessionRepository(db);
    const app = new Hono();
    app.route(
      '/',
      healthRoutes({
        db,
        sessions,
        checkLlm: createLlmHealthProbe({ apiKey: 'sk-test', probe: async () => ({ ok: true }) }),
      }),
    );

    const res = await app.request('/api/health');
    const body = (await res.json()) as any;
    expect(body.status).toBe('ok');
    expect(body.llm.ok).toBe(true);
  });

  it('有 apiKey 但探测抛错时健康检查返回 degraded', async () => {
    const db = createDatabase(':memory:');
    const sessions = new SessionRepository(db);
    const app = new Hono();
    app.route(
      '/',
      healthRoutes({
        db,
        sessions,
        checkLlm: createLlmHealthProbe({
          apiKey: 'sk-test',
          probe: async () => {
            throw new Error('鉴权失败');
          },
        }),
      }),
    );

    const res = await app.request('/api/health');
    const body = (await res.json()) as any;
    expect(body.status).toBe('degraded');
    expect(body.llm.ok).toBe(false);
  });
});
