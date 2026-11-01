import type { AgentDefinition, AgentEvent, MessageRecord } from '@tashkent/shared';
import type { ModelMessage } from 'ai';
import type { EventBus } from '../lib/event-bus.js';
import type { LLMProvider } from './provider.js';
import type { ToolRegistry } from './tool-registry.js';
import type { ToolExecutor } from './tool-executor.js';

export interface RunInput {
  sessionId: string;
  agentId: string;
  agent: AgentDefinition;
  userText: string;
}

export interface RunResult {
  text: string;
  toolCalls: Array<{ toolName: string; args: unknown; ok: boolean }>;
  usage?: { inputTokens: number; outputTokens: number; totalTokens: number };
  error?: string;
  events: AgentEvent[];
}

export interface RunnerDeps {
  provider: LLMProvider;
  registry: ToolRegistry;
  executor: ToolExecutor;
  bus: EventBus;
  loadHistory: (sessionId: string) => Promise<MessageRecord[]>;
}

/**
 * 从历史消息里取出工具名。
 * MessageRecord 只存了 toolCalls 数组（含 toolName），取不到时回退为 'tool'。
 */
function toolNameOf(m: MessageRecord): string {
  const calls = m.toolCalls;
  if (Array.isArray(calls) && calls.length > 0) {
    const first = calls[0] as { toolName?: unknown } | null;
    if (first && typeof first.toolName === 'string') return first.toolName;
  }
  return 'tool';
}

export class AgentRunner {
  constructor(private readonly deps: RunnerDeps) {}

  async run(input: RunInput): Promise<RunResult> {
    const events: AgentEvent[] = [];
    const emit = (event: AgentEvent) => {
      events.push(event);
      this.deps.bus.publish(event);
    };

    const toolCalls: RunResult['toolCalls'] = [];
    let text = '';
    let usage: RunResult['usage'];
    let error: string | undefined;

    emit({ type: 'run_started', sessionId: input.sessionId, agentId: input.agentId });

    try {
      const history = await this.deps.loadHistory(input.sessionId);
      const messages: ModelMessage[] = [
        ...history.map(
          (m): ModelMessage =>
            m.role === 'assistant'
              ? { role: 'assistant', content: m.content }
              : m.role === 'tool'
                ? {
                    role: 'tool',
                    content: [
                      {
                        type: 'tool-result',
                        toolCallId: m.toolCallId ?? '',
                        toolName: toolNameOf(m),
                        output: { type: 'text', value: m.content },
                      },
                    ],
                  }
                : { role: 'user', content: m.content },
        ),
        { role: 'user', content: input.userText },
      ];

      const tools = this.deps.registry.pick(input.agent.toolIds);

      const stream = this.deps.provider.stream({
        model: input.agent.model ?? 'gpt-4o-mini',
        system: input.agent.systemPrompt,
        messages: messages,
        tools: tools.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
        })),
        temperature: input.agent.temperature,
        // 工具真实执行在此发生：AI SDK 的工具循环会把返回结果作为 tool 消息回传给模型，
        // 同时我们借此把 tool_start / tool_end 事件发到桌面。
        executeTool: async (name, args, toolCallId) => {
          emit({
            type: 'tool_start',
            sessionId: input.sessionId,
            toolCallId,
            toolName: name,
            args,
          });
          const result = await this.deps.executor.execute(name, args, {
            sessionId: input.sessionId,
            agentId: input.agentId,
            toolCallId,
            emit,
          });
          toolCalls.push({ toolName: name, args, ok: result.ok });
          emit({
            type: 'tool_end',
            sessionId: input.sessionId,
            toolCallId,
            ok: result.ok,
            summary: result.summary,
            error: result.error,
          });
          if (!result.ok) error = result.error;
          // 回传给模型的必须是真实结果；失败也回传，让模型有机会自行纠正
          return result.ok ? result.data ?? { ok: true } : { ok: false, error: result.error };
        },
      });

      for await (const chunk of stream) {
        switch (chunk.type) {
          case 'text-delta':
            text += chunk.text;
            emit({ type: 'text_delta', sessionId: input.sessionId, text: chunk.text });
            break;
          case 'thinking-delta':
            emit({ type: 'thinking_delta', sessionId: input.sessionId, text: chunk.text });
            break;
          case 'tool-call':
            // 工具已由 executeTool 执行完毕，这里仅记录（事件已在 executeTool 中发出）
            break;
          case 'tool-result':
            break;
          case 'usage':
            usage = {
              inputTokens: chunk.inputTokens,
              outputTokens: chunk.outputTokens,
              totalTokens: chunk.totalTokens,
            };
            break;
          case 'finish':
            if (chunk.reason === 'error' && !error) error = '模型返回错误';
            break;
        }
      }
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }

    if (error) {
      emit({ type: 'run_error', sessionId: input.sessionId, message: error });
      return { text, toolCalls, usage, error, events };
    }

    emit({
      type: 'run_finished',
      sessionId: input.sessionId,
      reason: 'stop',
      usage,
    });
    return { text, toolCalls, usage, events };
  }
}
