import { useEffect, useState, type ReactNode } from 'react';
import LoginDialog from './LoginDialog.js';

type AuthState = 'checking' | 'ok' | 'required';

/**
 * 口令保护闸门。
 *
 * 服务端启用 `AUTH_PASSWORD` 后，未登录请求会返回 401。
 * 这里启动时探测一次（用免鉴权的 `/api/config`）：
 * - 200 → 未启用口令保护（或已有有效会话），正常渲染桌面；
 * - 401 → 弹出 XP 风格登录框，登录成功后重新探测；
 * - 网络异常 → 后端不可达，不阻塞桌面渲染（离线降级）。
 */
export default function AuthGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>('checking');

  const probe = async (): Promise<void> => {
    try {
      const res = await fetch('/api/config');
      if (res.status === 401) {
        setState('required');
        return;
      }
      setState('ok');
    } catch {
      // 后端不可达：按「无需口令」处理，让桌面先渲染出来
      setState('ok');
    }
  };

  useEffect(() => {
    void probe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (state === 'required') {
    return (
      <LoginDialog
        onSuccess={() => {
          void probe();
        }}
      />
    );
  }

  return <>{children}</>;
}
