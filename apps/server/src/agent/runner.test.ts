import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { AgentEvent, ToolDefinition } from '@tashkent/shared';
import { EventBus } from '../lib/event-bus.js';
import { ToolRegistry } from './tool-registry.js';
import { ToolExecutor } from './tool-executor.js';
import { AgentRunner } from './runner.js';
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
    });

    const result = await runner.run({ sessionId: 's1', agentId: 'chat', agent, userText: 'hi' });
    const authEvent = result.events.find((e) => e.type === 'authorization_required');
    expect(authEvent).toBeTruthy();
    expect(authEvent && authEvent.type === 'authorization_required' && authEvent.toolName).toBe('writer');
    expect(authEvent && authEvent.type === 'authorization_required' && authEvent.authorizationId).toBe('auth-1');
    expect(authEvent && authEvent.type === 'authorization_required' && authEvent.sessionId).toBe('s1');
    expect(authEvent && authEvent.type === 'authorization_required' && authEvent.toolCallId).toBe('c1');
  });
});
