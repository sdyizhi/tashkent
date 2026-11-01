import { useEffect, useState } from 'react';
import type { PublicConfig, StatsResponse } from '@tashkent/shared';

interface Props {
  /** SSE 事件流是否已连接 */
  connected: boolean;
  onClose: () => void;
}

interface BubbleState {
  config: PublicConfig | null;
  stats: StatsResponse | null;
  error: string | null;
}

/**
 * XP 风格托盘气泡。
 *
 * 点击托盘图标弹出，显示连接状态、当前模型与已加载的 Agent 数量；
 * 数据来自 /api/config 与 /api/stats。
 */
export default function XPTrayBubble({ connected, onClose }: Props) {
  const [state, setState] = useState<BubbleState>({ config: null, stats: null, error: null });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [cfgRes, statsRes] = await Promise.all([
          fetch('/api/config'),
          fetch('/api/stats'),
        ]);
        if (!cfgRes.ok || !statsRes.ok) throw new Error(String(cfgRes.status || statsRes.status));
        const cfg = (await cfgRes.json()) as PublicConfig;
        const stats = (await statsRes.json()) as StatsResponse;
        if (cancelled) return;
        setState({ config: cfg, stats, error: null });
      } catch {
        if (!cancelled) setState({ config: null, stats: null, error: '无法连接到服务端' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const agentCount = state.stats?.agents.length ?? 0;

  return (
    <div className="xp-tray-bubble xp-tray-popup" data-testid="tray-bubble">
      <div className="xp-tray-bubble-header">Tashkent 状态</div>

      <div className="xp-tray-bubble-body">
        <div className="xp-tray-bubble-row">
          <span className="xp-tray-bubble-label">连接状态</span>
          <span
            className="xp-tray-bubble-value"
            data-testid="bubble-connection"
            data-connected={connected ? 'true' : 'false'}
          >
            {connected ? '已连接' : '未连接'}
          </span>
        </div>

        <div className="xp-tray-bubble-row">
          <span className="xp-tray-bubble-label">当前模型</span>
          <span className="xp-tray-bubble-value" data-testid="bubble-model">
            {state.config?.model ?? '—'}
          </span>
        </div>

        <div className="xp-tray-bubble-row">
          <span className="xp-tray-bubble-label">已加载 Agent</span>
          <span className="xp-tray-bubble-value" data-testid="bubble-agent-count">
            {state.stats ? `${agentCount} 个` : '—'}
          </span>
        </div>

        {state.error ? (
          <div className="xp-tray-bubble-error" data-testid="bubble-error">
            {state.error}
          </div>
        ) : null}
      </div>

      <div className="xp-tray-bubble-footer">
        <button
          type="button"
          className="xp-calendar-close-btn"
          data-testid="bubble-close"
          onClick={onClose}
        >
          关闭
        </button>
      </div>
    </div>
  );
}
