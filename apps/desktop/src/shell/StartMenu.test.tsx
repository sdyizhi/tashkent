import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { AppDefinition } from '@tashkent/shared';
import { useDesktopStore } from '../state/desktopStore.js';
import StartMenu from './StartMenu.js';

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

const APPS: AppDefinition[] = [
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
];

function render(): { container: HTMLElement; unmount: () => void } {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  act(() => {
    root.render(createElement(StartMenu));
  });
  return {
    container,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe('StartMenu 使用自绘 SVG 图标', () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    useDesktopStore.setState({
      windows: [],
      icons: [],
      focusedId: null,
      nextZIndex: 10,
      startMenuOpen: true,
      apps: APPS,
    });
  });

  afterEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = undefined;
    useDesktopStore.setState({ startMenuOpen: false });
  });

  it('菜单项渲染 SVG 而不是 emoji', () => {
    const view = render();
    const item = view.container.querySelector('[data-testid="start-menu-item-chat"]');
    expect(item?.querySelector('svg')).not.toBeNull();
    expect(item?.textContent).not.toContain('💬');
    view.unmount();
  });

  it('没有对应 SVG 的菜单项回退到 emoji', () => {
    const view = render();
    const item = view.container.querySelector('[data-testid="start-menu-item-ghost"]');
    expect(item?.querySelector('svg')).toBeNull();
    expect(item?.textContent).toContain('👻');
    view.unmount();
  });

  it('菜单关闭时不渲染', () => {
    useDesktopStore.setState({ startMenuOpen: false });
    const view = render();
    expect(view.container.querySelector('[data-testid="start-menu"]')).toBeNull();
    view.unmount();
  });
});
