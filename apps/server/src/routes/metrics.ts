import { Hono } from 'hono';
import type { MetricsRegistry } from '../lib/metrics.js';

/**
 * Prometheus 指标端点。
 *
 * 设计文档 7.3：暴露关键指标，文本格式，零额外依赖。
 * 是否挂载由 `METRICS_ENABLED` 决定（见 app.ts）。
 */
export function metricsRoutes(registry: MetricsRegistry) {
  const app = new Hono();

  app.get('/api/metrics', (c) =>
    c.text(registry.render(), 200, {
      'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
    }),
  );

  return app;
}
