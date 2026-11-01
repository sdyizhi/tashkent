import { beforeEach, describe, expect, it } from 'vitest';
import { createDesktopTools } from './desktop.js';
import { WindowService } from '../services/window-service.js';

let svc: WindowService;
let tools: ReturnType<typeof createDesktopTools>;

beforeEach(() => {
  svc = new WindowService({
    apps: [
      { appId: 'chat', title: '对话', icon: '💬' },
      { appId: 'files', title: '我的文档', icon: '📁', width: 520, height: 400 },
    ],
    defaultWidth: 640,
    defaultHeight: 480,
  });
  tools = createDesktopTools(svc);
});

function tool(name: string) {
  const t = tools.find((x) => x.name === name);
  if (!t) throw new Error(`tool ${name} missing`);
  return t;
}

const ctx = { sessionId: 's1', agentId: 'a1', toolCallId: 't1', emit: () => {} };

describe('desktop.open_app', () => {
  it('打开应用返回窗口 id', async () => {
    const res = await tool('desktop.open_app').execute({ appId: 'chat' }, ctx);
    expect(res.ok).toBe(true);
    expect(res.data).toMatchObject({ windowId: expect.any(String) });
    expect(svc.list()).toHaveLength(1);
  });

  it('连续调用两次只创建一个窗口', async () => {
    const first = await tool('desktop.open_app').execute({ appId: 'chat' }, ctx);
    const second = await tool('desktop.open_app').execute({ appId: 'chat' }, ctx);

    expect(svc.list()).toHaveLength(1);
    expect(second.data).toEqual(first.data);
  });

  it('重复打开同一 appId 返回同一个窗口 id', async () => {
    const first = await tool('desktop.open_app').execute({ appId: 'chat' }, ctx);
    const second = await tool('desktop.open_app').execute({ appId: 'chat' }, ctx);

    const firstId = (first.data as { windowId: string }).windowId;
    const secondId = (second.data as { windowId: string }).windowId;
    expect(secondId).toBe(firstId);
  });

  it('打开不同 appId 各创建一个窗口', async () => {
    await tool('desktop.open_app').execute({ appId: 'chat' }, ctx);
    await tool('desktop.open_app').execute({ appId: 'files' }, ctx);
    expect(svc.list()).toHaveLength(2);
  });

  it('窗口最小化后再次打开同一 appId 会恢复该窗口', async () => {
    const first = await tool('desktop.open_app').execute({ appId: 'chat' }, ctx);
    const windowId = (first.data as { windowId: string }).windowId;
    svc.update(windowId, { mode: 'minimized' });

    const second = await tool('desktop.open_app').execute({ appId: 'chat' }, ctx);

    expect((second.data as { windowId: string }).windowId).toBe(windowId);
    expect(svc.get(windowId)?.mode).toBe('normal');
    expect(svc.list()).toHaveLength(1);
  });
});

describe('desktop.close_window', () => {
  it('关闭指定窗口', async () => {
    const opened = await tool('desktop.open_app').execute({ appId: 'chat' }, ctx);
    const windowId = (opened.data as { windowId: string }).windowId;

    const res = await tool('desktop.close_window').execute({ windowId }, ctx);
    expect(res.ok).toBe(true);
    expect(svc.list()).toHaveLength(0);
  });

  it('关闭不存在的窗口返回失败', async () => {
    const res = await tool('desktop.close_window').execute({ windowId: 'ghost' }, ctx);
    expect(res.ok).toBe(false);
  });
});
