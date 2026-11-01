import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { EventBus } from '../lib/event-bus.js';
import { eventRoutes } from './events.js';

describe('GET /api/events (SSE)', () => {
  it('返回 text/event-stream 且包含已发生的事件', async () => {
    const bus = new EventBus();
    bus.publish({ type: 'desktop_notify', sessionId: 's1', message: 'hi' });

    const app = new Hono();
    app.route('/', eventRoutes(bus));

    const res = await app.request('/api/events');
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    expect(res.headers.get('cache-control')).toContain('no-cache');
    expect(res.headers.get('x-accel-buffering')).toBe('no');

    const reader = res.body!.getReader();
    const chunk = await reader.read();
    const text = new TextDecoder().decode(chunk.value);
    expect(text).toContain('desktop_notify');
    await reader.cancel();
  });
});
