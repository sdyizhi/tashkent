import type { ToolDefinition } from '@tashkent/shared';

export interface AuthzDecision {
  allowed: boolean;
  /** 记住授权后的凭据，前端授权确认时携带 */
  authorizationId?: string;
}

/**
 * 授权决策服务。
 * v1 规则：
 *  - safe 工具：始终允许
 *  - write 工具：一旦被用户授权过则记住
 *  - dangerous 工具：每次都需要重新授权
 */
export class AuthzService {
  private readonly remembered = new Set<string>();
  private readonly pending = new Map<string, { toolName: string; resolve: (ok: boolean) => void }>();

  /** 由前端调用 /api/tools/:name/authorize 时触发 */
  resolvePending(authorizationId: string, approved: boolean, remember: boolean): boolean {
    const entry = this.pending.get(authorizationId);
    if (!entry) return false;
    this.pending.delete(authorizationId);
    if (approved && remember && entry.toolName) this.remembered.add(entry.toolName);
    entry.resolve(approved);
    return true;
  }

  async request(tool: ToolDefinition): Promise<AuthzDecision> {
    if (tool.permission === 'safe') return { allowed: true };
    if (tool.permission === 'write' && this.remembered.has(tool.name)) {
      return { allowed: true };
    }
    return { allowed: false };
  }
}
