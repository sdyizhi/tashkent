import type { ModelMessage } from 'ai';

export interface ToolSchema {
  name: string;
  description: string;
  inputSchema: unknown;
}

export interface LLMRequest {
  model: string;
  messages: ModelMessage[];
  tools: ToolSchema[];
  /**
   * 工具执行回调。由 AgentRunner 注入，内部走 ToolExecutor。
   *
   * 关键设计：真实执行发生在 AI SDK 的工具循环内部，
   * 这样 SDK 才能把**真实执行结果**作为 tool 消息回传给模型。
   * 若把 execute 留空让上层自己执行，模型只会收到空结果。
   */
  executeTool?: (name: string, args: unknown, toolCallId: string) => Promise<unknown>;
  temperature?: number;
  maxOutputTokens?: number;
  /** 工具调用循环的最大步数（agent 可覆盖配置默认值） */
  maxSteps?: number;
  abortSignal?: AbortSignal;
  system?: string;
}

export type LLMChunk =
  | { type: 'text-delta'; text: string }
  | { type: 'thinking-delta'; text: string }
  | { type: 'tool-call'; toolCallId: string; toolName: string; args: unknown }
  | { type: 'tool-result'; toolCallId: string; toolName: string; result: unknown }
  | { type: 'usage'; inputTokens: number; outputTokens: number; totalTokens: number }
  /** reason 为 'error' 时，message 携带底层错误详情（连接失败、鉴权失败等） */
  | { type: 'finish'; reason: string; message?: string };

export interface LLMProvider {
  stream(req: LLMRequest): AsyncIterable<LLMChunk>;
}
