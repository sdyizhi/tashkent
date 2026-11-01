import { describe, expect, it } from 'vitest';
import { createHttpTools, isDomainAllowed } from './http.js';
import { createShellTools } from './shell.js';

const ctx = { sessionId: 's1', agentId: 'a1', toolCallId: 't1', emit: () => {} };

describe('isDomainAllowed', () => {
  it('白名单为空时拒绝一切', () => {
    expect(isDomainAllowed('example.com', [])).toBe(false);
  });

  it('精确匹配允许', () => {
    expect(isDomainAllowed('api.example.com', ['api.example.com'])).toBe(true);
  });

  it('不在白名单拒绝', () => {
    expect(isDomainAllowed('evil.com', ['api.example.com'])).toBe(false);
  });

  it('通配符前缀匹配允许', () => {
    expect(isDomainAllowed('a.openai.com', ['*.openai.com'])).toBe(true);
  });

  it('通配符不匹配裸域', () => {
    expect(isDomainAllowed('openai.com', ['*.openai.com'])).toBe(false);
  });
});

describe('http.get', () => {
  it('域名不在白名单时不发起请求', async () => {
    const tools = createHttpTools([]);
    const t = tools.find((x) => x.name === 'http.get')!;
    const res = await t.execute({ url: 'https://evil.com' }, ctx);
    expect(res.ok).toBe(false);
    expect(res.error).toContain('不在白名单');
  });

  it('http.get 权限为 dangerous', () => {
    const tools = createHttpTools([]);
    expect(tools.find((x) => x.name === 'http.get')?.permission).toBe('dangerous');
  });
});

describe('shell.exec', () => {
  it('默认关闭时不执行', async () => {
    const tools = createShellTools({ enabled: false, allowed: [] });
    const t = tools.find((x) => x.name === 'shell.exec')!;
    const res = await t.execute({ command: 'echo', args: ['hi'] }, ctx);
    expect(res.ok).toBe(false);
    expect(res.error).toContain('未启用');
  });

  it('命令不在白名单时拒绝', async () => {
    const tools = createShellTools({ enabled: true, allowed: ['echo'] });
    const t = tools.find((x) => x.name === 'shell.exec')!;
    const res = await t.execute({ command: 'rm', args: ['-rf', '/'] }, ctx);
    expect(res.ok).toBe(false);
    expect(res.error).toContain('不允许');
  });
});
