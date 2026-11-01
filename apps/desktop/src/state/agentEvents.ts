import type { AgentEvent } from '@tashkent/shared';

/** 事件回调：第二个参数是 SSE 事件 id，用于区分「断线补发的历史事件」与「刚发生的事件」 */
export type AgentEventListener = (event: AgentEvent, id: number) => void;

/** SSE 事件源的可替换接口，便于测试与复用 */
export interface AgentEventSource {
  connect(): void;
  disconnect(): void;
  subscribe(fn: AgentEventListener): () => void;
  subscribeConnection(fn: (connected: boolean) => void): () => void;
  readonly isConnected: boolean;
}

const EVENTS_URL = '/api/events';
const EVENT_NAME = 'agent-event';

/**
 * 消费全局 SSE 事件流（/api/events）。
 *
 * 桌面上的事件（窗口打开、通知、文件创建）可能来自任意会话，
 * 因此整个桌面只维护一条 EventSource。
 */
export class AgentEventStream implements AgentEventSource {
  private es: EventSource | null = null;
  private readonly subscribers = new Set<AgentEventListener>();
  private readonly connectionSubscribers = new Set<(connected: boolean) => void>();
  private connected = false;

  get isConnected(): boolean {
    return this.connected;
  }

  connect(): void {
    if (this.es) return;

    const es = new EventSource(EVENTS_URL);
    this.es = es;

    es.onopen = () => this.setConnected(true);
    es.onerror = () => this.setConnected(false);

    es.addEventListener(EVENT_NAME, (ev) => {
      let event: AgentEvent;
      try {
        event = JSON.parse((ev as MessageEvent<string>).data) as AgentEvent;
      } catch {
        return;
      }
      const id = Number((ev as MessageEvent<string>).lastEventId ?? '');
      const seq = Number.isFinite(id) ? id : 0;
      for (const fn of this.subscribers) {
        try {
          fn(event, seq);
        } catch {
          // 单个订阅者异常不影响其它订阅者
        }
      }
    });
  }

  disconnect(): void {
    this.es?.close();
    this.es = null;
    this.setConnected(false);
  }

  subscribe(fn: AgentEventListener): () => void {
    this.subscribers.add(fn);
    return () => {
      this.subscribers.delete(fn);
    };
  }

  subscribeConnection(fn: (connected: boolean) => void): () => void {
    this.connectionSubscribers.add(fn);
    // 立即同步当前连接状态：订阅者可能在连接建立之后才挂载，
    // 否则会永远停在「未连接」。
    fn(this.connected);
    return () => {
      this.connectionSubscribers.delete(fn);
    };
  }

  private setConnected(connected: boolean): void {
    if (this.connected === connected) return;
    this.connected = connected;
    for (const fn of this.connectionSubscribers) {
      try {
        fn(connected);
      } catch {
        // 忽略订阅者异常
      }
    }
  }
}

/** 全局共享的事件流实例：整个桌面只开一条 SSE 连接 */
export const agentEventStream = new AgentEventStream();
