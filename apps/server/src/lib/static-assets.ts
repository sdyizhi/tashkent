import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Hono } from 'hono';
import { serveStatic } from '@hono/node-server/serve-static';

/**
 * apps/server/src/lib 与 apps/server/dist/lib 相对 apps/desktop/dist 的层级一致，
 * 因此同一段相对路径在开发态（tsx 跑 src）与生产态（node 跑 dist）都能命中。
 */
const DESKTOP_DIST_RELATIVE = path.join('..', '..', '..', 'desktop', 'dist');

/**
 * 解析前端构建产物目录；目录不存在时返回 undefined（此时不挂载静态托管）。
 */
export function resolveStaticRoot(): string | undefined {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const root = path.resolve(here, DESKTOP_DIST_RELATIVE);
  return fs.existsSync(root) ? root : undefined;
}

/**
 * 挂载前端静态托管。
 *
 * 必须在所有 /api 路由之后调用：Hono 按注册顺序匹配，
 * 因此 API 路由优先命中，未匹配的路径才落到静态资源与 notFound。
 */
export function registerStaticAssets(app: Hono, root: string | undefined = resolveStaticRoot()): void {
  if (!root) return;
  app.use('*', serveStatic({ root }));
}
