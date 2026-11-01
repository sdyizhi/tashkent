import type { AgentEvent, ToolContext, ToolDefinition, ToolResult } from '@tashkent/shared';
import type { ToolRegistry } from './tool-registry.js';
import type { Logger } from '../lib/logger.js';

/** 发起授权请求时需要携带的上下文 */
export interface AuthorizationInfo {
  sessionId: string;
  toolCallId: string;
  args: unknown;
  /** 事件通道：授权实现用它发出 authorization_required 事件 */
  emit: (event: AgentEvent) => void;
}

export interface ExecutorDeps {
  /**
   * 权限判定。返回 true 表示允许执行。
   * 服务端据此强制校验，不信任前端传来的「已授权」标记。
   */
  authorize: (tool: ToolDefinition, info: AuthorizationInfo) => Promise<boolean>;
  /**
   * 结构化日志出口（设计文档 7.1）。
   * 通过依赖注入传入，保持依赖倒置：执行器不认识全局 logger 单例。
   */
  logger?: Logger;
}

/** 工具执行日志的公共字段 */
interface ToolExecLog {
  tool: string;
  sessionId: string;
  durationMs: number;
  ok: boolean;
  error?: string;
}

export class ToolExecutor {
  constructor(
    private readonly registry: ToolRegistry,
    private readonly deps: ExecutorDeps,
  ) {}

  /**
   * 记录一条工具执行日志。
   *
   * 设计文档 7.1：工具调用的入参出参默认只记录摘要，
   * 因此这里只记录工具名、耗时、成功与否与错误信息。
   */
  private logExec(
    level: 'info' | 'warn' | 'error',
    fields: ToolExecLog,
  ): void {
    this.deps.logger?.[level]('tool_exec', { ...fields });
  }

  async execute(
    name: string,
    args: unknown,
    ctx: Omit<ToolContext, 'toolCallId'> & { toolCallId: string },
  ): Promise<ToolResult> {
    const startedAt = Date.now();
    const tool = this.registry.get(name);
    if (!tool) {
      const error = `工具未注册: ${name}`;
      this.logExec('warn', {
        tool: name,
        sessionId: ctx.sessionId,
        durationMs: Date.now() - startedAt,
        ok: false,
        error,
      });
      return { ok: false, error };
    }

    if (tool.permission !== 'safe') {
      const allowed = await this.deps.authorize(tool, {
        sessionId: ctx.sessionId,
        toolCallId: ctx.toolCallId,
        args,
        emit: ctx.emit,
      });
      if (!allowed) {
        const error = `工具 ${name} 未获授权，已拒绝执行`;
        this.logExec('warn', {
          tool: name,
          sessionId: ctx.sessionId,
          durationMs: Date.now() - startedAt,
          ok: false,
          error,
        });
        return { ok: false, error };
      }
    }

    const timeoutMs = tool.timeoutMs ?? 30000;
    try {
      const result = await Promise.race([
        tool.execute(args, { ...ctx, toolCallId: ctx.toolCallId }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`工具 ${name} 执行超时 (${timeoutMs}ms)`)), timeoutMs),
        ),
      ]);
      if (result.ok) {
        this.logExec('info', {
          tool: name,
          sessionId: ctx.sessionId,
          durationMs: Date.now() - startedAt,
          ok: true,
        });
      } else {
        this.logExec('warn', {
          tool: name,
          sessionId: ctx.sessionId,
          durationMs: Date.now() - startedAt,
          ok: false,
          error: result.error,
        });
      }
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logExec('error', {
        tool: name,
        sessionId: ctx.sessionId,
        durationMs: Date.now() - startedAt,
        ok: false,
        error: message,
      });
      return { ok: false, error: message };
    }
  }
}
