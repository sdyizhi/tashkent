import { useEffect, useRef, useState } from 'react';
import type { AgentEvent } from '@tashkent/shared';
import { agentEventStream, type AgentEventSource } from './agentEvents.js';

export interface ToolActivity {
  toolCallId: string;
  toolName: string;
  status: 'running' | 'ok' | 'failed';
  summary?: string;
}

export interface StreamState {
  connected: boolean;
  text: string;
  toolActivity: ToolActivity[];
  error: string | null;
  /** 本轮运行是否在进行中 */
  running: boolean;
}

export const INITIAL_STREAM_STATE: StreamState = {
  connected: false,
  text: '',
  toolActivity: [],
  error: null,
  running: false,
};

/**
 * 把单个事件归约到流状态上。
 * 导出为纯函数，便于单测。
 */
export function applyAgentEvent(state: StreamState, event: AgentEvent): StreamState {
  switch (event.type) {
    case 'run_started':
      // 新一轮运行：清空上一轮的文本与工具活动
      return { ...state, text: '', toolActivity: [], error: null, running: true };
    case 'text_delta':
      return { ...state, text: state.text + event.text };
    case 'tool_start':
      return {
        ...state,
        toolActivity: [
          ...state.toolActivity,
          { toolCallId: event.toolCallId, toolName: event.toolName, status: 'running' },
        ],
      };
    case 'tool_end': {
      // tool_end 事件不带 toolName，按 toolCallId 精确配对，
      // 避免同名工具并发调用时张冠李戴。
      const idx = state.toolActivity.findIndex(
        (t) => t.status === 'running' && t.toolCallId === event.toolCallId,
      );
      if (idx < 0) return state;
      const next = [...state.toolActivity];
      next[idx] = {
        ...next[idx]!,
        status: event.ok ? 'ok' : 'failed',
        summary: event.summary ?? event.error,
      };
      return { ...state, toolActivity: next };
    }
    case 'run_error':
      return { ...state, error: event.message, running: false };
    case 'run_finished':
      return { ...state, error: null, running: false };
    default:
      return state;
  }
}

export interface UseAgentStreamOptions {
  /** 允许注入自定义事件源（测试用） */
  source?: AgentEventSource;
}

/**
 * 消费全局 SSE 事件流。
 *
 * 桌面上的事件（窗口打开、通知、文件创建）可能来自任意会话，
 * 因此只维护一条 EventSource；会话内事件按 sessionId 过滤。
 */
export function useAgentStream(
  sessionId: string | null,
  options: UseAgentStreamOptions = {},
): StreamState {
  const [state, setState] = useState<StreamState>(INITIAL_STREAM_STATE);
  const sessionRef = useRef<string | null>(sessionId);
  sessionRef.current = sessionId;

  const source = options.source ?? agentEventStream;

  useEffect(() => {
    source.connect();

    const offEvent = source.subscribe((event) => {
      const current = sessionRef.current;
      // 会话内事件按 sessionId 过滤；桌面级事件（sessionId 为固定标记）始终处理
      if (current && event.sessionId !== current && !isDesktopEvent(event)) return;
      setState((s) => applyAgentEvent(s, event));
    });

    const offConn = source.subscribeConnection((connected) => {
      setState((s) => ({ ...s, connected }));
    });

    return () => {
      offEvent();
      offConn();
    };
  }, [source]);

  return state;
}

/**
 * 桌面级事件：窗口命令由服务端以固定 sessionId 标记，
 * 不属于任何会话，因此不能被会话过滤掉。
 */
export function isDesktopEvent(event: AgentEvent): boolean {
  return event.sessionId === '__desktop__';
}
