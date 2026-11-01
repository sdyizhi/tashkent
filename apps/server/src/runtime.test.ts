import { describe, expect, it } from 'vitest';
import { createRuntime } from './runtime.js';
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
