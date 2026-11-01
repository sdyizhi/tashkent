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

export type { AgentDefinition, WindowState, TokenUsage };
