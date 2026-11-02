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

  it('未设置 AUTH_PASSWORD 时口令保护关闭', () => {
    const cfg = loadConfig({});
    expect(cfg.authPassword).toBe('');
    expect(cfg.authCookieSecret).toBe('');
  });

  it('读取 AUTH_PASSWORD 与 AUTH_COOKIE_SECRET', () => {
    const cfg = loadConfig({ AUTH_PASSWORD: 'secret', AUTH_COOKIE_SECRET: 'cookie-secret' });
    expect(cfg.authPassword).toBe('secret');
    expect(cfg.authCookieSecret).toBe('cookie-secret');
  });

  it('限流参数可配且有默认值', () => {
    const def = loadConfig({});
    expect(def.rateLimitWindowMs).toBe(60000);
    expect(def.rateLimitMax).toBe(10);
    const cfg = loadConfig({ RATE_LIMIT_WINDOW_MS: '1000', RATE_LIMIT_MAX: '3' });
    expect(cfg.rateLimitWindowMs).toBe(1000);
    expect(cfg.rateLimitMax).toBe(3);
  });

  it('METRICS_ENABLED 接受字符串 "true"', () => {
    expect(loadConfig({ METRICS_ENABLED: 'true' }).metricsEnabled).toBe(true);
    expect(loadConfig({}).metricsEnabled).toBe(false);
  });
});
