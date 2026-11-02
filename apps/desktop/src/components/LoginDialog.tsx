import { useState } from 'react';

interface Props {
  /** 登录成功后的回调（通常用于重试原先被拦截的请求） */
  onSuccess: () => void;
}

/**
 * XP 风格口令登录框。
 *
 * 服务端启用 `AUTH_PASSWORD` 后，未登录的请求会收到 401；
 * 此时前端弹出本对话框让用户输入口令，登录成功（拿到会话 Cookie）后重试。
 */
export default function LoginDialog({ onSuccess }: Props) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        onSuccess();
        return;
      }
      const body = (await res.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setError(body?.error?.message ?? `登录失败（${res.status}）`);
    } catch {
      setError('无法连接到服务端');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="xp-modal-mask" data-testid="login-dialog">
      <div className="xp-dialog" role="dialog" aria-label="用户登录">
        <div className="xp-dialog-title">
          <span className="xp-dialog-icon" aria-hidden="true">
            🔒
          </span>
          <span>Tashkent 用户登录</span>
        </div>
        <div className="xp-dialog-body">
          <div className="xp-dialog-message">此工作站已启用口令保护，请输入口令继续。</div>
          <label className="xp-login-field">
            <span>口令：</span>
            <input
              type="password"
              data-testid="login-input"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void submit();
              }}
            />
          </label>
          {error ? (
            <div className="xp-login-error" data-testid="login-error">
              {error}
            </div>
          ) : null}
        </div>
        <div className="xp-dialog-buttons">
          <button
            type="button"
            className="xp-btn xp-dialog-btn default"
            data-testid="login-submit"
            disabled={submitting}
            onClick={() => void submit()}
          >
            确定
          </button>
        </div>
      </div>
    </div>
  );
}
