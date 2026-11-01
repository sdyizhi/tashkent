import { z } from 'zod';
import type { ToolDefinition } from '@tashkent/shared';

/** 只允许数字与算术运算符，杜绝 eval 注入 */
const EXPRESSION = /^[0-9+\-*/().\s]+$/;

export function createCalcTools(): ToolDefinition[] {
  return [
    {
      name: 'calc.eval',
      description: '计算算术表达式，例如 (1+2)*3',
      inputSchema: z.object({ expression: z.string().describe('算术表达式，只支持 + - * / ( ) 与数字') }),
      permission: 'safe',
      execute: async (input: { expression: string }) => {
        const expr = input.expression.trim();
        if (!EXPRESSION.test(expr)) {
          return { ok: false, error: '表达式包含非法字符' };
        }
        try {
          const value = Function(`"use strict"; return (${expr});`)() as unknown;
          if (typeof value !== 'number' || !Number.isFinite(value)) {
            return { ok: false, error: '表达式结果不是有限数值' };
          }
          return { ok: true, data: { value }, summary: `${expr} = ${value}` };
        } catch {
          return { ok: false, error: '表达式无法求值' };
        }
      },
    },
  ];
}
