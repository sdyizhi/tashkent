import fs from 'node:fs';
import path from 'node:path';
import { Hono } from 'hono';
import type { AgentEvent, WindowsResponse } from '@tashkent/shared';
import type { WindowService } from '../services/window-service.js';
import { resolveInSandbox } from '../tools/fs.js';

/**
 * 桌面窗口命令不是会话内的行为，因此用固定 sessionId 标记。
 * 前端按 sessionId 过滤会话流，但窗口类事件必须始终应用到桌面。
 */
export const DESKTOP_SESSION_ID = '__desktop__';

export type DesktopEventSink = (event: AgentEvent) => void;

export function desktopRoutes(svc: WindowService, emit: DesktopEventSink, workspaceDir: string) {
  const app = new Hono();

  app.get('/api/desktop/windows', (c) => {
    const body: WindowsResponse = { windows: svc.list() };
    return c.json(body);
  });

  /**
   * 幂等打开窗口。
   *
   * XP 语义：双击桌面图标时，若该应用已打开则聚焦已有窗口（并从最小化恢复），
   * 而不是再开一个副本。因此这里用 openOrFocus：命中已有窗口时返回 200 与该窗口，
   * 新建时返回 201。
   */
  app.post('/api/desktop/windows', async (c) => {
    const body = (await c.req.json()) as { appId?: string; params?: Record<string, unknown> };
    if (!body?.appId) {
      return c.json({ error: { code: 'BAD_REQUEST', message: 'appId 必填' } }, 400);
    }
    const { window: win, created } = svc.openOrFocus(body.appId, body.params);
    if (created) {
      emit({
        type: 'desktop_window_opened',
        sessionId: DESKTOP_SESSION_ID,
        window: win,
      });
      return c.json(win, 201);
    }
    // 聚焦已有窗口：广播一次更新，让其它客户端同步置顶 / 恢复
    emit({
      type: 'desktop_window_updated',
      sessionId: DESKTOP_SESSION_ID,
      windowId: win.id,
      patch: { mode: win.mode, zIndex: win.zIndex },
    });
    return c.json(win, 200);
  });

  app.patch('/api/desktop/windows/:id', async (c) => {
    const patch = (await c.req.json()) as Record<string, unknown>;
    const updated = svc.update(c.req.param('id'), patch);
    if (!updated) return c.json({ error: { code: 'NOT_FOUND', message: '窗口不存在' } }, 404);
    emit({
      type: 'desktop_window_updated',
      sessionId: DESKTOP_SESSION_ID,
      windowId: updated.id,
      patch,
    });
    return c.json(updated);
  });

  app.delete('/api/desktop/windows/:id', (c) => {
    const id = c.req.param('id');
    const ok = svc.close(id);
    if (!ok) return c.json({ error: { code: 'NOT_FOUND', message: '窗口不存在' } }, 404);
    emit({
      type: 'desktop_window_closed',
      sessionId: DESKTOP_SESSION_ID,
      windowId: id,
    });
    return c.json({ ok: true });
  });

  /**
   * 浏览工作区目录（我的文档应用）。
   *
   * 路径经 resolveInSandbox 校验，逃出工作区根目录的路径一律拒绝。
   */
  app.get('/api/files', (c) => {
    const rel = c.req.query('path') ?? '.';
    try {
      const abs = resolveInSandbox(workspaceDir, rel === '' ? '.' : rel);
      const entries = fs.readdirSync(abs, { withFileTypes: true }).map((e) => ({
        name: e.name,
        type: e.isDirectory() ? ('dir' as const) : ('file' as const),
        size: e.isFile() ? fs.statSync(path.join(abs, e.name)).size : 0,
      }));
      return c.json({ path: rel, entries });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: { code: 'READ_FAILED', message } }, 400);
    }
  });

  /**
   * 读取工作区内的单个文本文件（记事本应用）。
   *
   * 与目录浏览共用沙箱校验，避免读到工作区之外的文件。
   */
  app.get('/api/files/:path', (c) => {
    const rel = c.req.param('path');
    try {
      const abs = resolveInSandbox(workspaceDir, rel);
      const content = fs.readFileSync(abs, 'utf-8');
      return c.json({ path: rel, content });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: { code: 'READ_FAILED', message } }, 400);
    }
  });

  /**
   * 写入工作区内的文本文件（记事本应用保存）。
   *
   * 写入前同样经沙箱校验；缺失的父目录会被自动创建。
   */
  app.put('/api/files', async (c) => {
    const body = (await c.req.json()) as { path?: string; content?: string };
    if (!body || typeof body.path !== 'string' || body.path === '') {
      return c.json({ error: { code: 'BAD_REQUEST', message: 'path 必填' } }, 400);
    }
    if (typeof body.content !== 'string') {
      return c.json({ error: { code: 'BAD_REQUEST', message: 'content 必填' } }, 400);
    }
    try {
      const abs = resolveInSandbox(workspaceDir, body.path);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, body.content, 'utf-8');
      return c.json({ ok: true, path: body.path });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: { code: 'WRITE_FAILED', message } }, 400);
    }
  });

  return app;
}
