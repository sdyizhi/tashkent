import { spawn } from 'node:child_process';
import { z } from 'zod';
import type { ToolDefinition } from '@tashkent/shared';

export interface ShellOptions {
  enabled: boolean;
  allowed: string[];
  cwd?: string;
}

export function createShellTools(opts: ShellOptions): ToolDefinition[] {
  const execTool: ToolDefinition = {
    name: 'shell.exec',
    description: '执行受限的命令（默认关闭，需显式开启并逐次授权）',
    inputSchema: z.object({
      command: z.string().describe('可执行文件名，不含参数'),
      args: z.array(z.string()).optional().describe('参数数组'),
      cwd: z.string().optional(),
    }),
    permission: 'dangerous',
    timeoutMs: 60000,
    execute: async (input: { command: string; args?: string[]; cwd?: string }) => {
      if (!opts.enabled) {
        return { ok: false, error: 'shell 工具未启用（SHELL_ENABLED=false）' };
      }
      if (!opts.allowed.includes(input.command)) {
        return { ok: false, error: `命令 ${input.command} 不在允许列表中，不允许执行` };
      }
      const args = input.args ?? [];
      if (args.some((a) => /[;&|`$><]/.test(a))) {
        return { ok: false, error: '参数包含被禁止的 shell 元字符' };
      }
      return new Promise((resolve) => {
        // 数组参数直接传 execFile，不经过 shell，杜绝注入
        const child = spawn(input.command, args, {
          cwd: opts.cwd,
          shell: false,
          windowsHide: true,
        });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (d) => {
          stdout += String(d);
        });
        child.stderr.on('data', (d) => {
          stderr += String(d);
        });
        const timer = setTimeout(() => {
          child.kill();
          resolve({ ok: false, error: '命令执行超时' });
        }, 60000);
        child.on('error', (err) => {
          clearTimeout(timer);
          resolve({ ok: false, error: err.message });
        });
        child.on('close', (code) => {
          clearTimeout(timer);
          if (code === 0) {
            resolve({ ok: true, data: { stdout, exitCode: code }, summary: '命令执行成功' });
          } else {
            resolve({ ok: false, error: `命令退出码 ${code}: ${stderr.slice(0, 500)}` });
          }
        });
      });
    },
  };
  return [execTool];
}
