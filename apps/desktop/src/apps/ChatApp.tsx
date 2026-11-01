import { useEffect, useRef, useState } from 'react';
import { useAgentStream } from '../state/useAgentStream.js';
import XPDialog from '../components/XPDialog.js';

interface Props {
  sessionId?: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
}

let messageSeq = 0;
function nextMessageId(): string {
  messageSeq += 1;
  return `m_${messageSeq}`;
}

/**
 * 对话窗口。
 *
 * 会话创建后把消息交给服务端，服务端执行 Agent 并通过 SSE 推送结果，
 * 这里只负责展示已累积的对话与工具活动。
 */
export default function ChatApp({ sessionId }: Props) {
  const [sid, setSid] = useState<string | undefined>(sessionId);
  const [input, setInput] = useState('');
  const [sent, setSent] = useState<ChatMessage[]>([]);
  const stream = useAgentStream(sid ?? null);
  const listRef = useRef<HTMLDivElement | null>(null);
  /** 已弹出的工具失败提示（对话框） */
  const [toolFailure, setToolFailure] = useState<{ toolName: string; error: string } | null>(null);

  // 工具执行失败以 XP 风格对话框呈现（设计文档 5.6），而非浏览器默认弹窗。
  // 同一次失败只弹一次，避免刷屏。
  const lastReportedFailure = useRef<string | null>(null);
  useEffect(() => {
    const failed = stream.toolActivity.find(
      (t) => t.status === 'failed' && t.summary !== undefined,
    );
    if (!failed) return;
    if (lastReportedFailure.current === failed.toolCallId) return;
    lastReportedFailure.current = failed.toolCallId;
    setToolFailure({ toolName: failed.toolName, error: failed.summary ?? '' });
  }, [stream.toolActivity]);

  useEffect(() => {
    if (sid) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/sessions', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ agentId: 'chat' }),
        });
        if (!res.ok) return;
        const body = (await res.json()) as { id: string };
        if (!cancelled) setSid(body.id);
      } catch {
        // 后端不可达时保持「创建中」状态，重试由用户再次打开窗口触发
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sid]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [stream.text, stream.toolActivity.length]);

  const send = async () => {
    const text = input.trim();
    if (!text || !sid) return;
    setInput('');
    setSent((list) => [...list, { id: nextMessageId(), role: 'user', text }]);
    try {
      await fetch(`/api/sessions/${sid}/messages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text }),
      });
    } catch {
      // 发送失败时消息仍留在列表中，用户可以重新发送
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div ref={listRef} data-testid="chat-messages" style={{ flex: 1, overflow: 'auto', padding: 8 }}>
        {sent.map((m) => (
          <div
            key={m.id}
            data-testid="chat-user-message"
            style={{
              whiteSpace: 'pre-wrap',
              marginBottom: 6,
              padding: '3px 5px',
              background: '#fff',
              border: '1px solid #7a7a7a',
              justifySelf: 'end',
            }}
          >
            {m.text}
          </div>
        ))}
        {stream.text ? (
          <div
            data-testid="chat-assistant-message"
            style={{ whiteSpace: 'pre-wrap', marginBottom: 8 }}
          >
            {stream.text}
          </div>
        ) : null}
        {stream.toolActivity.map((t) => (
          <div key={t.toolCallId} style={{ fontSize: 11, color: '#555', marginBottom: 2 }}>
            {t.status === 'running' ? '⏳' : t.status === 'ok' ? '✅' : '❌'} {t.toolName}
            {t.summary ? ` — ${t.summary}` : ''}
          </div>
        ))}
        {stream.error ? (
          <div data-testid="chat-error" style={{ color: '#c0392b', marginTop: 4 }}>
            错误：{stream.error}
          </div>
        ) : null}
        <div data-testid="chat-status" style={{ fontSize: 11, color: '#888' }}>
          {stream.connected ? '已连接' : '未连接'} · 会话 {sid ?? '创建中…'}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 4, padding: 4, borderTop: '1px solid #003c74' }}>
        <input
          data-testid="chat-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void send();
          }}
          style={{ flex: 1, fontFamily: 'var(--xp-font)', fontSize: 11, padding: '2px 4px' }}
        />
        <button type="button" data-testid="chat-send" onClick={() => void send()}>
          发送
        </button>
      </div>
      {toolFailure ? (
        <XPDialog
          title="工具执行失败"
          message={`工具「${toolFailure.toolName}」执行失败：${toolFailure.error}`}
          onClose={() => setToolFailure(null)}
        />
      ) : null}
    </div>
  );
}
