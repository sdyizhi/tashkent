import { describe, expect, it } from 'vitest';
import type { ModelMessage } from 'ai';
import { estimateTokens, trimMessages, type TrimOptions } from './context.js';

const BASE_OPTS: TrimOptions = {
  keepTurns: 2,
  maxInputTokens: 100000,
  outputReserveRatio: 0.25,
  toolResultMaxBytes: 8192,
};

/** 构造 n 轮对话：每轮一条 user + 一条 assistant */
function turns(n: number, prefix = '第'): ModelMessage[] {
  const out: ModelMessage[] = [];
  for (let i = 1; i <= n; i += 1) {
    out.push({ role: 'user', content: `${prefix}${i}轮提问` });
    out.push({ role: 'assistant', content: `${prefix}${i}轮回答` });
  }
  return out;
}

describe('trimMessages 轮次保留', () => {
  it('不超过保留轮数时原样返回', () => {
    const messages = turns(2);
    const result = trimMessages(messages, BASE_OPTS);
    expect(result.messages).toHaveLength(4);
    expect(result.trimmed).toBe(0);
  });

  it('超出保留轮数时更早的轮次被摘要替换', () => {
    const messages = turns(5);
    const result = trimMessages(messages, BASE_OPTS);

    // 保留最近 2 轮 = 4 条原始消息 + 1 条摘要
    expect(result.messages).toHaveLength(5);
    expect(result.trimmed).toBe(3);

    const summary = result.messages[0]!;
    expect(summary.role).toBe('system');
    expect(String(summary.content)).toContain('3');
    expect(String(summary.content)).toContain('已摘要');
  });

  it('保留的消息是最近 N 轮', () => {
    const result = trimMessages(turns(5), BASE_OPTS);
    const tail = result.messages.slice(1);
    expect(tail).toHaveLength(4);
    expect(tail[0]).toEqual({ role: 'user', content: '第4轮提问' });
    expect(tail[3]).toEqual({ role: 'assistant', content: '第5轮回答' });
  });

  it('summary 消息只出现一次', () => {
    const result = trimMessages(turns(8), BASE_OPTS);
    const summaries = result.messages.filter((m) => m.role === 'system');
    expect(summaries).toHaveLength(1);
    expect(result.trimmed).toBe(6);
  });
});

describe('trimMessages 工具结果截断', () => {
  it('超过阈值的工具结果被截断并标注', () => {
    const long = 'x'.repeat(9000);
    const messages: ModelMessage[] = [
      { role: 'user', content: '读文件' },
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 'c1',
            toolName: 'fs.read',
            output: { type: 'text', value: long },
          },
        ],
      },
      { role: 'assistant', content: '好的' },
    ];

    const result = trimMessages(messages, { ...BASE_OPTS, keepTurns: 10 });
    const toolMsg = result.messages.find((m) => m.role === 'tool');
    expect(toolMsg).toBeDefined();
    const part = (toolMsg as Extract<ModelMessage, { role: 'tool' }>).content[0] as {
      output: { type: 'text'; value: string };
    };
    expect(part.output.value.length).toBeLessThan(long.length);
    expect(part.output.value).toContain('已截断');
    // 保留头部
    expect(part.output.value.startsWith('x'.repeat(100))).toBe(true);
  });

  it('未超阈值的工具结果保持原样', () => {
    const messages: ModelMessage[] = [
      { role: 'user', content: '读文件' },
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 'c1',
            toolName: 'fs.read',
            output: { type: 'text', value: '短内容' },
          },
        ],
      },
    ];

    const result = trimMessages(messages, { ...BASE_OPTS, keepTurns: 10 });
    const toolMsg = result.messages.find((m) => m.role === 'tool') as Extract<
      ModelMessage,
      { role: 'tool' }
    >;
    const part = toolMsg.content[0] as { output: { type: 'text'; value: string } };
    expect(part.output.value).toBe('短内容');
  });
});

describe('trimMessages token 预算', () => {
  it('超出预算时继续丢弃更老的轮次', () => {
    const big = 'y'.repeat(4000); // 约 1000 token
    const messages: ModelMessage[] = [];
    for (let i = 0; i < 6; i += 1) {
      messages.push({ role: 'user', content: `提问${i} ${big}` });
      messages.push({ role: 'assistant', content: `回答${i} ${big}` });
    }

    // 预算很小：输入可用 token = maxInputTokens * (1 - 0.25)
    const result = trimMessages(messages, {
      ...BASE_OPTS,
      keepTurns: 10,
      maxInputTokens: 3000,
    });

    expect(result.messages.length).toBeLessThan(messages.length);
    expect(result.trimmed).toBeGreaterThan(0);
  });

  it('预算充足时不做额外裁剪', () => {
    const messages = turns(3);
    const result = trimMessages(messages, {
      ...BASE_OPTS,
      keepTurns: 10,
      maxInputTokens: 100000,
    });
    expect(result.messages).toHaveLength(6);
    expect(result.trimmed).toBe(0);
  });

  it('预算紧张时保留 system 消息', () => {
    const messages: ModelMessage[] = [
      { role: 'system', content: '你是助手' },
      ...turns(4),
    ];
    const result = trimMessages(messages, {
      ...BASE_OPTS,
      keepTurns: 10,
      maxInputTokens: 120,
    });
    expect(result.messages.some((m) => m.role === 'system')).toBe(true);
  });

  it('预算再紧也保留最近一轮', () => {
    const messages = turns(4);
    const result = trimMessages(messages, {
      ...BASE_OPTS,
      keepTurns: 10,
      maxInputTokens: 1,
    });
    const users = result.messages.filter((m) => m.role === 'user');
    expect(users).toHaveLength(1);
    expect(users[0]?.content).toBe('第4轮提问');
  });
});

describe('trimMessages system 消息', () => {
  it('system 消息不参与轮次计数，也不被裁掉', () => {
    const messages: ModelMessage[] = [
      { role: 'system', content: '你是助手' },
      ...turns(4),
    ];

    const result = trimMessages(messages, { ...BASE_OPTS, keepTurns: 1 });

    const systems = result.messages.filter((m) => m.role === 'system');
    // 原始 system + 摘要 system
    expect(systems.length).toBe(2);
    expect(systems.some((m) => m.content === '你是助手')).toBe(true);
    // 保留 1 轮 = 2 条
    expect(result.messages.filter((m) => m.role === 'user')).toHaveLength(1);
  });
});

describe('estimateTokens', () => {
  it('按字符数 / 4 粗略估算', () => {
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('a'.repeat(400))).toBe(100);
    expect(estimateTokens('')).toBe(0);
  });
});
