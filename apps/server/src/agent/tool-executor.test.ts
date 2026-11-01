import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { ToolDefinition } from '@tashkent/shared';
import { ToolRegistry } from './tool-registry.js';
import { ToolExecutor } from './tool-executor.js';

function safeTool(): ToolDefinition {
  return {
    name: 'safe.tool',
    description: '安全工具',
    inputSchema: z.object({ v: z.string() }),
    permission: 'safe',
    execute: async (input) => ({ ok: true, data: { got: input.v }, summary: 'done' }),
  };
}

describe('ToolRegistry', () => {
  it('注册后可按名查找', () => {
    const r = new ToolRegistry();
    r.register(safeTool());
    expect(r.get('safe.tool')?.name).toBe('safe.tool');
  });

  it('查找不存在的工具返回 undefined', () => {
    expect(new ToolRegistry().get('nope')).toBeUndefined();
  });

  it('按白名单筛选工具', () => {
    const r = new ToolRegistry();
    r.register(safeTool());
    r.register({ ...safeTool(), name: 'other.tool' });
    expect(r.pick(['safe.tool']).map((t) => t.name)).toEqual(['safe.tool']);
  });

  it('白名单中不存在的名字被忽略', () => {
    const r = new ToolRegistry();
    r.register(safeTool());
    expect(r.pick(['ghost']).length).toBe(0);
  });
});

describe('ToolExecutor', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  it('safe 工具直接执行并返回摘要', async () => {
    registry.register(safeTool());
    const ex = new ToolExecutor(registry, { authorize: async () => true });
    const res = await ex.execute('safe.tool', { v: 'x' }, { sessionId: 's1', agentId: 'a1', toolCallId: 't1', emit: () => {} });
    expect(res.ok).toBe(true);
    expect(res.summary).toBe('done');
  });

  it('dangerous 工具在未授权时不执行', async () => {
    const spy = vi.fn(async () => ({ ok: true }));
    registry.register({ ...safeTool(), name: 'danger.tool', permission: 'dangerous', execute: spy });
    const ex = new ToolExecutor(registry, { authorize: async () => false });
    const res = await ex.execute('danger.tool', {}, { sessionId: 's1', agentId: 'a1', toolCallId: 't1', emit: () => {} });
    expect(res.ok).toBe(false);
    expect(res.error).toContain('未获授权');
    expect(spy).not.toHaveBeenCalled();
  });

  it('write 工具在未授权时不执行', async () => {
    const spy = vi.fn(async () => ({ ok: true }));
    registry.register({ ...safeTool(), name: 'write.tool', permission: 'write', execute: spy });
    const ex = new ToolExecutor(registry, { authorize: async () => false });
    const res = await ex.execute('write.tool', {}, { sessionId: 's1', agentId: 'a1', toolCallId: 't1', emit: () => {} });
    expect(res.ok).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it('未注册的工具返回错误', async () => {
    const ex = new ToolExecutor(registry, { authorize: async () => true });
    const res = await ex.execute('ghost', {}, { sessionId: 's1', agentId: 'a1', toolCallId: 't1', emit: () => {} });
    expect(res.ok).toBe(false);
    expect(res.error).toContain('未注册');
  });

  it('工具抛异常时返回错误而不抛出', async () => {
    registry.register({
      ...safeTool(),
      name: 'boom.tool',
      execute: async () => {
        throw new Error('炸了');
      },
    });
    const ex = new ToolExecutor(registry, { authorize: async () => true });
    const res = await ex.execute('boom.tool', {}, { sessionId: 's1', agentId: 'a1', toolCallId: 't1', emit: () => {} });
    expect(res.ok).toBe(false);
    expect(res.error).toContain('炸了');
  });

  it('工具超时后返回超时错误', async () => {
    registry.register({
      ...safeTool(),
      name: 'slow.tool',
      timeoutMs: 20,
      execute: () => new Promise(() => {}),
    });
    const ex = new ToolExecutor(registry, { authorize: async () => true });
    const res = await ex.execute('slow.tool', {}, { sessionId: 's1', agentId: 'a1', toolCallId: 't1', emit: () => {} });
    expect(res.ok).toBe(false);
    expect(res.error).toContain('超时');
  });
});
