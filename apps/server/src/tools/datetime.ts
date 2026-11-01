import { z } from 'zod';
import type { ToolDefinition } from '@tashkent/shared';

export function createDateTimeTools(): ToolDefinition[] {
  return [
    {
      name: 'datetime.now',
      description: '获取当前本地时间与 ISO 时间戳',
      inputSchema: z.object({ timezone: z.string().optional().describe('IANA 时区名，如 Asia/Shanghai') }),
      permission: 'safe',
      execute: async (input: { timezone?: string }) => {
        const now = new Date();
        let local = now.toISOString();
        if (input.timezone) {
          try {
            local = now.toLocaleString('zh-CN', { timeZone: input.timezone });
          } catch {
            return { ok: false, error: `非法时区: ${input.timezone}` };
          }
        }
        return {
          ok: true,
          data: { iso: now.toISOString(), epochMs: now.getTime(), local },
          summary: `当前时间 ${local}`,
        };
      },
    },
  ];
}
