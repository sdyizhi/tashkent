import { describe, expect, it, vi } from 'vitest';
import { EventBus } from './event-bus.js';

describe('EventBus', () => {
  it('订阅者能收到广播的事件', () => {
    const bus = new EventBus();
    const seen: unknown[] = [];
    bus.subscribe((e) => seen.push(e));
    bus.publish({ type: 'desktop_notify', sessionId: 's1', message: 'hi' });
    expect(seen).toHaveLength(1);
  });

  it('多个订阅者都收到同一事件', () => {
    const bus = new EventBus();
    const a = vi.fn();
    const b = vi.fn();
    bus.subscribe(a);
    bus.subscribe(b);
    bus.publish({ type: 'desktop_notify', sessionId: 's1', message: 'hi' });
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('取消订阅后不再收到事件', () => {
    const bus = new EventBus();
    const spy = vi.fn();
    const off = bus.subscribe(spy);
    off();
    bus.publish({ type: 'desktop_notify', sessionId: 's1', message: 'hi' });
    expect(spy).not.toHaveBeenCalled();
  });

  it('环形缓冲保留最近事件并可按 id 补发', () => {
    const bus = new EventBus(3);
    bus.publish({ type: 'desktop_notify', sessionId: 's1', message: 'a' });
    bus.publish({ type: 'desktop_notify', sessionId: 's1', message: 'b' });
    bus.publish({ type: 'desktop_notify', sessionId: 's1', message: 'c' });
    bus.publish({ type: 'desktop_notify', sessionId: 's1', message: 'd' });
    const replayed = bus.replayAfter(1);
    expect(replayed.length).toBe(3);
    expect(replayed[0]?.id).toBe(2);
  });

  it('单个订阅者抛错不影响其他订阅者', () => {
    const bus = new EventBus();
    const good = vi.fn();
    bus.subscribe(() => {
      throw new Error('boom');
    });
    bus.subscribe(good);
    expect(() => bus.publish({ type: 'desktop_notify', sessionId: 's1', message: 'hi' })).not.toThrow();
    expect(good).toHaveBeenCalled();
  });
});
