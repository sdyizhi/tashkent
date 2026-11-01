import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { StreamState } from '../state/useAgentStream.js';
import ChatApp from './ChatApp.js';

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

const streamState: StreamState = {
  connected: true,
  text: '',
  toolActivity: [],
  error: null,
  running: false,
};

/** 当前 mock 出来的流状态 */
let current: StreamState = { ...streamState };

vi.mock('../state/useAgentStream.js', () => ({
  useAgentStream: () => current,
  INITIAL_STREAM_STATE: {
    connected: false,
    text: '',
    toolActivity: [],
    error: null,
    running: false,
  },
}));

function render() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  act(() => {
    root.render(createElement(ChatApp, { sessionId: 's1' }));
  });
  return {
    container,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe('ChatApp 工具失败提示', () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    current = { ...streamState };
    // jsdom 没有实现 Element.scrollTo
    if (!Element.prototype.scrollTo) {
      Element.prototype.scrollTo = function scrollTo(): void {};
    }
  });

  afterEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = undefined;
    vi.restoreAllMocks();
  });

  it('没有工具失败时不弹对话框', () => {
    const view = render();
    expect(view.container.querySelector('[data-testid="xp-dialog"]')).toBeNull();
    view.unmount();
  });

  it('工具执行失败时弹出 XP 风格对话框并展示工具名与错误', () => {
    current = {
      ...streamState,
      toolActivity: [
        { toolCallId: 'c1', toolName: 'fs.write', status: 'failed', summary: '权限不足' },
      ],
    };

    const view = render();
    const dialog = view.container.querySelector('[data-testid="xp-dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.textContent).toContain('工具执行失败');
    expect(dialog?.textContent).toContain('fs.write');
    expect(dialog?.textContent).toContain('权限不足');
    view.unmount();
  });

  it('点击对话框「关闭」后对话框消失', () => {
    current = {
      ...streamState,
      toolActivity: [
        { toolCallId: 'c1', toolName: 'fs.write', status: 'failed', summary: '权限不足' },
      ],
    };

    const view = render();
    const close = view.container.querySelector<HTMLButtonElement>('[data-testid="xp-dialog-close"]');
    expect(close).not.toBeNull();
    act(() => close!.click());

    expect(view.container.querySelector('[data-testid="xp-dialog"]')).toBeNull();
    view.unmount();
  });

  it('工具成功时不弹对话框', () => {
    current = {
      ...streamState,
      toolActivity: [{ toolCallId: 'c1', toolName: 'fs.read', status: 'ok', summary: '读到了' }],
    };

    const view = render();
    expect(view.container.querySelector('[data-testid="xp-dialog"]')).toBeNull();
    view.unmount();
  });
});
