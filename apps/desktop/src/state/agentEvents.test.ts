import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentEvent } from '@tashkent/shared';
import { AgentEventStream } from './agentEvents.js';

class FakeEventSource {
  static instances: FakeEventSource[] = [];

  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  readonly listeners = new Map<string, Set<(ev: MessageEvent<string>) => void>>();

  constructor(readonly url: string) {
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, fn: (ev: MessageEvent<string>) => void): void {
    const set = this.listeners.get(type) ?? new Set();
    set.add(fn);
    this.listeners.set(type, set);
  }

  removeEventListener(type: string, fn: (ev: MessageEvent<string>) => void): void {
    this.listeners.get(type)?.delete(fn);
  }

  close(): void {
    this.closed = true;
  }

  emitOpen(): void {
    this.onopen?.();
  }

  emitError(): void {
    this.onerror?.();
  }

  emit(type: string, data: unknown): void {
    const ev = {
      type,
      data: typeof data === 'string' ? data : JSON.stringify(data),
    } as MessageEvent<string>;
    for (const fn of this.listeners.get(type) ?? []) fn(ev);
  }
}

describe('AgentEventStream', () => {
  beforeEach(() => {
    FakeEventSource.instances = [];
    vi.stubGlobal('EventSource', FakeEventSource);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('连接 /api/events 全局流', () => {
    const stream = new AgentEventStream();
    stream.connect();
    expect(FakeEventSource.instances).toHaveLength(1);
    expect(FakeEventSource.instances[0]!.url).toBe('/api/events');
  });

  it('重复 connect 不会创建第二条连接', () => {
    const stream = new AgentEventStream();
    stream.connect();
    stream.connect();
    expect(FakeEventSource.instances).toHaveLength(1);
  });

  it('把 agent-event 的 JSON 载荷解析后派发给订阅者', () => {
    const stream = new AgentEventStream();
    const received: AgentEvent[] = [];
    stream.subscribe((e) => received.push(e));
    stream.connect();

    const event: AgentEvent = { type: 'text_delta', sessionId: 's1', text: '你好' };
    FakeEventSource.instances[0]!.emit('agent-event', event);

    expect(received).toEqual([event]);
  });

  it('忽略非法 JSON 载荷', () => {
    const stream = new AgentEventStream();
    const received: AgentEvent[] = [];
    stream.subscribe((e) => received.push(e));
    stream.connect();

    FakeEventSource.instances[0]!.emit('agent-event', '{不是 JSON');
    expect(received).toHaveLength(0);
  });

  it('连接状态变化时通知状态订阅者', () => {
    const stream = new AgentEventStream();
    const states: boolean[] = [];
    stream.subscribeConnection((c) => states.push(c));
    stream.connect();

    FakeEventSource.instances[0]!.emitOpen();
    expect(stream.isConnected).toBe(true);
    FakeEventSource.instances[0]!.emitError();
    expect(stream.isConnected).toBe(false);
    // 订阅时立刻收到一次当前状态（false），随后是连接与断开
    expect(states).toEqual([false, true, false]);
  });

  it('取消订阅后不再收到事件', () => {
    const stream = new AgentEventStream();
    const received: AgentEvent[] = [];
    const off = stream.subscribe((e) => received.push(e));
    stream.connect();

    off();
    FakeEventSource.instances[0]!.emit('agent-event', {
      type: 'text_delta',
      sessionId: 's1',
      text: 'x',
    });
    expect(received).toHaveLength(0);
  });

  it('连接建立后新订阅者立刻拿到当前连接状态', () => {
    const stream = new AgentEventStream();
    stream.connect();
    FakeEventSource.instances[0]!.emitOpen();

    const states: boolean[] = [];
    stream.subscribeConnection((c) => states.push(c));
    expect(states).toEqual([true]);
  });

  it('disconnect 关闭底层连接', () => {
    const stream = new AgentEventStream();
    stream.connect();
    stream.disconnect();
    expect(FakeEventSource.instances[0]!.closed).toBe(true);
  });

  it('单个订阅者抛错不影响其它订阅者', () => {
    const stream = new AgentEventStream();
    const received: AgentEvent[] = [];
    stream.subscribe(() => {
      throw new Error('boom');
    });
    stream.subscribe((e) => received.push(e));
    stream.connect();

    FakeEventSource.instances[0]!.emit('agent-event', {
      type: 'text_delta',
      sessionId: 's1',
      text: 'x',
    });
    expect(received).toHaveLength(1);
  });
});
