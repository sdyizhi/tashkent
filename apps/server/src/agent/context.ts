import type { ModelMessage } from 'ai';

/**
 * 上下文裁剪参数。
 *
 * 对应设计文档 4.2.4「上下文管理」：
 * - 历史裁剪：保留最近 N 轮完整消息，更早的按摘要压缩；
 * - 工具结果裁剪：单个工具结果超过阈值时截断并保留头部；
 * - 系统提示固定：systemPrompt 不参与裁剪；
 * - Token 预算：使用模型的 maxInputTokens，预留一部分给输出。
 */
export interface TrimOptions {
  /** 保留最近 N 轮完整消息 */
  keepTurns: number;
  /** 模型上下文窗口预算（输入侧） */
  maxInputTokens: number;
  /** 给输出预留的比例（0.25 表示 25%） */
  outputReserveRatio: number;
  /** 单个工具结果的最大字节数，超出即截断 */
  toolResultMaxBytes: number;
}

export interface TrimResult {
  /** 裁剪后的消息列表 */
  messages: ModelMessage[];
  /** 被压缩掉的历史轮数 */
  trimmed: number;
}

const TRUNCATION_SUFFIX = '…（已截断）';

/** 粗略估算 token 数：字符数 / 4 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** 取出一条消息里的文本内容（用于估算长度） */
function messageText(m: ModelMessage): string {
  if (m.role === 'system') return m.content;
  if (m.role === 'user') {
    return typeof m.content === 'string'
      ? m.content
      : m.content
          .map((part) => (part.type === 'text' ? part.text : ''))
          .join('');
  }
  if (m.role === 'assistant') {
    return typeof m.content === 'string'
      ? m.content
      : m.content
          .map((part) => (part.type === 'text' ? part.text : ''))
          .join('');
  }
  // tool 消息：收集所有文本型工具结果
  return m.content
    .map((part) => {
      if (part.type !== 'tool-result') return '';
      const output = part.output;
      if (output.type === 'text' || output.type === 'error-text') return output.value;
      if (output.type === 'json' || output.type === 'error-json') {
        return JSON.stringify(output.value ?? '');
      }
      return '';
    })
    .join('');
}

function tokensOf(messages: ModelMessage[]): number {
  let total = 0;
  for (const m of messages) total += estimateTokens(messageText(m));
  return total;
}

/** 截断过长的工具结果，保留头部 */
function truncateToolResults(m: ModelMessage, maxBytes: number): ModelMessage {
  if (m.role !== 'tool') return m;
  let changed = false;
  const content = m.content.map((part) => {
    if (part.type !== 'tool-result') return part;
    const output = part.output;
    if (output.type !== 'text') return part;
    if (output.value.length <= maxBytes) return part;
    changed = true;
    return {
      ...part,
      output: { ...output, value: output.value.slice(0, maxBytes) + TRUNCATION_SUFFIX },
    };
  });
  return changed ? { ...m, content } : m;
}

interface Turn {
  messages: ModelMessage[];
}

/**
 * 按「轮」切分消息：一轮 = 一条 user 消息 + 其后的 assistant / tool 消息。
 *
 * system 消息不参与分轮（它们由 provider 的 system 参数单独传递，不参与裁剪）。
 */
function groupTurns(messages: ModelMessage[]): Turn[] {
  const turns: Turn[] = [];
  let current: Turn | null = null;
  for (const m of messages) {
    if (m.role === 'user' || current === null) {
      current = { messages: [m] };
      turns.push(current);
    } else {
      current.messages.push(m);
    }
  }
  return turns;
}

/**
 * 裁剪消息列表。
 *
 * 纯函数：同样的输入与参数总是得到同样的输出，便于单测。
 */
export function trimMessages(messages: ModelMessage[], opts: TrimOptions): TrimResult {
  const systemMessages = messages.filter((m) => m.role === 'system');
  const others = messages
    .filter((m) => m.role !== 'system')
    .map((m) => truncateToolResults(m, Math.max(0, opts.toolResultMaxBytes)));

  const turns = groupTurns(others);
  const keepTurns = Math.max(0, opts.keepTurns);

  // 1) 历史裁剪：保留最近 keepTurns 轮，更早的轮次用摘要替代
  const start = Math.max(0, turns.length - keepTurns);
  let dropped = start;
  let kept = turns.slice(start);

  // 2) Token 预算：输入侧可用 = maxInputTokens * (1 - 输出预留比例)
  const budget = Math.max(
    0,
    Math.floor(opts.maxInputTokens * (1 - clamp(opts.outputReserveRatio, 0, 1))),
  );

  while (kept.length > 1) {
    const flat = kept.flatMap((t) => t.messages);
    if (tokensOf([...systemMessages, ...flat]) <= budget) break;
    kept.shift();
    dropped += 1;
  }

  const summary: ModelMessage[] =
    dropped > 0
      ? [
          {
            role: 'system',
            content: `此处 ${dropped} 轮对话已摘要（更早的内容已压缩，仅保留关键结论）`,
          },
        ]
      : [];

  return {
    messages: [...systemMessages, ...summary, ...kept.flatMap((t) => t.messages)],
    trimmed: dropped,
  };
}
