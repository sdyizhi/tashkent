import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import type { AgentDefinition, ToolDefinition } from '@tashkent/shared';
import { AgentRegistry } from '../agent/registry.js';
import { ToolRegistry } from '../agent/tool-registry.js';
import { statsRoutes } from './stats.js';

function makeRuntime(): {
  registry: AgentRegistry;
  toolRegistry: ToolRegistry;
  sessions: { list: () => unknown[] };
} {
  const registry = new AgentRegistry();
  registry.register({
    id: 'chat',
    name: '对话',
    icon: '💬',
    description: '通用对话助手',
    systemPrompt: '',
    toolIds: ['fs.read'],
  } as AgentDefinition);

  const toolRegistry = new ToolRegistry();
  toolRegistry.register({
    name: 'fs.read',
    description: '读文件',
    inputSchema: {},
    permission: 'safe',
    execute: async () => ({ ok: true }),
  } as ToolDefinition);

  return {
    registry,
    toolRegistry,
    sessions: { list: () => [{ id: 's1' }, { id: 's2' }] },
  };
}

describe('GET /api/stats', () => {
  it('返回 Agent、工具、会话数与资源占用', async () => {
    const app = new Hono();
    app.route('/', statsRoutes(makeRuntime() as never));

    const res = await app.request('/api/stats');
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      agents: Array<{ id: string; name: string; toolIds: string[] }>;
      tools: Array<{ name: string; permission: string }>;
      sessions: number;
      uptimeSec: number;
      memoryMb: number;
    };
    expect(body.agents).toHaveLength(1);
    expect(body.agents[0]?.id).toBe('chat');
    expect(body.tools[0]?.permission).toBe('safe');
    expect(body.sessions).toBe(2);
    expect(body.uptimeSec).toBeGreaterThanOrEqual(0);
    expect(body.memoryMb).toBeGreaterThan(0);
  });

  it('不泄露 apiKey 等凭据', async () => {
    const app = new Hono();
    app.route('/', statsRoutes(makeRuntime() as never));
    const raw = await (await app.request('/api/stats')).text();
    expect(raw).not.toContain('apiKey');
  });
});
