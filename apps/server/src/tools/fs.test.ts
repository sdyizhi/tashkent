import { beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { z } from 'zod';
import { createFsTools } from './fs.js';

let root: string;
let tools: ReturnType<typeof createFsTools>;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'tashkent-'));
  fs.mkdirSync(path.join(root, 'notes'), { recursive: true });
  fs.writeFileSync(path.join(root, 'notes', 'a.txt'), 'hello', 'utf-8');
  tools = createFsTools(root);
});

function tool(name: string) {
  const t = tools.find((x) => x.name === name);
  if (!t) throw new Error(`tool ${name} missing`);
  return t;
}

const ctx = { sessionId: 's1', agentId: 'a1', toolCallId: 't1', emit: () => {} };

describe('fs.read', () => {
  it('读取沙箱内文件成功', async () => {
    const res = await tool('fs.read').execute({ path: 'notes/a.txt' }, ctx);
    expect(res.ok).toBe(true);
    expect(res.data).toMatchObject({ content: 'hello' });
  });

  it('拒绝路径穿越 ../../etc/passwd', async () => {
    const res = await tool('fs.read').execute({ path: '../../etc/passwd' }, ctx);
    expect(res.ok).toBe(false);
    expect(res.error).toContain('非法路径');
  });

  it('拒绝绝对路径逃逸', async () => {
    const res = await tool('fs.read').execute({ path: 'C:/Windows/system.ini' }, ctx);
    expect(res.ok).toBe(false);
    expect(res.error).toContain('非法路径');
  });

  it('读取不存在的文件返回错误', async () => {
    const res = await tool('fs.read').execute({ path: 'missing.txt' }, ctx);
    expect(res.ok).toBe(false);
  });
});

describe('fs.write', () => {
  it('写入新文件', async () => {
    const res = await tool('fs.write').execute({ path: 'notes/b.txt', content: 'world' }, ctx);
    expect(res.ok).toBe(true);
    expect(fs.readFileSync(path.join(root, 'notes', 'b.txt'), 'utf-8')).toBe('world');
  });

  it('写入穿越路径被拒绝且不落盘', async () => {
    const res = await tool('fs.write').execute({ path: '../evil.txt', content: 'x' }, ctx);
    expect(res.ok).toBe(false);
    expect(fs.existsSync(path.join(path.dirname(root), 'evil.txt'))).toBe(false);
  });
});

describe('fs.list', () => {
  it('列出目录内容', async () => {
    const res = await tool('fs.list').execute({ path: 'notes' }, ctx);
    expect(res.ok).toBe(true);
    expect(JSON.stringify(res.data)).toContain('a.txt');
  });
});
