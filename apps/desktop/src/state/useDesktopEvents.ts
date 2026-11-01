import { useEffect, useState } from 'react';
import type { AgentEvent, WindowsResponse } from '@tashkent/shared';
import { agentEventStream, type AgentEventSource } from './agentEvents.js';
import { useDesktopStore } from './desktopStore.js';
import { useAuthorizationStore } from './authorizationStore.js';

export interface DesktopNotification {
  id: string;
  message: string;
  icon: string;
}

const NOTIFICATION_TTL_MS = 5000;

export interface UseDesktopEventsResult {
  notifications: DesktopNotification[];
  dismissNotification: (id: string) => void;
}

let notificationSeq = 0;

/**
 * 把全局 SSE 事件流桥接到桌面状态。
 *
 * 服务端是窗口状态的权威源（ADR-004）：
 *  - 窗口的新增 / 更新 / 关闭都以服务端广播的事件为准，前端只做回写；
 *  - 启动时先从 GET /api/desktop/windows 取权威快照，再叠加快照之后到达的事件，
 *    避免只靠事件重建状态时漏掉「连接之前已存在」的窗口。
 */
export function useDesktopEvents(
  options: { source?: AgentEventSource } = {},
): UseDesktopEventsResult {
  const [notifications, setNotifications] = useState<DesktopNotification[]>([]);
  const source = options.source ?? agentEventStream;

  useEffect(() => {
    // 快照就绪前先缓存事件，避免快照覆盖掉刚到达的变更
    let hydrated = false;
    const pending: Array<{ event: AgentEvent; id: number }> = [];
    /** 已经处理过的最大事件 id，用于丢弃断线重连后补发的历史事件 */
    let lastSeenId = 0;

    const push = (message: string, icon: string) => {
      notificationSeq += 1;
      const id = `n_${notificationSeq}`;
      setNotifications((list) => [...list, { id, message, icon }]);
      setTimeout(() => {
        setNotifications((list) => list.filter((n) => n.id !== id));
      }, NOTIFICATION_TTL_MS);
    };

    const apply = (event: AgentEvent) => {
      switch (event.type) {
        case 'desktop_window_opened':
          useDesktopStore.getState().upsertRemoteWindow(event.window);
          break;
        case 'desktop_window_updated':
          useDesktopStore.getState().patchRemoteWindow(event.windowId, event.patch);
          break;
        case 'desktop_window_closed':
          useDesktopStore.getState().removeRemoteWindow(event.windowId);
          break;
        case 'desktop_notify':
          push(event.message, event.icon ?? '💬');
          break;
        case 'desktop_file_created':
          push(`已创建文件 ${event.name}`, '📄');
          break;
        case 'authorization_required':
          useAuthorizationStore.getState().setRequest(event);
          break;
        default:
          break;
      }
    };

    const handle = (event: AgentEvent, id: number) => {
      // 事件 id 不大于已处理的最大 id，说明是断线重连后补发的历史事件，丢弃
      if (id > 0) {
        if (id <= lastSeenId) return;
        lastSeenId = id;
      }
      if (hydrated) apply(event);
      else pending.push({ event, id });
    };

    source.connect();
    const off = source.subscribe(handle);

    void (async () => {
      try {
        const res = await fetch('/api/desktop/windows');
        if (res.ok) {
          const body = (await res.json()) as WindowsResponse;
          useDesktopStore.getState().applyRemoteWindows(body.windows);
        }
      } catch {
        // 服务端不可达时保持空桌面，窗口由 Agent 事件创建
      }
      hydrated = true;
      for (const item of pending) apply(item.event);
      pending.length = 0;
    })();

    return () => {
      off();
    };
  }, [source]);

  return {
    notifications,
    dismissNotification: (id: string) =>
      setNotifications((list) => list.filter((n) => n.id !== id)),
  };
}
