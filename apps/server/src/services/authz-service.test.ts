import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { ToolDefinition, ToolPermission } from '@tashkent/shared';
import { AuthzService } from './authz-service.js';

function makeTool(name: string, permission: ToolPermission): ToolDefinition {
  return {
    name,
    description: `${name} 测试工具`,
    inputSchema: z.object({}),
    permission,
    execute: async () => ({ ok: true }),
  };
}

/** 让微任务与计时器跑完，确认挂起的 Promise 尚未结算 */
async function flush(): Promise<void> {
  await new Promise((r) => setTimeout(r, 0));
}

describe('AuthzService', () => {
  it('safe 工具立即放行', async () => {
    const svc = new AuthzService();
    const decision = await svc.request(makeTool('fs.read', 'safe'));
    expect(decision.allowed).toBe(true);
  });

  it('safe 工具不会发起授权请求', async () => {
    const svc = new AuthzService();
    let asked = false;
    await svc.request(makeTool('fs.read', 'safe'), () => {
      asked = true;
    });
    expect(asked).toBe(false);
  });

  it('write 工具首次请求挂起，授权并记住后放行', async () => {
    const svc = new AuthzService();
    const tool = makeTool('fs.write', 'write');
    const ids: string[] = [];

    let settled = false;
    const pending = svc.request(tool, (info) => ids.push(info.authorizationId)).then((d) => {
      settled = true;
      return d;
    });

    await flush();
    expect(settled).toBe(false);
    expect(ids).toHaveLength(1);
    expect(ids[0]).toBeTruthy();

    expect(svc.resolvePending(ids[0]!, true, true)).toBe(true);
    const decision = await pending;
    expect(decision.allowed).toBe(true);
  });

  it('write 工具记住授权后第二次直接放行且不再请求授权', async () => {
    const svc = new AuthzService();
    const tool = makeTool('fs.write', 'write');
    const ids: string[] = [];

    const pending = svc.request(tool, (info) => ids.push(info.authorizationId));
    svc.resolvePending(ids[0]!, true, true);
    expect((await pending).allowed).toBe(true);

    let asked = false;
    const again = await svc.request(tool, () => {
      asked = true;
    });
    expect(again.allowed).toBe(true);
    expect(asked).toBe(false);
  });

  it('write 工具被拒绝后不记住，下次仍需授权', async () => {
    const svc = new AuthzService();
    const tool = makeTool('fs.write', 'write');
    const ids: string[] = [];

    const pending = svc.request(tool, (info) => ids.push(info.authorizationId));
    expect(svc.resolvePending(ids[0]!, false, false)).toBe(true);
    expect((await pending).allowed).toBe(false);

    let settled = false;
    const second = svc.request(tool, (info) => ids.push(info.authorizationId)).then((d) => {
      settled = true;
      return d;
    });
    await flush();
    expect(settled).toBe(false);
    expect(ids).toHaveLength(2);

    svc.resolvePending(ids[1]!, true, false);
    expect((await second).allowed).toBe(true);
  });

  it('dangerous 工具即使记住过也每次都要重新授权', async () => {
    const svc = new AuthzService();
    const tool = makeTool('shell.exec', 'dangerous');
    const ids: string[] = [];

    const first = svc.request(tool, (info) => ids.push(info.authorizationId));
    expect(svc.resolvePending(ids[0]!, true, true)).toBe(true);
    expect((await first).allowed).toBe(true);

    let settled = false;
    const second = svc.request(tool, (info) => ids.push(info.authorizationId)).then((d) => {
      settled = true;
      return d;
    });
    await flush();
    expect(settled).toBe(false);
    expect(ids).toHaveLength(2);

    expect(svc.resolvePending(ids[1]!, true, true)).toBe(true);
    expect((await second).allowed).toBe(true);
  });

  it('授权请求超时后返回 false 并清理 pending', async () => {
    vi.useFakeTimers();
    try {
      const svc = new AuthzService({ timeoutMs: 1000 });
      const tool = makeTool('shell.exec', 'dangerous');
      const ids: string[] = [];

      const pending = svc.request(tool, (info) => ids.push(info.authorizationId));
      await vi.advanceTimersByTimeAsync(1000);

      const decision = await pending;
      expect(decision.allowed).toBe(false);
      // pending 已清理：同一个 authorizationId 无法再被解决
      expect(svc.resolvePending(ids[0]!, true, false)).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('resolvePending 传入不存在的 authorizationId 返回 false', () => {
    const svc = new AuthzService();
    expect(svc.resolvePending('not-exist', true, true)).toBe(false);
  });

  it('同一个 authorizationId 只能被解决一次', async () => {
    const svc = new AuthzService();
    const tool = makeTool('fs.write', 'write');
    const ids: string[] = [];

    const pending = svc.request(tool, (info) => ids.push(info.authorizationId));
    expect(svc.resolvePending(ids[0]!, true, false)).toBe(true);
    expect(svc.resolvePending(ids[0]!, true, false)).toBe(false);
    expect((await pending).allowed).toBe(true);
  });
});
