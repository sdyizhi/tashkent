import type { LLMChunk, LLMProvider, LLMRequest } from './provider.js';

/**
 * 测试用 LLMProvider：按脚本依次产出 chunk。
 *
 * 依赖 LLMProvider 抽象而非 AI SDK 内部结构，
 * 因此 AI SDK 升级不会破坏这些测试。
 *
 * 脚本中若出现 tool-call chunk，mock 会调用 req.executeTool 执行工具，
 * 与真实 provider 的行为一致（工具在 SDK 循环内执行）。
 */
export function scriptedProvider(script: LLMChunk[][]): LLMProvider {
  let index = 0;
  return {
    async *stream(req: LLMRequest): AsyncIterable<LLMChunk> {
      const chunks = script[Math.min(index, script.length - 1)] ?? [];
      index += 1;
      for (const c of chunks) {
        if (c.type === 'tool-call' && req.executeTool) {
          const output = await req.executeTool(c.toolName, c.args, c.toolCallId);
          yield {
            type: 'tool-result',
            toolCallId: c.toolCallId,
            toolName: c.toolName,
            result: output,
          };
          continue;
        }
        yield c;
      }
    },
  };
}

export const TEXT_HELLO: LLMChunk[] = [
  { type: 'text-delta', text: '你好' },
  { type: 'usage', inputTokens: 10, outputTokens: 2, totalTokens: 12 },
  { type: 'finish', reason: 'stop' },
];
