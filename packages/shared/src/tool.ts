import type { AgentEvent } from './agent.js';

export type ToolPermission = 'safe' | 'write' | 'dangerous';

export interface ToolContext {
  sessionId: string;
  agentId: string;
  toolCallId: string;
  abortSignal?: AbortSignal;
  /** 工具内部发事件到 EventBus（桌面操作走这条通道） */
  emit: (event: AgentEvent) => void;
}

export interface ToolResult {
  ok: boolean;
  data?: unknown;
  error?: string;
  /** 展示给用户的可读摘要，会进 tool_end 事件 */
  summary?: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  /** zod schema，用于校验 LLM 传入的参数 */
  inputSchema: unknown;
  permission: ToolPermission;
  timeoutMs?: number;
  execute: (input: any, ctx: ToolContext) => Promise<ToolResult>;
}
