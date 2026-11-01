import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { registerStaticAssets, resolveStaticRoot } from './static-assets.js';

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tashkent-static-'));
fs.mkdirSync(path.join(tmpRoot, 'assets'), { recursive: true });
fs.writeFileSync(path.join(tmpRoot, 'index.html'), '<html>tashkent</html>');
fs.writeFileSync(path.join(tmpRoot, 'assets', 'app.js'), 'console.log(1)');

afterAll(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe('resolveStaticRoot', () => {
  it('解析到 apps/desktop/dist', () => {
    const root = resolveStaticRoot();
    expect(root).toBeDefined();
    expect(root?.replace(/\\/g, '/')).toContain('apps/desktop/dist');
  });
});

describe('registerStaticAssets', () => {
  it('root 不存在时不挂载任何中间件', async () => {
    const app = new Hono();
    app.get('/api/ping', (c) => c.json({ ok: true }));
    registerStaticAssets(app, undefined);

    const res = await app.request('/api/ping');
    expect(res.status).toBe(200);
  });

  it('命中静态文件', async () => {
    const app = new Hono();
    app.get('/api/ping', (c) => c.json({ ok: true }));
    registerStaticAssets(app, tmpRoot);

    const res = await app.request('/index.html');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('tashkent');
  });

  it('API 路由优先于静态文件', async () => {
    const app = new Hono();
    app.get('/api/ping', (c) => c.json({ ok: true }));
    registerStaticAssets(app, tmpRoot);

    const res = await app.request('/api/ping');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('静态文件不存在时交给 notFound 处理', async () => {
    const app = new Hono();
    app.notFound((c) => c.json({ error: { code: 'NOT_FOUND' } }, 404));
    registerStaticAssets(app, tmpRoot);

    const res = await app.request('/missing.html');
    expect(res.status).toBe(404);
  });
});
