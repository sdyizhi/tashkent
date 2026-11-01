import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { APP_ICONS, AppIcon, hasAppIcon } from './index.js';

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

function render(element: React.ReactNode): {
  container: HTMLElement;
  unmount: () => void;
} {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  act(() => {
    root.render(element);
  });
  return {
    container,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

/** 七个已注册应用的 appId */
const APP_IDS = ['chat', 'files', 'notes', 'browser', 'terminal', 'settings', 'tasks'];

describe('XP 图标集', () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = undefined;
  });

  it('七个应用都有专属 SVG 图标', () => {
    for (const id of APP_IDS) {
      expect(APP_ICONS[id]).toBeTypeOf('function');
      expect(hasAppIcon(id)).toBe(true);
    }
  });

  it('未注册的应用没有 SVG 图标', () => {
    expect(hasAppIcon('ghost')).toBe(false);
    expect(APP_ICONS['ghost']).toBeUndefined();
  });

  it('图标按尺寸档位渲染 width/height，且共用 0 0 32 32 的 viewBox', () => {
    for (const size of [16, 32, 48] as const) {
      const view = render(createElement(APP_ICONS['chat']!, { size }));
      const svg = view.container.querySelector('svg');
      expect(svg?.getAttribute('width')).toBe(String(size));
      expect(svg?.getAttribute('height')).toBe(String(size));
      expect(svg?.getAttribute('viewBox')).toBe('0 0 32 32');
      view.unmount();
    }
  });

  it('默认尺寸为 32', () => {
    const view = render(createElement(APP_ICONS['notes']!));
    const svg = view.container.querySelector('svg');
    expect(svg?.getAttribute('width')).toBe('32');
    view.unmount();
  });

  it('每个图标都渲染出带描边的图形，而不是空壳', () => {
    for (const id of APP_IDS) {
      const view = render(createElement(APP_ICONS[id]!, { size: 48 }));
      const svg = view.container.querySelector('svg');
      expect(svg).not.toBeNull();
      // 至少有一个填充/描边的图元
      expect(svg!.querySelectorAll('rect, path, circle').length).toBeGreaterThan(1);
      expect(svg!.getAttribute('aria-label')).toBeTruthy();
      view.unmount();
    }
  });

  it('className 透传到 svg 根元素', () => {
    const view = render(createElement(APP_ICONS['files']!, { className: 'my-icon' }));
    expect(view.container.querySelector('svg')?.getAttribute('class')).toBe('my-icon');
    view.unmount();
  });
});

describe('AppIcon 回退', () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = undefined;
  });

  it('有对应 SVG 时渲染 SVG 而不是 emoji', () => {
    const view = render(createElement(AppIcon, { appId: 'chat', emoji: '💬' }));
    expect(view.container.querySelector('svg')).not.toBeNull();
    expect(view.container.textContent).not.toContain('💬');
    view.unmount();
  });

  it('没有对应 SVG 时回退到注册表里的 emoji', () => {
    const view = render(createElement(AppIcon, { appId: 'ghost', emoji: '👻' }));
    expect(view.container.querySelector('svg')).toBeNull();
    expect(view.container.textContent).toContain('👻');
    expect(view.container.querySelector('[data-testid="app-icon-fallback"]')).not.toBeNull();
    view.unmount();
  });

  it('回退时传入的尺寸不影响 emoji 渲染', () => {
    const view = render(createElement(AppIcon, { appId: 'ghost', emoji: '👻', size: 48 }));
    expect(view.container.textContent).toContain('👻');
    view.unmount();
  });
});
