import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { WindowState } from '@tashkent/shared';
import AltTabSwitcher, { type AltTabCandidate } from './AltTabSwitcher.js';

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

function win(id: string, overrides: Partial<WindowState> = {}): WindowState {
  return {
    id,
    appId: 'chat',
    title: '对话',
    icon: '💬',
    mode: 'normal',
    x: 0,
    y: 0,
    width: 640,
    height: 480,
    zIndex: 11,
    restoreGeometry: { x: 0, y: 0, width: 640, height: 480 },
    resizable: true,
    minimizable: true,
    maximizable: true,
    ...overrides,
  };
}

function render(props: {
  candidates: AltTabCandidate[];
  activeId: string | null;
  onActivate?: (id: string) => void;
  onCancel?: () => void;
}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  act(() => {
    root.render(
      createElement(AltTabSwitcher, {
        candidates: props.candidates,
        activeId: props.activeId,
        onActivate: props.onActivate ?? (() => {}),
        onCancel: props.onCancel ?? (() => {}),
      }),
    );
  });
  return {
    container,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe('AltTabSwitcher', () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = undefined;
    vi.restoreAllMocks();
  });

  it('展示候选窗口列表', () => {
    const view = render({
      candidates: [
        { id: 'w1', title: '对话', icon: '💬', appId: 'chat' },
        { id: 'w2', title: '我的文档', icon: '📁', appId: 'files' },
      ],
      activeId: 'w1',
    });

    const switcher = view.container.querySelector('[data-testid="alt-tab-switcher"]');
    expect(switcher).not.toBeNull();
    expect(switcher?.textContent).toContain('对话');
    expect(switcher?.textContent).toContain('我的文档');
    view.unmount();
  });

  it('高亮当前选中的窗口', () => {
    const view = render({
      candidates: [
        { id: 'w1', title: '对话', icon: '💬', appId: 'chat' },
        { id: 'w2', title: '我的文档', icon: '📁', appId: 'files' },
      ],
      activeId: 'w2',
    });

    const active = view.container.querySelector('[data-testid="alt-tab-item-w2"]');
    expect(active?.getAttribute('data-active')).toBe('true');
    const other = view.container.querySelector('[data-testid="alt-tab-item-w1"]');
    expect(other?.getAttribute('data-active')).toBe('false');
    view.unmount();
  });

  it('候选为空时不渲染', () => {
    const view = render({ candidates: [], activeId: null });
    expect(view.container.querySelector('[data-testid="alt-tab-switcher"]')).toBeNull();
    view.unmount();
  });

  it('展示窗口图标与标题', () => {
    const view = render({
      candidates: [{ id: 'w1', title: '我的文档', icon: '📁', appId: 'files' }],
      activeId: 'w1',
    });
    const item = view.container.querySelector('[data-testid="alt-tab-item-w1"]');
    // files 有自绘 SVG 图标，因此展示的是 SVG 而不是 emoji
    expect(item?.querySelector('svg')).not.toBeNull();
    expect(item?.textContent).toContain('我的文档');
    view.unmount();
  });

  it('没有自绘图标的窗口回退到 emoji', () => {
    const view = render({
      candidates: [{ id: 'w1', title: '幽灵', icon: '👻', appId: 'ghost' }],
      activeId: 'w1',
    });
    const item = view.container.querySelector('[data-testid="alt-tab-item-w1"]');
    expect(item?.querySelector('svg')).toBeNull();
    expect(item?.textContent).toContain('👻');
    view.unmount();
  });
});
