import { useCallback, useEffect, useState } from 'react';
import type { PublicConfig, StatsResponse } from '@tashkent/shared';
import { useDesktopStore } from '../state/desktopStore.js';

interface SettingsAppProps {
  sessionId?: string;
}

/** 权限级别的中文说明 */
const PERMISSION_LABEL: Record<string, string> = {
  safe: '安全（自动执行）',
  write: '写入（需确认）',
  dangerous: '危险（需逐次授权）',
};

/**
 * 控制面板。
 *
 * 三组设置：
 *  - 模型：当前模型 / 最大步数 / 温度（只读，服务端配置）
 *  - 工具授权：所有工具及其权限级别，dangerous 醒目标记
 *  - 桌面状态：清空图标布局、关闭全部窗口
 */
export default function SettingsApp({ sessionId }: SettingsAppProps) {
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const icons = useDesktopStore((s) => s.icons);
  const setIcons = useDesktopStore((s) => s.setIcons);
  const windows = useDesktopStore((s) => s.windows);
  const close = useDesktopStore((s) => s.close);

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
        const st = (await statsRes.json()) as StatsResponse;
        if (cancelled) return;
        setConfig(cfg);
        setStats(st);
        setError(null);
      } catch {
        if (!cancelled) setError('无法连接到服务端');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /** 清空图标布局（恢复为注册表派生的默认位置） */
  const clearIcons = useCallback(() => {
    setIcons([]);
    setNotice('已清空图标布局，刷新后将恢复默认位置。');
  }, [setIcons]);

  /** 关闭全部窗口 */
  const closeAll = useCallback(async () => {
    const all = useDesktopStore.getState().windows;
    if (all.length === 0) {
      setNotice('当前没有打开的窗口。');
      return;
    }
    for (const w of all) await close(w.id);
    setNotice(`已关闭 ${all.length} 个窗口。`);
  }, [close]);

  return (
    <div className="xp-settings">
      {error ? (
        <div className="xp-list-hint error" data-testid="settings-error">
          {error}
        </div>
      ) : null}

      <section className="xp-settings-section" data-testid="settings-model">
        <h3 className="xp-settings-title">模型</h3>
        <table className="xp-settings-table">
          <tbody>
            <tr>
              <th>提供商</th>
              <td>{config?.provider ?? '—'}</td>
            </tr>
            <tr>
              <th>模型</th>
              <td>{config?.model ?? '—'}</td>
            </tr>
            <tr>
              <th>最大步数</th>
              <td>{config?.maxSteps ?? '—'}</td>
            </tr>
            <tr>
              <th>温度</th>
              <td>{config?.temperature ?? '—'}</td>
            </tr>
            <tr>
              <th>最大输出</th>
              <td>{config?.maxOutputTokens ?? '—'}</td>
            </tr>
            <tr>
              <th>上下文保留轮数</th>
              <td>{config?.contextKeepTurns ?? '—'}</td>
            </tr>
            <tr>
              <th>shell 工具</th>
              <td>{config?.shellEnabled ? '已启用' : '未启用'}</td>
            </tr>
            <tr>
              <th>允许域名</th>
              <td>{config?.allowedDomains?.join('、') || '（无）'}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className="xp-settings-section" data-testid="settings-tools">
        <h3 className="xp-settings-title">工具授权</h3>
        <table className="xp-settings-table">
          <tbody>
            {(stats?.tools ?? []).map((t) => (
              <tr
                key={t.name}
                data-testid={`settings-tool-${t.name}`}
                data-permission={t.permission}
                data-danger={t.permission === 'dangerous' ? 'true' : 'false'}
              >
                <th>{t.name}</th>
                <td>{t.description}</td>
                <td>{t.permission}</td>
                <td>{PERMISSION_LABEL[t.permission] ?? t.permission}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {stats && stats.tools.length === 0 ? (
          <div className="xp-list-hint">没有已注册的工具</div>
        ) : null}
      </section>

      <section className="xp-settings-section" data-testid="settings-desktop">
        <h3 className="xp-settings-title">桌面状态</h3>
        <div className="xp-settings-actions">
          <button
            type="button"
            className="xp-btn"
            data-testid="settings-clear-icons"
            onClick={clearIcons}
          >
            清空图标布局
          </button>
          <button
            type="button"
            className="xp-btn"
            data-testid="settings-close-windows"
            onClick={() => void closeAll()}
          >
            关闭全部窗口
          </button>
        </div>
        <div className="xp-list-hint">
          图标 {icons.length} 个 · 窗口 {windows.length} 个
          {sessionId ? ` · 会话 ${sessionId}` : ''}
        </div>
        {notice ? (
          <div className="xp-list-hint" data-testid="settings-notice">
            {notice}
          </div>
        ) : null}
      </section>
    </div>
  );
}
