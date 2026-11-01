import { beforeEach, describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AgentEvent, WindowState } from '@tashkent/shared';
import { WindowService } from '../services/window-service.js';
import { DESKTOP_SESSION_ID, desktopRoutes } from './desktop.js';

let svc: WindowService;
let events: AgentEvent[];
let app: Hono;
/** 文件浏览端点使用的工作区沙箱根目录 */
let workspaceDir: string;

beforeEach(() => {
  svc = new WindowService({
    apps: [
      { appId: 'chat', title: '对话', icon: '💬' },
      { appId: 'files', title: '我的文档', icon: '📁', width: 520, height: 400 },
    ],
    defaultWidth: 640,
    defaultHeight: 480,
  });
  events = [];
  workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tashkent-files-'));
  app = new Hono();
  app.route('/', desktopRoutes(svc, (e) => events.push(e), workspaceDir));
});

/** 调用打开窗口接口，返回状态码与窗口载荷 */
async function postWindow(
  appId: string,
): Promise<{ status: number; window: WindowState }> {
  const res = await app.request('/api/desktop/windows', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ appId }),
  });
  return { status: res.status, window: (await res.json()) as WindowState };
}

/** 读取当前窗口列表 */
async function listWindows(): Promise<WindowState[]> {
  const res = await app.request('/api/desktop/windows');
  const body = (await res.json()) as { windows: WindowState[] };
  return body.windows;
}

describe('GET /api/desktop/windows', () => {
  it('返回当前窗口列表', async () => {
    svc.open('chat');
    const res = await app.request('/api/desktop/windows');
    const body = (await res.json()) as { windows: Array<{ appId: string }> };
    expect(body.windows).toHaveLength(1);
    expect(body.windows[0]?.appId).toBe('chat');
  });
});

describe('POST /api/desktop/windows', () => {
  it('打开窗口并广播 desktop_window_opened 事件', async () => {
    const res = await app.request('/api/desktop/windows', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ appId: 'chat' }),
    });
    expect(res.status).toBe(201);

    expect(events).toHaveLength(1);
    const ev = events[0]!;
    expect(ev.type).toBe('desktop_window_opened');
    expect(ev.sessionId).toBe(DESKTOP_SESSION_ID);
    if (ev.type !== 'desktop_window_opened') throw new Error('unreachable');
    expect(ev.window.appId).toBe('chat');
    expect(ev.window.id).toBeTruthy();
  });

  it('缺少 appId 返回 400 且不广播', async () => {
    const res = await app.request('/api/desktop/windows', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    expect(events).toHaveLength(0);
  });
});

describe('POST /api/desktop/windows 幂等打开（XP 语义：已有窗口则聚焦，不新建）', () => {
  it('连续两次打开同一 appId 只保留一个窗口', async () => {
    const first = await postWindow('chat');
    const second = await postWindow('chat');

    expect(first.status).toBe(201);
    expect(second.window.id).toBe(first.window.id);

    const windows = await listWindows();
    expect(windows).toHaveLength(1);
    expect(windows[0]?.appId).toBe('chat');
  });

  it('打开不同 appId 得到两个窗口', async () => {
    await postWindow('chat');
    await postWindow('files');

    const windows = await listWindows();
    expect(windows).toHaveLength(2);
    expect(windows.map((w) => w.appId).sort()).toEqual(['chat', 'files']);
  });

  it('窗口处于最小化时再次打开同一 appId：恢复为 normal 并置顶', async () => {
    const first = await postWindow('chat');
    await app.request(`/api/desktop/windows/${first.window.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: 'minimized' }),
    });

    const second = await postWindow('chat');

    expect(second.window.id).toBe(first.window.id);
    expect(second.window.mode).toBe('normal');
    expect(second.window.zIndex).toBeGreaterThan(first.window.zIndex);

    const windows = await listWindows();
    expect(windows).toHaveLength(1);
    expect(windows[0]?.mode).toBe('normal');
  });

  it('窗口处于最大化时再次打开同一 appId：保持最大化并置顶', async () => {
    const first = await postWindow('chat');
    await app.request(`/api/desktop/windows/${first.window.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: 'maximized' }),
    });

    const second = await postWindow('chat');

    expect(second.window.id).toBe(first.window.id);
    expect(second.window.mode).toBe('maximized');
    expect(second.window.zIndex).toBeGreaterThan(first.window.zIndex);
    expect(await listWindows()).toHaveLength(1);
  });

  it('已存在的窗口被再次打开时不再广播 desktop_window_opened', async () => {
    await postWindow('chat');
    expect(events).toHaveLength(1);

    await postWindow('chat');
    // 幂等聚焦不产生「新窗口已打开」事件，避免前端误以为新增了窗口
    const opened = events.filter((e) => e.type === 'desktop_window_opened');
    expect(opened).toHaveLength(1);
  });

  it('已存在的窗口被再次打开时广播 desktop_window_updated（置顶 / 恢复）', async () => {
    const first = await postWindow('chat');
    events.length = 0;

    await postWindow('chat');

    expect(events).toHaveLength(1);
    const ev = events[0]!;
    expect(ev.type).toBe('desktop_window_updated');
    if (ev.type !== 'desktop_window_updated') throw new Error('unreachable');
    expect(ev.windowId).toBe(first.window.id);
  });

  it('关闭窗口后再次打开同一 appId 会新建窗口', async () => {
    const first = await postWindow('chat');
    await app.request(`/api/desktop/windows/${first.window.id}`, { method: 'DELETE' });

    const second = await postWindow('chat');
    expect(second.window.id).not.toBe(first.window.id);
    expect(await listWindows()).toHaveLength(1);
  });
});

