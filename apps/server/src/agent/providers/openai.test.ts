import { describe, expect, it, vi } from 'vitest';

/**
 * 捕获 streamText 的入参，验证 provider 把 maxSteps 传给了停止条件。
 *
 * 这里 mock 的是 AI SDK 的入口，而不是真实网络：
 * 步数上限属于「请求参数是否被正确下传」的问题，
 * 断言 stopWhen 与 maxSteps 对应即可，不需要真的跑工具循环。
 */
const captured: Record<string, unknown>[] = [];
const stepCounts: number[] = [];

vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ai')>();
  return {
    ...actual,
    stepCountIs: (n: number) => {
      stepCounts.push(n);
      return actual.stepCountIs(n);
    },
    streamText: (args: Record<string, unknown>) => {
      captured.push(args);
      return {
        fullStream: (async function* () {
          yield { type: 'finish', finishReason: 'stop', totalUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 } };
        })(),
      };
    },
  };
});

const { createOpenAIProvider } = await import('./openai.js');

describe('OpenAI provider 步数上限', () => {
  it('maxSteps 缺省时使用默认步数 8', async () => {
    captured.length = 0;
    stepCounts.length = 0;
    const provider = createOpenAIProvider({ apiKey: 'test-key' });
    const stream = provider.stream({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'hi' }],
      tools: [],
    });
    for await (const _chunk of stream) {
      // 忽略
    }
    expect(captured).toHaveLength(1);
    expect(stepCounts).toEqual([8]);
  });

  it('maxSteps 被下传给停止条件', async () => {
    captured.length = 0;
    stepCounts.length = 0;
    const provider = createOpenAIProvider({ apiKey: 'test-key' });
    const stream = provider.stream({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'hi' }],
      tools: [],
      maxSteps: 3,
    });
    for await (const _chunk of stream) {
      // 忽略
    }
    expect(captured).toHaveLength(1);
    expect(stepCounts).toEqual([3]);
  });
});
