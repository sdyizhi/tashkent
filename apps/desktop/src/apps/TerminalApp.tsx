import { useCallback, useEffect, useRef, useState } from 'react';
import type { PublicConfig } from '@tashkent/shared';

interface TerminalAppProps {
  sessionId?: string;
}

/**
 * 命令提示符。
 *
 * 命令由 Agent 调用 shell.exec 工具执行（dangerous 权限，需逐次人工授权，
 * 会触发桌面上的授权确认对话框）。
 *
 * SHELL_ENABLED=false 时如实告知「shell 工具未启用」，不假装能执行。
 */
export default function TerminalApp({ sessionId }: TerminalAppProps) {
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [input, setInput] = useState('');
  const [lines, setLines] = useState<string[]>([]);
  const sidRef = useRef<string | undefined>(sessionId);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/config');
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as PublicConfig;
        if (!cancelled) setConfig(body);
      } catch {
        // 拿不到配置时按「未启用」处理：宁可说不可用，也不假装能执行
        if (!cancelled) setConfig(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /** 提交命令给 Agent 执行 */
  const run = useCallback(async () => {
    const command = input.trim();
    if (!command) return;
    setInput('');
    setLines((list) => [...list, `> ${command}`]);
    try {
      let sid = sidRef.current;
      if (!sid) {
        const created = await fetch('/api/sessions', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ agentId: 'shell-agent' }),
        });
        if (!created.ok) throw new Error('创建会话失败');
        const body = (await created.json()) as { id: string };
        sid = body.id;
        sidRef.current = sid;
      }
      const res = await fetch(`/api/sessions/${sid}/messages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: `执行命令：${command}` }),
      });
      if (!res.ok) throw new Error('提交命令失败');
      setLines((list) => [...list, '已提交，等待 Agent 执行（危险工具需确认授权）…']);
    } catch (err) {
      setLines((list) => [...list, err instanceof Error ? err.message : '提交失败']);
    }
  }, [input]);

  const shellEnabled = config?.shellEnabled === true;

  return (
    <div className="xp-terminal">
      <div className="xp-terminal-output" data-testid="terminal-output">
        {lines.map((line, i) => (
          <div key={i}>{line}</div>
        ))}
        {lines.length === 0 ? <div>Microsoft Windows XP [Tashkent 受限命令环境]</div> : null}
      </div>
      {shellEnabled ? null : (
        <div className="xp-list-hint error" data-testid="terminal-disabled">
          shell 工具未启用（SHELL_ENABLED=false）。如需执行命令，请在服务端 .env 中开启
          SHELL_ENABLED 与 SHELL_ALLOWED，并重启服务。
        </div>
      )}
      <div className="xp-terminal-input-row">
        <span className="xp-terminal-prompt">&gt;</span>
        <input
          className="xp-terminal-input"
          data-testid="terminal-input"
          value={input}
          disabled={!shellEnabled}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void run();
          }}
        />
        <button
          type="button"
          className="xp-btn"
          data-testid="terminal-run"
          disabled={!shellEnabled || input.trim() === ''}
          onClick={() => void run()}
        >
          执行
        </button>
      </div>
      <div className="xp-statusbar">
        {shellEnabled
          ? `允许的命令：${config?.shellAllowed?.join('、') || '（无）'}`
          : 'shell 未启用'}
        {sessionId ? ` · 会话 ${sessionId}` : ''}
      </div>
    </div>
  );
}
