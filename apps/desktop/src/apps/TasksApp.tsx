import { useEffect, useState } from 'react';
import type { StatsResponse } from '@tashkent/shared';

interface TasksAppProps {
  sessionId?: string;
}

/** 统计刷新间隔（毫秒） */
const REFRESH_INTERVAL_MS = 3000;

/** 把秒数格式化成「1 小时 2 分」这样的可读时长 */
export function formatUptime(sec: number): string {
  if (sec < 60) return `${sec} 秒`;
  const minutes = Math.floor(sec / 60);
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  if (hours < 24) return `${hours} 小时 ${restMinutes} 分`;
  const days = Math.floor(hours / 24);
  return `${days} 天 ${hours % 24} 小时`;
}

/**
 * 任务管理器。
 *
 * 展示运行中的 Agent、已注册工具与会话数量、资源占用，
 * 每 3 秒轮询一次 /api/stats 刷新。
 */
export default function TasksApp({ sessionId }: TasksAppProps) {
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch('/api/stats');
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as StatsResponse;
        if (cancelled) return;
        setStats(body);
        setError(null);
      } catch {
        if (!cancelled) setError('无法连接到服务端');
      }
    };
    void load();
    const timer = setInterval(() => void load(), REFRESH_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  return (
    <div className="xp-tasks">
      {error ? (
        <div className="xp-list-hint error" data-testid="tasks-error">
          {error}
        </div>
      ) : null}

      <div className="xp-tasks-summary" data-testid="tasks-summary">
        <span>会话 {stats?.sessions ?? '—'}</span>
        <span>运行时长 {stats ? formatUptime(stats.uptimeSec) : '—'}</span>
        <span>内存 {stats ? `${stats.memoryMb} MB` : '—'}</span>
        {sessionId ? <span>会话 {sessionId}</span> : null}
      </div>

      <section className="xp-settings-section" data-testid="tasks-agents">
        <h3 className="xp-settings-title">Agent（{stats?.agents.length ?? 0}）</h3>
        <table className="xp-settings-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>名称</th>
              <th>可用工具数</th>
            </tr>
          </thead>
          <tbody>
            {(stats?.agents ?? []).map((a) => (
              <tr key={a.id} data-testid={`tasks-agent-${a.id}`}>
                <td>{a.id}</td>
                <td>
                  {a.icon} {a.name}
                </td>
                <td>{a.toolIds.length}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="xp-settings-section" data-testid="tasks-tools">
        <h3 className="xp-settings-title">工具（{stats?.tools.length ?? 0}）</h3>
        <table className="xp-settings-table">
          <thead>
            <tr>
              <th>名称</th>
              <th>权限</th>
            </tr>
          </thead>
          <tbody>
            {(stats?.tools ?? []).map((t) => (
              <tr
                key={t.name}
                data-testid={`tasks-tool-${t.name}`}
                data-permission={t.permission}
                data-danger={t.permission === 'dangerous' ? 'true' : 'false'}
              >
                <td>{t.name}</td>
                <td>{t.permission}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
