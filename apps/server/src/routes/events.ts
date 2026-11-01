import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import type { EventBus } from '../lib/event-bus.js';

const HEARTBEAT_MS = 15000;

export function eventRoutes(bus: EventBus) {
  const app = new Hono();

  app.get('/api/events', (c) => {
    // Hono 的 streamSSE 已自动设置 Content-Type: text/event-stream；
    // 以下三个头必须显式带上，否则 Nginx 等代理会缓冲 SSE
    c.header('Cache-Control', 'no-cache, no-transform');
    c.header('X-Accel-Buffering', 'no');
    c.header('Connection', 'keep-alive');

    // 浏览器 EventSource 重连时会带上 Last-Event-ID；
    // 缺省为 0 表示首次连接，此时补发缓冲区内的全部事件。
    const lastEventId = Number(c.req.header('last-event-id') ?? '0');
    return streamSSE(c, async (stream) => {
      for (const item of bus.replayAfter(Number.isFinite(lastEventId) ? lastEventId : 0)) {
        await stream.writeSSE({
          id: String(item.id),
          event: 'agent-event',
          data: JSON.stringify(item.event),
        });
      }

      let closed = false;
      const off = bus.subscribe((item) => {
        if (closed) return;
        void stream.writeSSE({
          id: String(item.id),
          event: 'agent-event',
          data: JSON.stringify(item.event),
        });
      });

      stream.onAbort(() => {
        closed = true;
        off();
      });

      // 心跳：防止中间层断开空闲连接
      while (!closed) {
        await new Promise<void>((resolve) => {
          // unref：客户端断开后不让挂起的定时器吊住进程
          setTimeout(resolve, HEARTBEAT_MS).unref();
        });
        if (closed) break;
        await stream.writeSSE({ data: ':heartbeat' });
      }
    });
  });

  return app;
}
