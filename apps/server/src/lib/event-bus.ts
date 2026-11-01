import type { AgentEvent } from '@tashkent/shared';

export interface BusEvent {
  id: number;
  event: AgentEvent;
}

export type Subscriber = (e: BusEvent) => void;

export class EventBus {
  private subscribers = new Set<Subscriber>();
  private buffer: BusEvent[] = [];
  private counter = 0;
  private readonly capacity: number;

  constructor(capacity = 500) {
    this.capacity = capacity;
  }

  subscribe(fn: Subscriber): () => void {
    this.subscribers.add(fn);
    return () => {
      this.subscribers.delete(fn);
    };
  }

  publish(event: AgentEvent): void {
    this.counter += 1;
    const item: BusEvent = { id: this.counter, event };
    this.buffer.push(item);
    if (this.buffer.length > this.capacity) this.buffer.shift();
    for (const fn of this.subscribers) {
      try {
        fn(item);
      } catch {
        // 单个订阅者异常不影响其他订阅者
      }
    }
  }

  /** 返回 id 大于 afterId 的历史事件，用于 SSE 断线补发 */
  replayAfter(afterId: number): BusEvent[] {
    return this.buffer.filter((b) => b.id > afterId);
  }

  get lastId(): number {
    return this.counter;
  }
}

export const eventBus = new EventBus();
