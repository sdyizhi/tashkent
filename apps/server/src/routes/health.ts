import { Hono } from 'hono';
import type { HealthResponse } from '@tashkent/shared';
import type { DB } from '../db/index.js';
import type { SessionRepository } from '../db/repositories/sessions.js';
import { config } from '../lib/config.js';

export interface HealthDeps {
  db: DB;
  sessions: SessionRepository;
  /** 已加载的 Agent 数量（agent 定义在内存中，不落表） */
  agentCount?: number;
  /** 探测 LLM 可达性；实现由 provider 层注入。返回布尔值时按 { ok, latencyMs: null } 归一化 */
  checkLlm: () => Promise<{ ok: boolean; latencyMs: number | null } | boolean>;
}

export function healthRoutes(deps: HealthDeps) {
  const app = new Hono();

  app.get('/api/health', async (c) => {
    let llm: { ok: boolean; latencyMs: number | null } = { ok: false, latencyMs: null };
    try {
      const raw = await deps.checkLlm();
      llm = typeof raw === 'boolean' ? { ok: raw, latencyMs: null } : raw;
    } catch {
      llm = { ok: false, latencyMs: null };
    }

    let dbOk = true;
    let agentCount = 0;
    let sessionCount = 0;
    try {
      const row = deps.db.prepare('SELECT COUNT(*) AS n FROM sessions').get() as { n: number };
      sessionCount = row.n;
    } catch {
      dbOk = false;
    }
    // agent 数量由调用方注入（agent 定义在内存中，不落表），缺省为 0
    agentCount = deps.agentCount ?? 0;

    const body: HealthResponse = {
      status: llm.ok && dbOk ? 'ok' : 'degraded',
      version: config.version,
      db: { ok: dbOk, agents: agentCount, sessions: sessionCount },
      llm: { ok: llm.ok, model: config.model, latencyMs: llm.latencyMs },
    };
    return c.json(body);
  });

  return app;
}
