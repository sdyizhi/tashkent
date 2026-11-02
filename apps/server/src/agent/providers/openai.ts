import { createOpenAI } from '@ai-sdk/openai';
import {
  generateText,
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
  /** 探测用的模型 id，缺省用 gpt-4o-mini */
  probeModel?: string;
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
    /**
     * 轻量可达性探测：发一次最小的 chat 请求（1 token 上限）。
     *
     * 用来在健康检查里判定「模型服务真的能连上」，
     * 失败时抛错，由调用方降级为 degraded。
     */
    async probe(): Promise<void> {
      await generateText({
        model: openai.chat(opts.probeModel ?? 'gpt-4o-mini'),
        prompt: 'ping',
        // reasoning 模型会先消耗 token 思考；上限太小会只出 thinking 而 0 正文，
        // 导致 generateText 报「无内容」错。调大到能兼顾思考 + 正文。
        maxOutputTokens: 256,
      });
    },

    async *stream(req: LLMRequest): AsyncIterable<LLMChunk> {
      const model = openai.chat(req.model);

      const tools: ToolSet = {};
      // OpenAI 兼容接口要求工具名只能含字母/数字/下划线（^[a-zA-Z0-9_-]+$），
      // 而项目工具名用点号分层（如 fs.read / desktop.open_app），
      // AI SDK 会直接抛「invalid function name」。
      // 这里在 provider 边界做映射：发给模型用下划线名，执行与事件回真实名。
      const realBySafe = new Map<string, string>();
      for (const t of req.tools) {
        const safeName = t.name.replace(/\./g, '_');
        realBySafe.set(safeName, t.name);
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
        tools[safeName] = defined;
      }
      const realName = (safe: string) => realBySafe.get(safe) ?? safe;

      const result = streamText({
        model,
        system: req.system,
        messages: req.messages,
        tools,
        temperature: req.temperature,
        maxOutputTokens: req.maxOutputTokens,
        abortSignal: req.abortSignal,
        stopWhen: stepCountIs(req.maxSteps ?? 8),
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
              toolName: realName(part.toolName),
              args: part.input,
            };
            break;
          case 'tool-result':
            yield {
              type: 'tool-result',
              toolCallId: part.toolCallId,
              toolName: realName(part.toolName),
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
