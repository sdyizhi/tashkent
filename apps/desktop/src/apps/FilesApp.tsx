import { useCallback, useEffect, useState } from 'react';
import type { FileEntry } from '@tashkent/shared';

interface FilesAppProps {
  sessionId?: string;
}

/**
 * 我的文档。
 *
 * 通过服务端 /api/files 浏览工作区内的真实目录与文件；
 * 路径由服务端做沙箱校验，前端只负责展示。
 */
export default function FilesApp({ sessionId }: FilesAppProps) {
  const [path, setPath] = useState('.');
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (target: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/files?path=${encodeURIComponent(target)}`);
      const body = (await res.json()) as {
        entries?: FileEntry[];
        error?: { message: string };
      };
      if (body.error) {
        setError(body.error.message);
        setEntries([]);
      } else {
        setError(null);
        setEntries(body.entries ?? []);
        setPath(target);
      }
    } catch {
      setError('无法连接到服务端');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load('.');
  }, [load]);

  const goUp = () => {
    if (path === '.') return;
    const parent = path.split('/').slice(0, -1).join('/') || '.';
    void load(parent);
  };

  const childPath = (name: string) => (path === '.' ? name : `${path}/${name}`);

  return (
    <div className="xp-files">
      <div className="xp-toolbar">
        <button
          type="button"
          className="xp-btn"
          data-testid="files-up"
          onClick={goUp}
          disabled={path === '.'}
        >
          ↑ 上一级
        </button>
        <span className="xp-path" data-testid="files-path">
          /{path === '.' ? '' : path}
        </span>
      </div>
      <div className="xp-file-list" data-testid="files-list">
        {loading ? <div className="xp-list-hint">加载中…</div> : null}
        {error ? (
          <div className="xp-list-hint error" data-testid="files-error">
            {error}
          </div>
        ) : null}
        {!loading && !error && entries.length === 0 ? (
          <div className="xp-list-hint">此目录为空</div>
        ) : null}
        {entries.map((e) => (
          <div
            key={e.name}
            className="xp-file-item"
            data-testid={`file-${e.name}`}
            onClick={() => {
              if (e.type === 'dir') void load(childPath(e.name));
            }}
          >
            <span className="xp-file-icon">{e.type === 'dir' ? '📁' : '📄'}</span>
            <span className="xp-file-name">{e.name}</span>
            {e.type === 'file' ? <span className="xp-file-size">{e.size} B</span> : null}
          </div>
        ))}
      </div>
      {sessionId ? <div className="xp-statusbar">会话 {sessionId}</div> : null}
    </div>
  );
}
