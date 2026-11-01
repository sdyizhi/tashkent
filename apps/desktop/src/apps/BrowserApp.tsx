import { useCallback, useEffect, useRef, useState } from 'react';

interface BrowserAppProps {
  sessionId?: string;
}

/**
 * iframe 的协议白名单。
 *
 * 只允许 http/https：javascript: / data: / file: 都能在源站上下文里执行脚本，
 * 放进 iframe 等同于 XSS，因此一律拒绝。
 */
export function isSafeBrowserUrl(raw: string): boolean {
  const value = raw.trim();
  if (!value) return false;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  return parsed.protocol === 'http:' || parsed.protocol === 'https:';
}

/** 补全协议前缀：用户只输入域名时默认走 https */
function normalizeUrl(raw: string): string {
  const value = raw.trim();
  if (!value) return '';
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value)) return value;
  return `https://${value}`;
}

/**
 * iframe 加载失败的判定时限（毫秒）。
 *
 * 多数站点用 X-Frame-Options / CSP 拒绝被嵌入，此时浏览器渲染的是自己的错误页，
 * iframe 不会触发 error 事件，只能靠超时判定为「很可能被拒绝」。
 */
const FRAME_LOAD_TIMEOUT_MS = 6000;

/**
 * 浏览器。
 *
 * 地址栏 + iframe 预览 + 「让 Agent 检索」侧栏。
 *
 * 多数站点通过 X-Frame-Options / CSP 拒绝被嵌入，
 * 这种情况会如实告诉用户并提供「在新窗口打开」，不会假装加载成功。
 */
export default function BrowserApp({ sessionId }: BrowserAppProps) {
  const [input, setInput] = useState('');
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [frameFailed, setFrameFailed] = useState(false);
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState('');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sidRef = useRef<string | undefined>(sessionId);

  /** 取消挂起的加载计时器 */
  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => clearTimer, [clearTimer]);

  /** 导航到目标地址 */
  const navigate = useCallback(() => {
    const target = normalizeUrl(input);
    if (!target) {
      setError('请输入网址');
      return;
    }
    if (!isSafeBrowserUrl(target)) {
      setError('只支持 http/https 协议（已阻止 javascript: / data: 等危险协议）');
      setUrl('');
      setFrameFailed(false);
      clearTimer();
      return;
    }
    setError(null);
    setFrameFailed(false);
    setUrl(target);
    clearTimer();
    // 到点仍未收到 load 事件，判定为站点拒绝嵌入（如 X-Frame-Options）
    timerRef.current = setTimeout(() => setFrameFailed(true), FRAME_LOAD_TIMEOUT_MS);
  }, [input, clearTimer]);

  /** 让 Agent 检索当前页面 */
  const askAgent = useCallback(async () => {
    if (!url) return;
    setAsking(true);
    setNote('');
    try {
      let sid = sidRef.current;
      if (!sid) {
        const created = await fetch('/api/sessions', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ agentId: 'web-research' }),
        });
        if (!created.ok) throw new Error('创建会话失败');
        const body = (await created.json()) as { id: string };
        sid = body.id;
        sidRef.current = sid;
      }
      const res = await fetch(`/api/sessions/${sid}/messages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: `检索 ${url} 的内容并给出要点摘要` }),
      });
      if (!res.ok) throw new Error('发送检索请求失败');
      setNote('已交给 Agent 检索，结果会出现在对话窗口中。');
    } catch (err) {
      setNote(err instanceof Error ? err.message : '请求失败');
    } finally {
      setAsking(false);
    }
  }, [url]);

  return (
    <div className="xp-browser">
      <div className="xp-toolbar">
        <input
          className="xp-browser-input"
          data-testid="browser-url"
          value={input}
          placeholder="输入网址，例如 example.com"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') navigate();
          }}
        />
        <button type="button" className="xp-btn" data-testid="browser-go" onClick={navigate}>
          转到
        </button>
        <button
          type="button"
          className="xp-btn"
          data-testid="browser-ask"
          disabled={!url || asking}
          onClick={() => void askAgent()}
        >
          让 Agent 检索
        </button>
        {url ? (
          <a
            className="xp-btn"
            data-testid="browser-open-new"
            href={url}
            target="_blank"
            rel="noreferrer noopener"
          >
            在新窗口打开
          </a>
        ) : null}
      </div>
      {error ? (
        <div className="xp-list-hint error" data-testid="browser-error">
          {error}
        </div>
      ) : null}
      <div className="xp-browser-main">
        <div className="xp-browser-frame-wrap">
          {url && !frameFailed ? (
            <iframe
              className="xp-browser-frame"
              data-testid="browser-frame"
              src={url}
              title={url}
              // 不给 allow-same-origin：iframe 运行在匿名源上，无法触碰父页面 DOM
              sandbox="allow-scripts allow-forms allow-popups"
              referrerPolicy="no-referrer"
              onLoad={() => {
                clearTimer();
                setFrameFailed(false);
              }}
              onError={() => {
                clearTimer();
                setFrameFailed(true);
              }}
            />
          ) : null}
          {frameFailed ? (
            <div className="xp-browser-frame-notice" data-testid="browser-frame-notice">
              <div>目标站点拒绝嵌入（X-Frame-Options / CSP），无法在本窗口内预览。</div>
              <div>可点击工具栏的「在新窗口打开」，或让 Agent 抓取页面内容。</div>
            </div>
          ) : null}
          {!url && !frameFailed ? (
            <div className="xp-browser-frame-notice" data-testid="browser-empty">
              输入网址后在此预览。
            </div>
          ) : null}
        </div>
        <div className="xp-browser-side" data-testid="browser-side">
          <div className="xp-browser-side-title">Agent 检索</div>
          <div className="xp-list-hint">{note || '点击「让 Agent 检索」由联网助手抓取页面内容。'}</div>
        </div>
      </div>
    </div>
  );
}
