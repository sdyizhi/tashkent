import { beforeEach, describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { createDatabase } from '../db/index.js';
import { DesktopStateRepository } from '../db/repositories/desktop-state.js';
import { desktopStateRoutes } from './desktop-state.js';

let app: Hono;
let repo: DesktopStateRepository;

beforeEach(() => {
  const db = createDatabase(':memory:');
  repo = new DesktopStateRepository(db);
  app = new Hono();
  app.route('/', desktopStateRoutes(repo));
});

describe('桌面状态读写', () => {
  it('未写入过的 key 返回 null', async () => {
    const res = await app.request('/api/desktop/state?key=icons');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { key: string; value: unknown };
    expect(body.key).toBe('icons');
    expect(body.value).toBeNull();
  });

  it('写入后可读回', async () => {
    const put = await app.request('/api/desktop/state', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ key: 'icons', value: [{ appId: 'chat', x: 1 }] }),
    });
    expect(put.status).toBe(200);
    expect(await put.json()).toEqual({ ok: true });

    const res = await app.request('/api/desktop/state?key=icons');
    const body = (await res.json()) as { value: Array<{ appId: string; x: number }> };
    expect(body.value[0]?.appId).toBe('chat');
    expect(body.value[0]?.x).toBe(1);
  });

  it('重复写入覆盖旧值', async () => {
    await app.request('/api/desktop/state', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ key: 'desktop', value: { icons: [1] } }),
    });
    await app.request('/api/desktop/state', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ key: 'desktop', value: { icons: [2, 3] } }),
    });

    const res = await app.request('/api/desktop/state?key=desktop');
    const body = (await res.json()) as { value: { icons: number[] } };
    expect(body.value.icons).toEqual([2, 3]);
  });

  it('GET 缺少 key 时返回 400', async () => {
    const res = await app.request('/api/desktop/state');
    expect(res.status).toBe(400);
  });

  it('PUT 缺少 key 时返回 400', async () => {
    const res = await app.request('/api/desktop/state', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ value: 1 }),
    });
    expect(res.status).toBe(400);
  });

  it('PUT 写入 null 值也能读回 null', async () => {
    await app.request('/api/desktop/state', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ key: 'k', value: null }),
    });
    const res = await app.request('/api/desktop/state?key=k');
    const body = (await res.json()) as { value: unknown };
    expect(body.value).toBeNull();
  });
});
