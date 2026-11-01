import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { ToolDefinition } from '@tashkent/shared';
import { ToolRegistry } from './tool-registry.js';
import { ToolExecutor } from './tool-executor.js';
import type { Logger } from '../lib/logger.js';

function fakeLogger(): Logger & {
  debug: ReturnType<typeof vi.fn>;
  info: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
} {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

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

  it('write 工具在授权通过后执行', async () => {
    const spy = vi.fn(async () => ({ ok: true, summary: '写好了' }));
    registry.register({ ...safeTool(), name: 'write.tool', permission: 'write', execute: spy });
    const ex = new ToolExecutor(registry, { authorize: async () => true });
    const res = await ex.execute('write.tool', {}, { sessionId: 's1', agentId: 'a1', toolCallId: 't1', emit: () => {} });
    expect(res.ok).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('safe 工具不触发授权回调', async () => {
    const spy = vi.fn(async () => true);
    registry.register(safeTool());
    const ex = new ToolExecutor(registry, { authorize: spy });
    await ex.execute('safe.tool', {}, { sessionId: 's1', agentId: 'a1', toolCallId: 't1', emit: () => {} });
    expect(spy).not.toHaveBeenCalled();
  });

  it('授权回调拿到 sessionId / toolCallId / args', async () => {
    const seen: Array<{ sessionId: string; toolCallId: string; args: unknown }> = [];
    registry.register({ ...safeTool(), name: 'write.tool', permission: 'write' });
    const ex = new ToolExecutor(registry, {
      authorize: async (_tool, info) => {
        seen.push({ sessionId: info.sessionId, toolCallId: info.toolCallId, args: info.args });
        return true;
      },
    });
    await ex.execute('write.tool', { path: 'a.txt' }, { sessionId: 's9', agentId: 'a1', toolCallId: 'tc-7', emit: () => {} });
    expect(seen).toEqual([{ sessionId: 's9', toolCallId: 'tc-7', args: { path: 'a.txt' } }]);
  });

  it('授权挂起期间工具尚未执行，授权通过后才执行', async () => {
    const spy = vi.fn(async () => ({ ok: true }));
    registry.register({ ...safeTool(), name: 'write.tool', permission: 'write', execute: spy });
    let approve!: (ok: boolean) => void;
    const ex = new ToolExecutor(registry, {
      authorize: () => new Promise<boolean>((r) => (approve = r)),
    });
    const pending = ex.execute('write.tool', {}, { sessionId: 's1', agentId: 'a1', toolCallId: 't1', emit: () => {} });
    await new Promise((r) => setTimeout(r, 0));
    expect(spy).not.toHaveBeenCalled();
    approve(true);
    const res = await pending;
    expect(res.ok).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);
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

describe('ToolExecutor 工具执行日志', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  /** 工具执行成功后应记录 tool_exec 日志 */
  it('执行成功后记录 tool_exec 日志，字段包含工具名、会话、耗时与成功标记', async () => {
    registry.register(safeTool());
    const log = fakeLogger();
    const ex = new ToolExecutor(registry, { authorize: async () => true, logger: log });

    await ex.execute('safe.tool', { v: 'x' }, { sessionId: 's_abc', agentId: 'a1', toolCallId: 't1', emit: () => {} });

    const calls = log.info.mock.calls;
    expect(calls).toHaveLength(1);
    const [msg, fields] = calls[0] as [string, Record<string, unknown>];
    expect(msg).toBe('tool_exec');
    expect(fields.tool).toBe('safe.tool');
    expect(fields.sessionId).toBe('s_abc');
    expect(fields.ok).toBe(true);
    expect(typeof fields.durationMs).toBe('number');
    expect((fields.durationMs as number) as number).toBeGreaterThanOrEqual(0);
  });

  it('日志只记录摘要，不包含完整入参与出参', async () => {
    registry.register(safeTool());
    const log = fakeLogger();
    const ex = new ToolExecutor(registry, { authorize: async () => true, logger: log });

    await ex.execute('safe.tool', { v: '机密内容' }, { sessionId: 's1', agentId: 'a1', toolCallId: 't1', emit: () => {} });

    const [, fields] = log.info.mock.calls[0] as [string, Record<string, unknown>];
    expect(fields.args).toBeUndefined();
    expect(fields.result).toBeUndefined();
    expect(fields.data).toBeUndefined();
    expect(JSON.stringify(fields)).not.toContain('机密内容');
  });

  it('工具返回失败结果时以 warn 级别记录，并带 error 字段', async () => {
    registry.register({
      ...safeTool(),
      name: 'fail.tool',
      execute: async () => ({ ok: false, error: '磁盘满了' }),
    });
    const log = fakeLogger();
    const ex = new ToolExecutor(registry, { authorize: async () => true, logger: log });

    await ex.execute('fail.tool', {}, { sessionId: 's1', agentId: 'a1', toolCallId: 't1', emit: () => {} });

    expect(log.info).not.toHaveBeenCalled();
    expect(log.warn).toHaveBeenCalledTimes(1);
    const [msg, fields] = log.warn.mock.calls[0] as [string, Record<string, unknown>];
    expect(msg).toBe('tool_exec');
    expect(fields.tool).toBe('fail.tool');
    expect(fields.ok).toBe(false);
    expect(fields.error).toBe('磁盘满了');
    expect(typeof fields.durationMs).toBe('number');
  });

  it('工具抛异常时以 error 级别记录，并带 error 字段', async () => {
    registry.register({
      ...safeTool(),
      name: 'boom.tool',
      execute: async () => {
        throw new Error('炸了');
      },
    });
    const log = fakeLogger();
    const ex = new ToolExecutor(registry, { authorize: async () => true, logger: log });

    await ex.execute('boom.tool', {}, { sessionId: 's1', agentId: 'a1', toolCallId: 't1', emit: () => {} });

    expect(log.error).toHaveBeenCalledTimes(1);
    const [msg, fields] = log.error.mock.calls[0] as [string, Record<string, unknown>];
    expect(msg).toBe('tool_exec');
    expect(fields.tool).toBe('boom.tool');
    expect(fields.ok).toBe(false);
    expect(fields.error).toContain('炸了');
  });

  it('工具未注册时同样记录日志', async () => {
    const log = fakeLogger();
    const ex = new ToolExecutor(registry, { authorize: async () => true, logger: log });

    await ex.execute('ghost', {}, { sessionId: 's1', agentId: 'a1', toolCallId: 't1', emit: () => {} });

    expect(log.warn).toHaveBeenCalledTimes(1);
    const [, fields] = log.warn.mock.calls[0] as [string, Record<string, unknown>];
    expect(fields.tool).toBe('ghost');
    expect(fields.ok).toBe(false);
  });

  it('未授权拒绝执行时记录日志', async () => {
    registry.register({ ...safeTool(), name: 'danger.tool', permission: 'dangerous' });
    const log = fakeLogger();
    const ex = new ToolExecutor(registry, { authorize: async () => false, logger: log });

    await ex.execute('danger.tool', {}, { sessionId: 's1', agentId: 'a1', toolCallId: 't1', emit: () => {} });

    expect(log.warn).toHaveBeenCalledTimes(1);
    const [, fields] = log.warn.mock.calls[0] as [string, Record<string, unknown>];
    expect(fields.tool).toBe('danger.tool');
    expect(fields.ok).toBe(false);
    expect(String(fields.error)).toContain('未获授权');
  });

  it('未注入 logger 时执行不受影响', async () => {
    registry.register(safeTool());
    const ex = new ToolExecutor(registry, { authorize: async () => true });
    const res = await ex.execute('safe.tool', {}, { sessionId: 's1', agentId: 'a1', toolCallId: 't1', emit: () => {} });
    expect(res.ok).toBe(true);
  });
});
