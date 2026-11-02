import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { MiddlewareHandler } from 'hono';

export interface AuthOptions {
  /** 口令；为空字符串表示不启用口令保护（本地开发便利） */
  password: string;
  /** 会话 Cookie 的签名密钥 */
  cookieSecret: string;
  /** 免鉴权路径前缀 */
  publicPaths: string[];
  /** 会话有效期（毫秒），默认 7 天 */
  sessionTtlMs?: number;
  /**
   * 非 `/api/` 前缀的请求（前端静态产物）是否免鉴权，默认 true。
   * 前端产物必须能加载，否则用户连登录框都看不到。
   */
  allowStatic?: boolean;
}

/** 会话 Cookie 名 */
export const SESSION_COOKIE_NAME = 'tashkent_session';

/** 默认会话有效期：7 天 */
const DEFAULT_TTL_MS = 7 * 24 * 3600 * 1000;

/**
 * 口令保护中间件。
 *
 * 设计文档 12.2：`AUTH_PASSWORD` 设置后启用口令 + 会话 Cookie；未设置时保持开放，
 * 便于本地开发。
 *
 * 安全要点：
 * - 口令与 Cookie 签名都用 `timingSafeEqual` 比较，避免时序攻击；
 * - Cookie 带 `HttpOnly`（JS 不可读）与 `SameSite=Lax`；
 * - 会话有 TTL，过期即失效；
 * - 口令比较前先做长度短路，避免 `timingSafeEqual` 因长度不等抛错。
 */
export function createAuth(opts: AuthOptions): MiddlewareHandler {
  // 未设置口令 → 完全放行，行为与加固前一致
  if (!opts.password) return async (_c, next) => { await next(); };

  const ttlMs = opts.sessionTtlMs ?? DEFAULT_TTL_MS;
  const allowStatic = opts.allowStatic ?? true;
  const sessions = new Map<string, { expiresAt: number }>();

  const sign = (value: string): string =>
    createHmac('sha256', opts.cookieSecret).update(value).digest('base64url');

  const issue = (): string => {
    const id = randomUUID();
    sessions.set(id, { expiresAt: Date.now() + ttlMs });
    return `${id}.${sign(id)}`;
  };

  /** 定长比较：长度不等直接返回 false，等长时用 timingSafeEqual */
  const safeEqual = (a: string, b: string): boolean => {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
  };

  const verify = (raw: string | undefined): boolean => {
    if (!raw) return false;
    const idx = raw.lastIndexOf('.');
    if (idx < 0) return false;
    const id = raw.slice(0, idx);
    const sig = raw.slice(idx + 1);
    if (!safeEqual(sig, sign(id))) return false;
    const s = sessions.get(id);
    if (!s || s.expiresAt < Date.now()) return false;
    return true;
  };

  /** 从 Cookie 头里取出会话值 */
  const readCookie = (header: string | undefined): string | undefined => {
    if (!header) return undefined;
    for (const part of header.split(';')) {
      const eq = part.indexOf('=');
      if (eq < 0) continue;
      if (part.slice(0, eq).trim() === SESSION_COOKIE_NAME) {
        return part.slice(eq + 1).trim();
      }
    }
    return undefined;
  };

  return async (c, next) => {
    const path = c.req.path;
    const cookie = readCookie(c.req.header('cookie'));

    // 登录接口：口令正确才下发会话 Cookie。
    // 这里必须先于 publicPaths 判断——登录接口在白名单里，但它自身仍要做口令校验。
    if (path === '/api/auth/login') {
      if (verify(cookie)) {
        await next();
        return;
      }
      const body = (await c.req.json().catch(() => ({}))) as { password?: string };
      const given = typeof body?.password === 'string' ? body.password : '';
      if (!safeEqual(given, opts.password)) {
        return c.json({ error: { code: 'BAD_PASSWORD', message: '口令不正确' } }, 401);
      }
      c.header(
        'Set-Cookie',
        `${SESSION_COOKIE_NAME}=${issue()}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(ttlMs / 1000)}`,
      );
      return c.json({ ok: true });
    }

    // 免鉴权路径：健康检查、静态资源
    if (opts.publicPaths.some((p) => path.startsWith(p))) {
      await next();
      return;
    }

    // 前端静态产物（/、/assets/*）免鉴权：登录框本身要能加载出来
    if (allowStatic && !path.startsWith('/api/')) {
      await next();
      return;
    }

    if (verify(cookie)) {
      await next();
      return;
    }

    return c.json({ error: { code: 'UNAUTHORIZED', message: '需要口令' } }, 401);
  };
}
