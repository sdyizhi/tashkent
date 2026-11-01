import type { AgentEvent, ToolContext, ToolDefinition, ToolResult } from '@tashkent/shared';
import type { ToolRegistry } from './tool-registry.js';

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
}

export class ToolExecutor {
  constructor(
    private readonly registry: ToolRegistry,
    private readonly deps: ExecutorDeps,
  ) {}

  async execute(
    name: string,
    args: unknown,
    ctx: Omit<ToolContext, 'toolCallId'> & { toolCallId: string },
  ): Promise<ToolResult> {
    const tool = this.registry.get(name);
    if (!tool) {
      return { ok: false, error: `工具未注册: ${name}` };
    }

    if (tool.permission !== 'safe') {
      const allowed = await this.deps.authorize(tool, {
        sessionId: ctx.sessionId,
        toolCallId: ctx.toolCallId,
        args,
        emit: ctx.emit,
      });
      if (!allowed) {
        return { ok: false, error: `工具 ${name} 未获授权，已拒绝执行` };
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
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: message };
    }
  }
}
