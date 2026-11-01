import { useState } from 'react';
import type { AgentEvent } from '@tashkent/shared';

export type AuthorizationRequest = Extract<AgentEvent, { type: 'authorization_required' }>;

interface Props {
  /** 当前待用户决策的授权请求；null 表示没有待决请求 */
  request: AuthorizationRequest | null;
  /** 用户给出决策：approved 是否放行，remember 是否记住该工具 */
  onDecide: (approved: boolean, remember: boolean) => void;
}

/** 把工具参数整理成可读文本 */
function formatArgs(args: unknown): string {
  if (args === undefined || args === null) return '';
  if (typeof args !== 'object') return String(args);
  return Object.entries(args as Record<string, unknown>)
    .map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
    .join('\n');
}

/**
 * XP 风格授权确认对话框。
 *
 * 服务端在 write / dangerous 工具执行前挂起，并广播 authorization_required 事件；
 * 用户在此给出「同意 / 拒绝」的决策后，由调用方回传给服务端。
 */
export default function AuthorizationDialog({ request, onDecide }: Props) {
  const [remember, setRemember] = useState(false);

  if (!request) return null;

  const argsText = formatArgs(request.args);

  return (
    <div className="xp-modal-mask" data-testid="authorization-dialog">
      <div className="xp-dialog" role="dialog" aria-label="授权确认">
        <div className="xp-dialog-title">
          <span className="xp-dialog-icon" aria-hidden="true">
            ⚠️
          </span>
          <span>授权确认</span>
        </div>
        <div className="xp-dialog-body">
          <div className="xp-dialog-message">{request.reason}</div>
          <div className="xp-dialog-detail">
            <strong>工具：</strong>
            {request.toolName}
          </div>
          {argsText ? (
            <pre className="xp-dialog-args" data-testid="authorization-args">
              {argsText}
            </pre>
          ) : null}
          <label className="xp-dialog-remember">
            <input
              type="checkbox"
              data-testid="authorization-remember"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
            />
            记住此工具的授权（本次会话内不再询问）
          </label>
        </div>
        <div className="xp-dialog-buttons">
          <button
            type="button"
            className="xp-btn xp-dialog-btn"
            data-testid="authorization-deny"
            onClick={() => onDecide(false, false)}
          >
            拒绝
          </button>
          <button
            type="button"
            className="xp-btn xp-dialog-btn default"
            data-testid="authorization-approve"
            onClick={() => onDecide(true, remember)}
          >
            同意
          </button>
        </div>
      </div>
    </div>
  );
}
