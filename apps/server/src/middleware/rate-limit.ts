import type { Context, MiddlewareHandler, Next } from 'hono';

export interface RateLimitOptions {
  /** 滑动窗口长度（毫秒） */
  windowMs: number;
  /** 窗口内允许的最大请求数 */
  max: number;
  /** 过期记录清理间隔（毫秒），默认 60 秒 */
  cleanupIntervalMs?: number;
}

/**
 * 滑动窗口限流中间件。
 *
 * 按 IP 计数，用于限制高频写接口（如 `POST /api/sessions/:id/messages`）。
 *
 * 长期运行的进程不能让计数表无限增长，因此按固定周期清理已过期的 IP 记录；
 * 同时对单个 IP 的时间戳数组也做窗口裁剪。
 */
export function createRateLimit(opts: RateLimitOptions): MiddlewareHandler & {
  /** 当前记录的 IP 数量（供测试与诊断使用） */
  size(): number;
} {
  const hits = new Map<string, number[]>();
  const cleanupIntervalMs = opts.cleanupIntervalMs ?? 60_000;

  const cleanup = (): void => {
    const now = Date.now();
    for (const [ip, list] of hits) {
      const alive = list.filter((t) => now - t < opts.windowMs);
      if (alive.length === 0) hits.delete(ip);
      else hits.set(ip, alive);
    }
  };

  // 定时清理：unref 避免这个定时器拖住进程退出
  const timer = setInterval(cleanup, cleanupIntervalMs);
  if (typeof timer.unref === 'function') timer.unref();

  const middleware = async (c: Context, next: Next) => {
    const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
    const now = Date.now();
    const list = (hits.get(ip) ?? []).filter((t) => now - t < opts.windowMs);
    if (list.length >= opts.max) {
      hits.set(ip, list);
      const retryAfter = Math.max(1, Math.ceil(opts.windowMs / 1000));
      c.header('Retry-After', String(retryAfter));
      return c.json({ error: { code: 'RATE_LIMITED', message: '请求过于频繁' } }, 429);
    }
    list.push(now);
    hits.set(ip, list);
    await next();
  };

  return Object.assign(middleware, {
    size: () => hits.size,
  });
}