describe('PATCH /api/desktop/windows/:id', () => {
  it('更新几何信息并广播 desktop_window_updated 事件', async () => {
    const win = svc.open('chat');
    const res = await app.request(`/api/desktop/windows/${win.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ x: 300, y: 200 }),
    });
    expect(res.status).toBe(200);

    expect(events).toHaveLength(1);
    const ev = events[0]!;
    expect(ev.type).toBe('desktop_window_updated');
    if (ev.type !== 'desktop_window_updated') throw new Error('unreachable');
    expect(ev.windowId).toBe(win.id);
    expect(ev.patch).toEqual({ x: 300, y: 200 });
  });

  it('更新不存在的窗口返回 404 且不广播', async () => {
    const res = await app.request('/api/desktop/windows/ghost', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ x: 1 }),
    });
    expect(res.status).toBe(404);
    expect(events).toHaveLength(0);
  });
});

describe('DELETE /api/desktop/windows/:id', () => {
  it('关闭窗口并广播 desktop_window_closed 事件', async () => {
    const win = svc.open('chat');
    const res = await app.request(`/api/desktop/windows/${win.id}`, { method: 'DELETE' });
    expect(res.status).toBe(200);

    expect(events).toHaveLength(1);
    const ev = events[0]!;
    expect(ev.type).toBe('desktop_window_closed');
    if (ev.type !== 'desktop_window_closed') throw new Error('unreachable');
    expect(ev.windowId).toBe(win.id);
  });

  it('关闭不存在的窗口返回 404 且不广播', async () => {
    const res = await app.request('/api/desktop/windows/ghost', { method: 'DELETE' });
    expect(res.status).toBe(404);
    expect(events).toHaveLength(0);
  });
});

describe('GET /api/files（我的文档的真实文件浏览）', () => {
  it('列出工作区根目录下的条目，文件带字节数', async () => {
    fs.writeFileSync(path.join(workspaceDir, 'a.txt'), 'hello');
    fs.mkdirSync(path.join(workspaceDir, 'sub'));

    const res = await app.request('/api/files');
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      path: string;
      entries: Array<{ name: string; type: string; size: number }>;
    };
    expect(body.path).toBe('.');
    const names = body.entries.map((e) => e.name).sort();
    expect(names).toEqual(['a.txt', 'sub']);
    const file = body.entries.find((e) => e.name === 'a.txt');
    expect(file?.type).toBe('file');
    expect(file?.size).toBe(5);
    expect(body.entries.find((e) => e.name === 'sub')?.type).toBe('dir');
  });

  it('按 path 列出子目录', async () => {
    fs.mkdirSync(path.join(workspaceDir, 'sub'));
    fs.writeFileSync(path.join(workspaceDir, 'sub', 'b.txt'), 'x');

    const res = await app.request('/api/files?path=sub');
    const body = (await res.json()) as { entries: Array<{ name: string }> };
    expect(body.entries.map((e) => e.name)).toEqual(['b.txt']);
  });

  it('路径逃逸出沙箱时返回 400', async () => {
    const res = await app.request('/api/files?path=../');
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('READ_FAILED');
  });

  it('读取不存在的目录返回 400', async () => {
    const res = await app.request('/api/files?path=ghost');
    expect(res.status).toBe(400);
  });
});

describe('PUT /api/files（记事本保存）', () => {
  it('写入文本文件并可读回', async () => {
    const res = await app.request('/api/files', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: 'note.txt', content: '你好' }),
    });
    expect(res.status).toBe(200);
    expect(fs.readFileSync(path.join(workspaceDir, 'note.txt'), 'utf-8')).toBe('你好');
  });

  it('自动创建缺失的父目录', async () => {
    await app.request('/api/files', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: 'deep/dir/note.txt', content: 'x' }),
    });
    expect(fs.existsSync(path.join(workspaceDir, 'deep', 'dir', 'note.txt'))).toBe(true);
  });

  it('路径逃逸出沙箱时拒绝写入', async () => {
    const res = await app.request('/api/files', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: '../escape.txt', content: 'x' }),
    });
    expect(res.status).toBe(400);
    expect(fs.existsSync(path.join(path.dirname(workspaceDir), 'escape.txt'))).toBe(false);
  });

  it('缺少 path 或 content 返回 400', async () => {
    const noPath = await app.request('/api/files', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content: 'x' }),
    });
    expect(noPath.status).toBe(400);

    const noContent = await app.request('/api/files', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: 'a.txt' }),
    });
    expect(noContent.status).toBe(400);
  });
});

describe('GET /api/files/:path（读取单个文本文件）', () => {
  it('返回文件内容', async () => {
    fs.writeFileSync(path.join(workspaceDir, 'a.txt'), '内容');
    const res = await app.request('/api/files/a.txt');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { path: string; content: string };
    expect(body.path).toBe('a.txt');
    expect(body.content).toBe('内容');
  });

  it('路径逃逸出沙箱时返回 400', async () => {
    const res = await app.request('/api/files/..%2Fsecret.txt');
    expect(res.status).toBe(400);
  });

  it('读取不存在的文件返回 400', async () => {
    const res = await app.request('/api/files/ghost.txt');
    expect(res.status).toBe(400);
  });
});
