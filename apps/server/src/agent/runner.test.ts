import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { ModelMessage } from 'ai';
import type { AgentEvent, ToolDefinition } from '@tashkent/shared';
import { EventBus } from '../lib/event-bus.js';
import { ToolRegistry } from './tool-registry.js';
import { ToolExecutor } from './tool-executor.js';
import { AgentRunner } from './runner.js';
import type { LLMProvider, LLMRequest } from './provider.js';
import { scriptedProvider, TEXT_HELLO } from './mock-provider.js';

const agent = {
  id: 'chat',
  name: '对话',
  icon: '💬',
  description: '通用对话',
  systemPrompt: '你是助手',
  toolIds: ['echo'],
  maxSteps: 4,
};

function echoTool(): ToolDefinition {
  return {
    name: 'echo',
    description: '回显',
    inputSchema: z.object({ text: z.string() }),
    permission: 'safe',
    execute: async (input: { text: string }) => ({ ok: true, data: { echoed: input.text } }),
  };
}

describe('AgentRunner', () => {
  let bus: EventBus;
  let registry: ToolRegistry;
  let events: AgentEvent[];

  beforeEach(() => {
    bus = new EventBus();
    registry = new ToolRegistry();
    registry.register(echoTool());
    events = [];
    bus.subscribe((e) => events.push(e.event));
  });

  it('纯文本回复产生 text_delta 与 run_finished 事件', async () => {
    const runner = new AgentRunner({
      provider: scriptedProvider([TEXT_HELLO]),
      registry,
      executor: new ToolExecutor(registry, { authorize: async () => true }),
      bus,
      loadHistory: async () => [],
      contextKeepTurns: 20,
      maxInputTokens: 120000,
      toolResultMaxBytes: 8192,
      maxSteps: 8,
    });

    const result = await runner.run({ sessionId: 's1', agentId: 'chat', agent, userText: 'hi' });

    expect(result.text).toBe('你好');
    expect(result.events.some((e) => e.type === 'run_started')).toBe(true);
    expect(result.events.some((e) => e.type === 'run_finished')).toBe(true);
    expect(events.filter((e) => e.type === 'text_delta')).toHaveLength(1);
  });

  it('调用工具时发出 tool_start 与 tool_end 事件', async () => {
    const provider = scriptedProvider([
      [{ type: 'tool-call', toolCallId: 'c1', toolName: 'echo', args: { text: 'hi' } }],
      TEXT_HELLO,
    ]);
    const runner = new AgentRunner({
      provider,
      registry,
      executor: new ToolExecutor(registry, { authorize: async () => true }),
      bus,
      loadHistory: async () => [],
      contextKeepTurns: 20,
      maxInputTokens: 120000,
      toolResultMaxBytes: 8192,
      maxSteps: 8,
    });

    const result = await runner.run({ sessionId: 's1', agentId: 'chat', agent, userText: 'hi' });

    expect(result.toolCalls).toHaveLength(1);
    expect(result.events.some((e) => e.type === 'tool_start')).toBe(true);
    expect(result.events.some((e) => e.type === 'tool_end' && e.ok)).toBe(true);
  });

  it('工具执行失败时 run 以 error 结束但不抛出', async () => {
    registry.register({
      name: 'boom',
      description: '会炸',
      inputSchema: z.object({}),
      permission: 'safe',
      execute: async () => {
        throw new Error('炸了');
      },
    });
    const provider = scriptedProvider([
      [{ type: 'tool-call', toolCallId: 'c1', toolName: 'boom', args: {} }],
    ]);
    const runner = new AgentRunner({
      provider,
      registry,
      executor: new ToolExecutor(registry, { authorize: async () => true }),
      bus,
      loadHistory: async () => [],
      contextKeepTurns: 20,
      maxInputTokens: 120000,
      toolResultMaxBytes: 8192,
      maxSteps: 8,
    });

    const result = await runner.run({ sessionId: 's1', agentId: 'chat', agent, userText: 'hi' });
    expect(result.error).toBeTruthy();
  });

  it('未注册的工具被拒绝且记录错误', async () => {
    const provider = scriptedProvider([
      [{ type: 'tool-call', toolCallId: 'c1', toolName: 'ghost', args: {} }],
    ]);
    const runner = new AgentRunner({
      provider,
      registry,
      executor: new ToolExecutor(registry, { authorize: async () => true }),
      bus,
      loadHistory: async () => [],
      contextKeepTurns: 20,
      maxInputTokens: 120000,
      toolResultMaxBytes: 8192,
      maxSteps: 8,
    });

    const result = await runner.run({ sessionId: 's1', agentId: 'chat', agent, userText: 'hi' });
    const end = result.events.find((e) => e.type === 'tool_end');
    expect(end && end.type === 'tool_end' && end.ok).toBe(false);
  });

  it('事件被发布到 EventBus', async () => {
    const runner = new AgentRunner({
      provider: scriptedProvider([TEXT_HELLO]),
      registry,
      executor: new ToolExecutor(registry, { authorize: async () => true }),
      bus,
      loadHistory: async () => [],
      contextKeepTurns: 20,
      maxInputTokens: 120000,
      toolResultMaxBytes: 8192,
      maxSteps: 8,
    });
    await runner.run({ sessionId: 's1', agentId: 'chat', agent, userText: 'hi' });
    expect(events.length).toBeGreaterThan(0);
  });

  it('模型返回 error 时把底层错误信息透传到 run_error', async () => {
    const provider = scriptedProvider([
      [{ type: 'finish', reason: 'error', message: '连接超时' }],
    ]);
    const runner = new AgentRunner({
      provider,
      registry,
      executor: new ToolExecutor(registry, { authorize: async () => true }),
      bus,
      loadHistory: async () => [],
      contextKeepTurns: 20,
      maxInputTokens: 120000,
      toolResultMaxBytes: 8192,
      maxSteps: 8,
    });

    const result = await runner.run({ sessionId: 's1', agentId: 'chat', agent, userText: 'hi' });
    expect(result.error).toBe('连接超时');
    const errEvent = result.events.find((e) => e.type === 'run_error');
    expect(errEvent && errEvent.type === 'run_error' && errEvent.message).toBe('连接超时');
  });

  it('write 工具触发授权时发出 authorization_required 事件', async () => {
    registry.register({
      name: 'writer',
      description: '写文件',
      inputSchema: z.object({ path: z.string() }),
      permission: 'write',
      execute: async () => ({ ok: true }),
    });
    const provider = scriptedProvider([
      [{ type: 'tool-call', toolCallId: 'c1', toolName: 'writer', args: { path: 'a.txt' } }],
    ]);
    const runner = new AgentRunner({
      provider,
      registry,
      executor: new ToolExecutor(registry, {
        authorize: async (_tool, info) => {
          // 模拟 runtime 层：发授权事件后等待前端决策
          info.emit({
            type: 'authorization_required',
            sessionId: info.sessionId,
            authorizationId: 'auth-1',
            toolCallId: info.toolCallId,
            toolName: 'writer',
            args: info.args,
            reason: '需要用户授权',
          });
          return true;
        },
      }),
      bus,
      loadHistory: async () => [],
      contextKeepTurns: 20,
      maxInputTokens: 120000,
      toolResultMaxBytes: 8192,
      maxSteps: 8,
    });

    const result = await runner.run({ sessionId: 's1', agentId: 'chat', agent, userText: 'hi' });
    const authEvent = result.events.find((e) => e.type === 'authorization_required');
    expect(authEvent).toBeTruthy();
    expect(authEvent && authEvent.type === 'authorization_required' && authEvent.toolName).toBe('writer');
    expect(authEvent && authEvent.type === 'authorization_required' && authEvent.authorizationId).toBe('auth-1');
    expect(authEvent && authEvent.type === 'authorization_required' && authEvent.sessionId).toBe('s1');
    expect(authEvent && authEvent.type === 'authorization_required' && authEvent.toolCallId).toBe('c1');
  });

  it('把 agent.maxSteps 传给 provider', async () => {
    let seen: LLMRequest | undefined;
    const provider: LLMProvider = {
      async *stream(req) {
        seen = req;
        yield { type: 'text-delta', text: 'ok' };
      },
    };
    const runner = new AgentRunner({
      provider,
      registry,
      executor: new ToolExecutor(registry, { authorize: async () => true }),
      bus,
      loadHistory: async () => [],
      contextKeepTurns: 20,
      maxInputTokens: 120000,
      toolResultMaxBytes: 8192,
      maxSteps: 8,
    });

    await runner.run({ sessionId: 's1', agentId: 'chat', agent, userText: 'hi' });
    expect(seen?.maxSteps).toBe(4); // agent.maxSteps = 4
  });

  it('agent 未声明 maxSteps 时用配置默认值', async () => {
    let seen: LLMRequest | undefined;
    const provider: LLMProvider = {
      async *stream(req) {
        seen = req;
        yield { type: 'text-delta', text: 'ok' };
      },
    };
    const runner = new AgentRunner({
      provider,
      registry,
      executor: new ToolExecutor(registry, { authorize: async () => true }),
      bus,
      loadHistory: async () => [],
      contextKeepTurns: 20,
      maxInputTokens: 120000,
      toolResultMaxBytes: 8192,
      maxSteps: 8,
    });

    const { maxSteps: _ignored, ...agentWithoutSteps } = agent;
    await runner.run({
      sessionId: 's1',
      agentId: 'chat',
      agent: agentWithoutSteps,
      userText: 'hi',
    });
    expect(seen?.maxSteps).toBe(8);
  });

  it('裁剪历史：只保留最近 N 轮', async () => {
    let seen: LLMRequest | undefined;
    const provider: LLMProvider = {
      async *stream(req) {
        seen = req;
        yield { type: 'text-delta', text: 'ok' };
      },
    };
    const runner = new AgentRunner({
      provider,
      registry,
      executor: new ToolExecutor(registry, { authorize: async () => true }),
      bus,
      loadHistory: async () => [
        { id: 'm1', sessionId: 's1', role: 'user', content: '旧问题1', createdAt: 1 },
        { id: 'm2', sessionId: 's1', role: 'assistant', content: '旧回答1', createdAt: 2 },
        { id: 'm3', sessionId: 's1', role: 'user', content: '新问题', createdAt: 3 },
      ],
      contextKeepTurns: 1,
      maxInputTokens: 120000,
      toolResultMaxBytes: 8192,
      maxSteps: 8,
    });

    await runner.run({ sessionId: 's1', agentId: 'chat', agent, userText: '本轮提问' });
    const contents = (seen?.messages ?? []).map((m) =>
      m.role === 'system' ? m.content : JSON.stringify(m.content),
    );
    expect(contents.some((c) => c.includes('旧问题1'))).toBe(false);
    expect(contents.some((c) => c.includes('已摘要'))).toBe(true);
    expect(contents.some((c) => c.includes('新问题'))).toBe(true);
    expect(contents.some((c) => c.includes('本轮提问'))).toBe(true);
  });

  it('裁剪历史：超长工具结果被截断', async () => {
    let seen: LLMRequest | undefined;
    const provider: LLMProvider = {
      async *stream(req) {
        seen = req;
        yield { type: 'text-delta', text: 'ok' };
      },
    };
    const runner = new AgentRunner({
      provider,
      registry,
      executor: new ToolExecutor(registry, { authorize: async () => true }),
      bus,
      loadHistory: async () => [
        { id: 'm1', sessionId: 's1', role: 'user', content: '读文件', createdAt: 1 },
        {
          id: 'm2',
          sessionId: 's1',
          role: 'tool',
          content: 'z'.repeat(5000),
          toolCallId: 'c1',
          createdAt: 2,
        },
      ],
      contextKeepTurns: 20,
      maxInputTokens: 120000,
      toolResultMaxBytes: 100,
      maxSteps: 8,
    });

    await runner.run({ sessionId: 's1', agentId: 'chat', agent, userText: '继续' });
    const toolMsg = (seen?.messages ?? []).find((m) => m.role === 'tool');
    expect(toolMsg).toBeDefined();
    const part = (toolMsg as Extract<ModelMessage, { role: 'tool' }>).content[0] as {
      output: { type: 'text'; value: string };
    };
    expect(part.output.value.length).toBeLessThan(200);
    expect(part.output.value).toContain('已截断');
  });
});
