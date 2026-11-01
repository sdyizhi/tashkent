import type { WindowState } from './window.js';

export interface AgentDefinition {
  id: string;
  name: string;
  icon: string;
  description: string;
  systemPrompt: string;
  /** 该 Agent 可用的工具名白名单 */
  toolIds: string[];
  model?: string;
  temperature?: number;
  maxSteps?: number;
  params?: Record<string, unknown>;
}

export type AgentEvent =
  | { type: 'run_started'; sessionId: string; agentId: string }
  | { type: 'text_delta'; sessionId: string; text: string }
  | { type: 'thinking_delta'; sessionId: string; text: string }
  | { type: 'tool_start'; sessionId: string; toolCallId: string; toolName: string; args: unknown }
  | { type: 'tool_end'; sessionId: string; toolCallId: string; ok: boolean; summary?: string; error?: string }
  | {
      type: 'authorization_required';
      sessionId: string;
      authorizationId: string;
      toolCallId: string;
      toolName: string;
      args: unknown;
      reason: string;
    }
  | {
      type: 'desktop_window_opened';
      sessionId: string;
      window: WindowState;
    }
  | {
      type: 'desktop_window_updated';
      sessionId: string;
      windowId: string;
      patch: Partial<WindowState>;
    }
  | { type: 'desktop_window_closed'; sessionId: string; windowId: string }
  | { type: 'desktop_notify'; sessionId: string; message: string; icon?: string }
  | { type: 'desktop_file_created'; sessionId: string; path: string; name: string }
  | { type: 'run_finished'; sessionId: string; reason: string; usage?: TokenUsage }
  | { type: 'run_error'; sessionId: string; message: string };

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}
