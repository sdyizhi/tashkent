import { randomUUID } from 'node:crypto';
import type { ToolDefinition, ToolPermission } from '@tashkent/shared';

export interface AuthzDecision {
  allowed: boolean;
  /** 本次授权请求的凭据，前端授权确认时携带 */
  authorizationId?: string;
}

/** 授权请求已生成、正在等待用户决策时的回调参数 */
export interface AuthzPendingInfo {
  authorizationId: string;
  toolName: string;
  permission: ToolPermission;
}

export interface AuthzServiceOptions {
  /** 等待用户决策的超时时间，默认 5 分钟 */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * 授权决策服务。
 * v1 规则：
 *  - safe 工具：始终允许
 *  - write 工具：一旦被用户授权过则记住
 *  - dangerous 工具：每次都需要重新授权
 *
 * 授权决策始终在服务端做出：前端只能对服务端生成的 authorizationId 作出
 * 「同意 / 拒绝」的应答，不能自行声称「已授权」。
 */
export class AuthzService {
  private readonly remembered = new Set<string>();
  private readonly pending = new Map<string, { toolName: string; resolve: (ok: boolean) => void }>();
  private readonly timeoutMs: number;

  constructor(options: AuthzServiceOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  /**
   * 由前端调用 /api/tools/:name/authorize 时触发。
   *
   * @param toolName 可选；给出时必须与待决请求的工具名一致，防止串号误批。
   */
  resolvePending(
    authorizationId: string,
    approved: boolean,
    remember: boolean,
    toolName?: string,
  ): boolean {
    const entry = this.pending.get(authorizationId);
    if (!entry) return false;
    if (toolName !== undefined && entry.toolName !== toolName) return false;
    this.pending.delete(authorizationId);
    if (approved && remember) this.remembered.add(entry.toolName);
    entry.resolve(approved);
    return true;
  }

  /**
   * 请求一次授权。
   *
   * - safe 工具：立即放行
   * - write 工具且已记住：立即放行
   * - 其余情况：生成 authorizationId 并挂起，直到用户通过 resolvePending 作出决策；
   *   等待超时则按拒绝处理并清理 pending，避免永久泄漏。
   *
   * @param onPending 待决请求建立后同步回调，用于把 authorizationId 通知前端。
   */
  async request(
    tool: ToolDefinition,
    onPending?: (info: AuthzPendingInfo) => void,
  ): Promise<AuthzDecision> {
    if (tool.permission === 'safe') return { allowed: true };
    if (tool.permission === 'write' && this.remembered.has(tool.name)) {
      return { allowed: true };
    }

    const authorizationId = randomUUID();
    const decision = new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(authorizationId);
        resolve(false);
      }, this.timeoutMs);
      timer.unref?.();
      this.pending.set(authorizationId, {
        toolName: tool.name,
        resolve: (ok) => {
          clearTimeout(timer);
          resolve(ok);
        },
      });
    });

    onPending?.({ authorizationId, toolName: tool.name, permission: tool.permission });
    const allowed = await decision;
    return { allowed, authorizationId };
  }
}
