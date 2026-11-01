import { beforeEach, describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import type { AgentEvent } from '@tashkent/shared';
import { WindowService } from '../services/window-service.js';
import { DESKTOP_SESSION_ID, desktopRoutes } from './desktop.js';

let svc: WindowService;
let events: AgentEvent[];
let app: Hono;

beforeEach(() => {
  svc = new WindowService({
    apps: [{ appId: 'chat', title: '对话', icon: '💬' }],
    defaultWidth: 640,
    defaultHeight: 480,
  });
  events = [];
  app = new Hono();
  app.route('/', desktopRoutes(svc, (e) => events.push(e)));
});

describe('GET /api/desktop/windows', () => {
  it('返回当前窗口列表', async () => {
    svc.open('chat');
    const res = await app.request('/api/desktop/windows');
    const body = (await res.json()) as { windows: Array<{ appId: string }> };
    expect(body.windows).toHaveLength(1);
    expect(body.windows[0]?.appId).toBe('chat');
  });
});

describe('POST /api/desktop/windows', () => {
  it('打开窗口并广播 desktop_window_opened 事件', async () => {
    const res = await app.request('/api/desktop/windows', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ appId: 'chat' }),
    });
    expect(res.status).toBe(201);

    expect(events).toHaveLength(1);
    const ev = events[0]!;
    expect(ev.type).toBe('desktop_window_opened');
    expect(ev.sessionId).toBe(DESKTOP_SESSION_ID);
    if (ev.type !== 'desktop_window_opened') throw new Error('unreachable');
    expect(ev.window.appId).toBe('chat');
    expect(ev.window.id).toBeTruthy();
  });

  it('缺少 appId 返回 400 且不广播', async () => {
    const res = await app.request('/api/desktop/windows', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    expect(events).toHaveLength(0);
  });
});

describe('PATCH /api/desktop/windows/:id', () => {
  it('更新几何信息并广播 desktop_window_updated 事件', async () => {
    const win = svc.open('chat');
    const res = await app.request(`/api/desktop/windows/${win.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ x: 300, y: 200 }),
    });
    expect(res.status).toBe(200);

    expect(events).toHaveLength(1);
    const ev = events[0]!;
    expect(ev.type).toBe('desktop_window_updated');
    if (ev.type !== 'desktop_window_updated') throw new Error('unreachable');
    expect(ev.windowId).toBe(win.id);
    expect(ev.patch).toEqual({ x: 300, y: 200 });
  });

  it('更新不存在的窗口返回 404 且不广播', async () => {
    const res = await app.request('/api/desktop/windows/ghost', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ x: 1 }),
    });
    expect(res.status).toBe(404);
    expect(events).toHaveLength(0);
  });
});

describe('DELETE /api/desktop/windows/:id', () => {
  it('关闭窗口并广播 desktop_window_closed 事件', async () => {
    const win = svc.open('chat');
    const res = await app.request(`/api/desktop/windows/${win.id}`, { method: 'DELETE' });
    expect(res.status).toBe(200);

    expect(events).toHaveLength(1);
    const ev = events[0]!;
    expect(ev.type).toBe('desktop_window_closed');
    if (ev.type !== 'desktop_window_closed') throw new Error('unreachable');
    expect(ev.windowId).toBe(win.id);
  });

  it('关闭不存在的窗口返回 404 且不广播', async () => {
    const res = await app.request('/api/desktop/windows/ghost', { method: 'DELETE' });
    expect(res.status).toBe(404);
    expect(events).toHaveLength(0);
  });
});
