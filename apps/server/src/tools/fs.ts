import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import type { ToolDefinition } from '@tashkent/shared';

const MAX_READ_BYTES = 256 * 1024;

export function resolveInSandbox(root: string, userPath: string): string {
  const cleaned = userPath.replace(/\\/g, '/').replace(/^\/+/, '');
  if (/^[a-zA-Z]:/.test(cleaned) || cleaned.includes('..')) {
    throw new Error(`非法路径: ${userPath}`);
  }
  const abs = path.resolve(root, cleaned);
  const rootAbs = path.resolve(root);
  if (abs !== rootAbs && !abs.startsWith(rootAbs + path.sep)) {
    throw new Error(`非法路径: ${userPath}`);
  }
  return abs;
}

export function createFsTools(root: string): ToolDefinition[] {
  const readTool: ToolDefinition = {
    name: 'fs.read',
    description: '读取工作区内的文本文件，返回内容',
    inputSchema: z.object({ path: z.string().describe('相对工作区根目录的路径') }),
    permission: 'safe',
    timeoutMs: 10000,
    execute: async (input: { path: string }) => {
      try {
        const abs = resolveInSandbox(root, input.path);
        const stat = fs.statSync(abs);
        if (!stat.isFile()) return { ok: false, error: '目标不是文件' };
        if (stat.size > MAX_READ_BYTES) {
          return { ok: false, error: `文件过大 (${stat.size} bytes)` };
        }
        const content = fs.readFileSync(abs, 'utf-8');
        return { ok: true, data: { path: input.path, content }, summary: `已读取 ${input.path}` };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { ok: false, error: message };
      }
    },
  };

  const writeTool: ToolDefinition = {
    name: 'fs.write',
    description: '在工作区内写入文本文件（会覆盖同名文件）',
    inputSchema: z.object({
      path: z.string().describe('相对工作区根目录的路径'),
      content: z.string().describe('文件内容'),
    }),
    permission: 'write',
    timeoutMs: 10000,
    execute: async (input: { path: string; content: string }, ctx) => {
      try {
        const abs = resolveInSandbox(root, input.path);
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.writeFileSync(abs, input.content, 'utf-8');
        ctx.emit({
          type: 'desktop_file_created',
          sessionId: ctx.sessionId,
          path: input.path,
          name: path.basename(input.path),
        });
        return { ok: true, data: { path: input.path }, summary: `已写入 ${input.path}` };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { ok: false, error: message };
      }
    },
  };

  const listTool: ToolDefinition = {
    name: 'fs.list',
    description: '列出工作区内某个目录的内容',
    inputSchema: z.object({ path: z.string().describe('相对工作区根目录的路径，根目录用 "."') }),
    permission: 'safe',
    timeoutMs: 10000,
    execute: async (input: { path: string }) => {
      try {
        const abs = resolveInSandbox(root, input.path === '' ? '.' : input.path);
        const entries = fs.readdirSync(abs, { withFileTypes: true }).map((e) => ({
          name: e.name,
          type: e.isDirectory() ? 'dir' : 'file',
        }));
        return { ok: true, data: { path: input.path, entries }, summary: `列出 ${input.path}` };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { ok: false, error: message };
      }
    },
  };

  return [readTool, writeTool, listTool];
}
