import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useDesktopStore } from '../state/desktopStore.js';
import DesktopIcons from './DesktopIcons.js';

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

function render(): { container: HTMLElement; unmount: () => void } {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  act(() => {
    root.render(createElement(DesktopIcons));
  });
  return {
    container,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe('DesktopIcons 使用自绘 SVG 图标', () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    useDesktopStore.setState({
      windows: [],
      icons: [],
      focusedId: null,
      nextZIndex: 10,
    });
  });

  afterEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = undefined;
  });

  it('桌面图标渲染 SVG 而不是 emoji', () => {
    useDesktopStore.getState().setApps([
      {
        appId: 'chat',
        title: '对话',
        icon: '💬',
        agentId: 'chat',
        width: 640,
        height: 480,
        group: 'accessories',
        description: '通用对话助手',
      },
    ]);

    const view = render();
    const icon = view.container.querySelector('[data-testid="desktop-icon-chat"]');
    expect(icon?.querySelector('svg')).not.toBeNull();
    expect(icon?.textContent).not.toContain('💬');
    view.unmount();
  });

  it('没有对应 SVG 的应用回退到注册表里的 emoji', () => {
    useDesktopStore.getState().setApps([
      {
        appId: 'ghost',
        title: '幽灵',
        icon: '👻',
        agentId: 'ghost',
        width: 100,
        height: 100,
        group: 'system',
        description: '未知应用',
      },
    ]);

    const view = render();
    const icon = view.container.querySelector('[data-testid="desktop-icon-ghost"]');
    expect(icon?.querySelector('svg')).toBeNull();
    expect(icon?.textContent).toContain('👻');
    view.unmount();
  });

  it('没有图标时不渲染图标层', () => {
    const view = render();
    expect(view.container.querySelector('[data-testid="desktop-icons"]')).toBeNull();
    view.unmount();
  });
});
