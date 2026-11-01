import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';

describe('loadConfig', () => {
  it('缺省时给出可用的默认配置', () => {
    const cfg = loadConfig({});
    expect(cfg.port).toBe(8080);
    expect(cfg.maxSteps).toBe(8);
    expect(cfg.shellEnabled).toBe(false);
  });

  it('LLM_API_KEY 缺失时 apiKey 为空但其余字段正常', () => {
    const cfg = loadConfig({});
    expect(cfg.apiKey).toBe('');
    expect(cfg.model).toBe('gpt-4o-mini');
  });

  it('解析数字型环境变量', () => {
    const cfg = loadConfig({ PORT: '9000', MAX_STEPS: '3' });
    expect(cfg.port).toBe(9000);
    expect(cfg.maxSteps).toBe(3);
  });

  it('解析 ALLOWED_DOMAINS 为数组并去空白', () => {
    const cfg = loadConfig({ ALLOWED_DOMAINS: 'a.com, *.b.com ,' });
    expect(cfg.allowedDomains).toEqual(['a.com', '*.b.com']);
  });

  it('shellEnabled 接受字符串 "true"', () => {
    expect(loadConfig({ SHELL_ENABLED: 'true' }).shellEnabled).toBe(true);
    expect(loadConfig({ SHELL_ENABLED: 'false' }).shellEnabled).toBe(false);
  });
});
