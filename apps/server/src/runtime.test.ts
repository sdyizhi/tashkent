import { describe, expect, it } from 'vitest';
import { createRuntime } from './runtime.js';
import { createDatabase } from './db/index.js';
import type { AppConfig } from './lib/config.js';

const testConfig: AppConfig = {
  provider: 'openai',
  apiKey: '',
  baseUrl: '',
  model: 'gpt-4o-mini',
  temperature: 0.7,
  maxOutputTokens: 4096,
  maxSteps: 8,
  maxInputTokens: 120000,
  contextKeepTurns: 20,
  toolResultMaxBytes: 8192,
  toolTimeoutMs: 30000,
  maxConcurrentRuns: 4,
  allowedDomains: [],
  shellEnabled: false,
  shellAllowed: [],
  workspaceDir: 'data/workspace',
  artifactsDir: 'data/artifacts',
  dbFile: ':memory:',
  logLevel: 'info',
  metricsEnabled: false,
  port: 8080,
  host: '0.0.0.0',
  version: '1.0.0',
};

describe('createRuntime', () => {
  it('加载内置 agent', () => {
    const rt = createRuntime({ db: undefined as never, config: testConfig });
    expect(rt.registry.list().length).toBeGreaterThan(0);
    expect(rt.registry.get('chat')).toBeTruthy();
  });

  it('注册内置工具', () => {
    const rt = createRuntime({ db: undefined as never, config: testConfig });
    const names = rt.toolRegistry.list().map((t) => t.name);
    expect(names).toContain('fs.read');
    expect(names).toContain('desktop.open_app');
    expect(names).toContain('shell.exec');
  });
});

describe('窗口布局持久化（重启恢复）', () => {
  it('窗口列表落库，新 runtime 实例可恢复', async () => {
    const db = createDatabase(':memory:');
    const rt = createRuntime({ db, config: testConfig });

    const win = rt.windowService.open('chat');
    rt.windowService.update(win.id, { x: 321, y: 234 });

    // 防抖写入：等 200ms 落库
    await new Promise((resolve) => setTimeout(resolve, 350));

    const stored = rt.desktopState.get<unknown[]>('windows', []);
    expect(Array.isArray(stored)).toBe(true);
    expect(stored).toHaveLength(1);
    expect((stored[0] as { id: string }).id).toBe(win.id);

    // 模拟重启：新建 runtime（同一份数据库），窗口应被恢复
    const restarted = createRuntime({ db, config: testConfig });
    const restored = restarted.windowService.list();
    expect(restored).toHaveLength(1);
    expect(restored[0]?.id).toBe(win.id);
    expect(restored[0]?.x).toBe(321);
    expect(restored[0]?.y).toBe(234);
  });

  it('关闭的窗口不会在重启后复活', async () => {
    const db = createDatabase(':memory:');
    const rt = createRuntime({ db, config: testConfig });

    const win = rt.windowService.open('chat');
    rt.windowService.close(win.id);
    await new Promise((resolve) => setTimeout(resolve, 350));

    const restarted = createRuntime({ db, config: testConfig });
    expect(restarted.windowService.list()).toHaveLength(0);
  });
});
