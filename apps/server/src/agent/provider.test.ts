import { describe, expect, it } from 'vitest';
import type { LLMChunk, LLMProvider, LLMRequest } from './provider.js';

function providerOf(chunks: LLMChunk[]): LLMProvider {
  return {
    async *stream(_req: LLMRequest) {
      for (const c of chunks) yield c;
    },
  };
}

describe('LLMProvider 抽象', () => {
  it('按顺序产出 chunk', async () => {
    const p = providerOf([
      { type: 'text-delta', text: 'a' },
      { type: 'text-delta', text: 'b' },
      { type: 'finish', reason: 'stop' },
    ]);
    const out: LLMChunk[] = [];
    for await (const c of p.stream({ model: 'm', messages: [], tools: [] })) out.push(c);
    expect(out.map((c) => c.type)).toEqual(['text-delta', 'text-delta', 'finish']);
  });
});
