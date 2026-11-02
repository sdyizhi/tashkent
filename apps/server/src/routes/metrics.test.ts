import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { createMetricsRegistry } from '../lib/metrics.js';
import { metricsRoutes } from './metrics.js';

function makeApp() {
  const registry = createMetricsRegistry();
  const app = new Hono();
  app.route('/', metricsRoutes(registry));
  return { app, registry };
}

describe('GET /api/metrics', () => {
  it('返回 Prometheus 文本格式', async () => {
    const { app } = makeApp();
    const res = await app.request('/api/metrics');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/plain');
    expect(res.headers.get('content-type')).toContain('version=0.0.4');
  });

  it('包含设计文档规定的五个指标名', async () => {
    const { app } = makeApp();
    const text = await (await app.request('/api/metrics')).text();
    expect(text).toContain('tashkent_runs_total');
    expect(text).toContain('tashkent_tool_calls_total');
    expect(text).toContain('tashkent_tool_duration_seconds');
    expect(text).toContain('tashkent_llm_tokens_total');
    expect(text).toContain('tashkent_active_sessions');
  });

  it('反映已记录的指标数据', async () => {
    const { app, registry } = makeApp();
    registry.runsTotal('ok');
    registry.toolCalls('fs.read', true);
    registry.toolDuration('fs.read', 1200);
    registry.llmTokens('input', 42);
    registry.activeSessions(2);

    const text = await (await app.request('/api/metrics')).text();
    expect(text).toContain('tashkent_runs_total{status="ok"} 1');
    expect(text).toContain('tashkent_tool_calls_total{tool="fs.read",ok="true"} 1');
    expect(text).toContain('tashkent_tool_duration_seconds{tool="fs.read"} 1.2');
    expect(text).toContain('tashkent_llm_tokens_total{direction="input"} 42');
    expect(text).toContain('tashkent_active_sessions 2');
  });

  it('不泄露任何凭据', async () => {
    const { app } = makeApp();
    const text = await (await app.request('/api/metrics')).text();
    expect(text).not.toContain('apiKey');
    expect(text).not.toContain('LLM_API_KEY');
  });
});
