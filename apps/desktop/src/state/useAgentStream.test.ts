import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { AgentEvent } from '@tashkent/shared';
import type { AgentEventSource } from './agentEvents.js';
import { applyAgentEvent, useAgentStream, type StreamState } from './useAgentStream.js';

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

class FakeSource implements AgentEventSource {
  private readonly listeners = new Set<(e: AgentEvent, id: number) => void>();
  private readonly connectionListeners = new Set<(c: boolean) => void>();
  connected = false;
  private seq = 0;

  connect(): void {}
  disconnect(): void {}

  subscribe(fn: (e: AgentEvent, id: number) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  subscribeConnection(fn: (c: boolean) => void): () => void {
    this.connectionListeners.add(fn);
    fn(this.connected);
    return () => this.connectionListeners.delete(fn);
  }

  get isConnected(): boolean {
    return this.connected;
  }

  setConnected(v: boolean): void {
    this.connected = v;
    for (const fn of this.connectionListeners) fn(v);
  }

  emit(event: AgentEvent): void {
    this.seq += 1;
    for (const fn of this.listeners) fn(event, this.seq);
  }
}

interface Rendered {
  state: () => StreamState;
  unmount: () => void;
}

function renderHook(sessionId: string | null, source: AgentEventSource): Rendered {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  let latest: StreamState | null = null;

  function Probe() {
    latest = useAgentStream(sessionId, { source });
    return null;
  }

  act(() => {
    root.render(createElement(Probe));
  });

  return {
    state: () => latest!,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe('applyAgentEvent', () => {
  const base: StreamState = {
    connected: false,
    text: '',
    toolActivity: [],
    error: null,
    running: false,
  };

  it('text_delta 累加文本', () => {
    let s = applyAgentEvent(base, { type: 'text_delta', sessionId: 's1', text: '你' });
    s = applyAgentEvent(s, { type: 'text_delta', sessionId: 's1', text: '好' });
    expect(s.text).toBe('你好');
  });

  it('tool_start 追加运行中的工具活动', () => {
    const s = applyAgentEvent(base, {
      type: 'tool_start',
      sessionId: 's1',
      toolCallId: 'c1',
      toolName: 'fs.write',
      args: {},
    });
    expect(s.toolActivity).toEqual([
      { toolCallId: 'c1', toolName: 'fs.write', status: 'running' },
    ]);
  });

  it('tool_end 把对应工具标记为成功并带上摘要', () => {
    let s = applyAgentEvent(base, {
      type: 'tool_start',
      sessionId: 's1',
      toolCallId: 'c1',
      toolName: 'fs.write',
      args: {},
    });
    s = applyAgentEvent(s, {
      type: 'tool_end',
      sessionId: 's1',
      toolCallId: 'c1',
      ok: true,
      summary: '已写入',
    });
    expect(s.toolActivity[0]?.status).toBe('ok');
    expect(s.toolActivity[0]?.summary).toBe('已写入');
  });

  it('tool_end 失败时标记为 failed 并展示错误', () => {
    let s = applyAgentEvent(base, {
      type: 'tool_start',
      sessionId: 's1',
      toolCallId: 'c1',
      toolName: 'fs.write',
      args: {},
    });
    s = applyAgentEvent(s, {
      type: 'tool_end',
      sessionId: 's1',
      toolCallId: 'c1',
      ok: false,
      error: '权限不足',
    });
    expect(s.toolActivity[0]?.status).toBe('failed');
    expect(s.toolActivity[0]?.summary).toBe('权限不足');
  });

  it('tool_end 按 toolCallId 配对，同名工具并发时不会张冠李戴', () => {
    let s = applyAgentEvent(base, {
      type: 'tool_start',
      sessionId: 's1',
      toolCallId: 'c1',
      toolName: 'fs.write',
      args: {},
    });
    s = applyAgentEvent(s, {
      type: 'tool_start',
      sessionId: 's1',
      toolCallId: 'c2',
      toolName: 'fs.write',
      args: {},
    });
    s = applyAgentEvent(s, {
      type: 'tool_end',
      sessionId: 's1',
      toolCallId: 'c2',
      ok: true,
      summary: '第二次写入',
    });

    expect(s.toolActivity[0]?.status).toBe('running');
    expect(s.toolActivity[1]?.status).toBe('ok');
    expect(s.toolActivity[1]?.summary).toBe('第二次写入');
  });

  it('run_started 重置上一轮的文本与工具活动', () => {
    let s = applyAgentEvent(base, { type: 'text_delta', sessionId: 's1', text: '旧' });
    s = applyAgentEvent(s, {
      type: 'tool_start',
      sessionId: 's1',
      toolCallId: 'c1',
      toolName: 'calc.eval',
      args: {},
    });
    s = applyAgentEvent(s, { type: 'run_started', sessionId: 's1', agentId: 'chat' });
    expect(s.text).toBe('');
    expect(s.toolActivity).toEqual([]);
    expect(s.running).toBe(true);
  });

  it('run_error 记录错误信息并结束运行', () => {
    const s = applyAgentEvent(base, { type: 'run_error', sessionId: 's1', message: '炸了' });
    expect(s.error).toBe('炸了');
    expect(s.running).toBe(false);
  });

  it('run_finished 清除错误并结束运行', () => {
    let s = applyAgentEvent(base, { type: 'run_error', sessionId: 's1', message: '炸了' });
    s = applyAgentEvent(s, { type: 'run_finished', sessionId: 's1', reason: 'stop' });
    expect(s.error).toBeNull();
    expect(s.running).toBe(false);
  });
});

describe('useAgentStream', () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = undefined;
  });

  it('只接收当前会话的事件', () => {
    const source = new FakeSource();
    const view = renderHook('s1', source);

    act(() => {
      source.emit({ type: 'text_delta', sessionId: 's2', text: '别的会话' });
    });
    expect(view.state().text).toBe('');

    act(() => {
      source.emit({ type: 'text_delta', sessionId: 's1', text: '本会话' });
    });
    expect(view.state().text).toBe('本会话');

    view.unmount();
  });

  it('sessionId 为 null 时接收所有会话的事件', () => {
    const source = new FakeSource();
    const view = renderHook(null, source);

    act(() => {
      source.emit({ type: 'text_delta', sessionId: 'any', text: '全局' });
    });
    expect(view.state().text).toBe('全局');

    view.unmount();
  });

  it('连接状态变化时同步到 state', () => {
    const source = new FakeSource();
    const view = renderHook('s1', source);

    act(() => source.setConnected(true));
    expect(view.state().connected).toBe(true);

    act(() => source.setConnected(false));
    expect(view.state().connected).toBe(false);

    view.unmount();
  });

  it('卸载后不再接收事件', () => {
    const source = new FakeSource();
    const view = renderHook('s1', source);
    view.unmount();

    act(() => {
      source.emit({ type: 'text_delta', sessionId: 's1', text: '迟到的文本' });
    });
    expect(view.state().text).toBe('');
  });
});
