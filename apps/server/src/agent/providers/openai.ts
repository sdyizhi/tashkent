import { createOpenAI } from '@ai-sdk/openai';
import {
  streamText,
  stepCountIs,
  tool as aiTool,
  type FlexibleSchema,
  type Tool,
  type ToolSet,
} from 'ai';
import type { LLMChunk, LLMProvider, LLMRequest } from '../provider.js';

export interface OpenAIProviderOptions {
  apiKey: string;
  baseUrl?: string;
}

/** 从 SDK 抛出的错误对象里抽出可读信息 */
function errorMessage(err: unknown): string | undefined {
  if (!err) return undefined;
  if (typeof err === 'string') return err;
  if (err instanceof Error) {
    // SDK 的错误 toString() 会附带 Symbol(vercel.ai.error) 等噪音行，去掉
    const msg = err.message
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('Symbol(vercel.ai.error'))
      .join('\n')
      .trim();
    return msg || err.name;
  }
  const anyErr = err as { message?: unknown };
  return typeof anyErr.message === 'string' ? anyErr.message : undefined;
}

export function createOpenAIProvider(opts: OpenAIProviderOptions): LLMProvider {
  const openai = createOpenAI({
    apiKey: opts.apiKey,
    ...(opts.baseUrl ? { baseURL: opts.baseUrl } : {}),
  });

  return {
    async *stream(req: LLMRequest): AsyncIterable<LLMChunk> {
      const model = openai(req.model);

      const tools: ToolSet = {};
      for (const t of req.tools) {
        const defined: Tool<any, any, any> = aiTool<any, any, any>({
          description: t.description,
          inputSchema: t.inputSchema as FlexibleSchema,
          // 真实执行交给上层（AgentRunner → ToolExecutor）。
          // SDK 会在自己的工具循环里把这里的返回值作为 tool 消息回传给模型，
          // 因此这里必须返回**真实执行结果**，不能是占位值。
          execute: async (input: unknown, options: { toolCallId: string }) => {
            if (!req.executeTool) {
              throw new Error(`工具 ${t.name} 缺少执行器`);
            }
            return (await req.executeTool(t.name, input, options.toolCallId)) as never;
          },
        });
        tools[t.name] = defined;
      }

      const result = streamText({
        model,
        system: req.system,
        messages: req.messages,
        tools,
        temperature: req.temperature,
        maxOutputTokens: req.maxOutputTokens,
        abortSignal: req.abortSignal,
        stopWhen: stepCountIs(20),
      });

      for await (const part of result.fullStream) {
        switch (part.type) {
          case 'text-delta':
            yield { type: 'text-delta', text: part.text };
            break;
          case 'reasoning-delta':
            yield { type: 'thinking-delta', text: part.text };
            break;
          case 'tool-call':
            yield {
              type: 'tool-call',
              toolCallId: part.toolCallId,
              toolName: part.toolName,
              args: part.input,
            };
            break;
          case 'tool-result':
            yield {
              type: 'tool-result',
              toolCallId: part.toolCallId,
              toolName: part.toolName,
              result: part.output,
            };
            break;
          case 'finish': {
            const inputTokens = part.totalUsage.inputTokens ?? 0;
            const outputTokens = part.totalUsage.outputTokens ?? 0;
            yield {
              type: 'usage',
              inputTokens,
              outputTokens,
              totalTokens: part.totalUsage.totalTokens ?? inputTokens + outputTokens,
            };
            yield { type: 'finish', reason: part.finishReason ?? 'stop' };
            break;
          }
          case 'error':
            yield { type: 'finish', reason: 'error', message: errorMessage(part.error) };
            break;
          default:
            break;
        }
      }
    },
  };
}
