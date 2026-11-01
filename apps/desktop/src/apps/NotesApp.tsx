import { useCallback, useEffect, useState } from 'react';
import type { FileEntry } from '@tashkent/shared';

interface NotesAppProps {
  sessionId?: string;
}

/**
 * 记事本。
 *
 * 左侧列出工作区中的文本文件，右侧编辑区直接读写真实文件。
 * 读写的路径由服务端做沙箱校验（/api/files）。
 */
export default function NotesApp({ sessionId }: NotesAppProps) {
  const [dir, setDir] = useState('.');
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);

  /** 加载目录中的文件列表 */
  const loadDir = useCallback(async (target: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/files?path=${encodeURIComponent(target)}`);
      const body = (await res.json()) as { entries?: FileEntry[]; error?: { message: string } };
      if (body.error) {
        setStatus(body.error.message);
        setEntries([]);
      } else {
        setEntries((body.entries ?? []).filter((e) => e.type === 'file'));
        setDir(target);
        setStatus('');
      }
    } catch {
      setStatus('无法连接到服务端');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDir('.');
  }, [loadDir]);

  /** 打开文件并读入内容 */
  const openFile = useCallback(async (path: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/files/${encodeURIComponent(path)}`);
      const body = (await res.json()) as { content?: string; error?: { message: string } };
      if (body.error) {
        setStatus(body.error.message);
      } else {
        setCurrent(path);
        setContent(body.content ?? '');
        setStatus('');
      }
    } catch {
      setStatus('无法连接到服务端');
    } finally {
      setLoading(false);
    }
  }, []);

  /** 保存当前文件 */
  const save = useCallback(async () => {
    if (!current) return;
    try {
      const res = await fetch('/api/files', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path: current, content }),
      });
      const body = (await res.json()) as { error?: { message: string } };
      if (body.error) {
        setStatus(`保存失败：${body.error.message}`);
      } else {
        setStatus('已保存');
      }
    } catch {
      setStatus('保存失败：无法连接到服务端');
    }
  }, [current, content]);

  return (
    <div className="xp-notes">
      <div className="xp-notes-side">
        <div className="xp-toolbar">
          <button
            type="button"
            className="xp-btn"
            data-testid="notes-up"
            disabled={dir === '.'}
            onClick={() => {
              if (dir === '.') return;
              void loadDir(dir.split('/').slice(0, -1).join('/') || '.');
            }}
          >
            ↑ 上一级
          </button>
          <span className="xp-path">/{dir === '.' ? '' : dir}</span>
        </div>
        <div className="xp-notes-list" data-testid="notes-list">
          {loading ? <div className="xp-list-hint">加载中…</div> : null}
          {!loading && entries.length === 0 ? (
            <div className="xp-list-hint">此目录没有文件</div>
          ) : null}
          {entries.map((e) => (
            <div
              key={e.name}
              className="xp-file-item"
              data-testid={`notes-file-${e.name}`}
              data-active={current === (dir === '.' ? e.name : `${dir}/${e.name}`)}
              onClick={() => void openFile(dir === '.' ? e.name : `${dir}/${e.name}`)}
            >
              <span className="xp-file-icon">📄</span>
              <span className="xp-file-name">{e.name}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="xp-notes-main">
        <div className="xp-toolbar">
          <span className="xp-path" data-testid="notes-current">
            {current ?? '未选择文件'}
          </span>
          <button
            type="button"
            className="xp-btn xp-dialog-btn default"
            data-testid="notes-save"
            disabled={!current}
            onClick={() => void save()}
          >
            保存
          </button>
        </div>
        <textarea
          className="xp-notes-editor"
          data-testid="notes-editor"
          value={content}
          spellCheck={false}
          onChange={(e) => setContent(e.target.value)}
        />
        <div className="xp-statusbar" data-testid="notes-status">
          {status || (current ? `编辑中：${current}` : '')}
          {sessionId ? ` · 会话 ${sessionId}` : ''}
        </div>
      </div>
    </div>
  );
}
