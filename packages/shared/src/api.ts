import type { AgentDefinition, TokenUsage } from './agent.js';
import type { WindowState } from './window.js';

export interface ApiError {
  error: { code: string; message: string; details?: Record<string, unknown> };
}

export interface CreateSessionRequest {
  agentId: string;
  params?: Record<string, unknown>;
}

export interface SessionSummary {
  id: string;
  agentId: string;
  title: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface MessageRecord {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  toolCalls?: unknown;
  toolCallId?: string;
  createdAt: number;
}

export interface SendMessageResponse {
  runId: string;
}

export interface HealthResponse {
  status: 'ok' | 'degraded';
  version: string;
  db: { ok: boolean; agents: number; sessions: number };
  llm: { ok: boolean; model: string; latencyMs: number | null };
}

export interface AgentsResponse {
  agents: AgentDefinition[];
}

export interface WindowsResponse {
  windows: WindowState[];
}

export interface ToolsResponse {
  tools: Array<{ name: string; description: string; permission: string }>;
}

/** 工作区目录条目 */
export interface FileEntry {
  name: string;
  type: 'dir' | 'file';
  size: number;
}

export interface FileListResponse {
  path: string;
  entries: FileEntry[];
}

export interface FileContentResponse {
  path: string;
  content: string;
}

/**
 * 对外可见的运行时配置（不含任何凭据）。
 */
export interface PublicConfig {
  provider: string;
  model: string;
  temperature: number;
  maxSteps: number;
  maxOutputTokens: number;
  contextKeepTurns: number;
  shellEnabled: boolean;
  shellAllowed: string[];
  allowedDomains: string[];
  version: string;
}

export type { AgentDefinition, WindowState, TokenUsage };
