import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import ContextMenu, { type ContextMenuItem } from './ContextMenu.js';

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

function render(props: { items: ContextMenuItem[]; x?: number; y?: number; onClose?: () => void }) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);

  act(() => {
    root.render(
      createElement(ContextMenu, {
        items: props.items,
        x: props.x ?? 10,
        y: props.y ?? 20,
        onClose: props.onClose ?? (() => {}),
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

function items(overrides: Partial<ContextMenuItem>[] = []): ContextMenuItem[] {
  const base: ContextMenuItem[] = [
    { label: '还原', onSelect: vi.fn() },
    { label: '移动', onSelect: vi.fn() },
    { label: '大小', onSelect: vi.fn() },
    { label: '最小化', onSelect: vi.fn() },
    { label: '最大化', onSelect: vi.fn() },
    { label: '关闭', onSelect: vi.fn() },
  ];
  return base.map((item, i) => ({ ...item, ...(overrides[i] ?? {}) }));
}

describe('ContextMenu', () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = undefined;
    vi.restoreAllMocks();
  });

  it('在指定坐标渲染菜单', () => {
    const view = render({ items: items(), x: 120, y: 240 });
    const menu = view.container.querySelector<HTMLElement>('[data-testid="context-menu"]');
    expect(menu).not.toBeNull();
    expect(menu?.style.left).toBe('120px');
    expect(menu?.style.top).toBe('240px');
    view.unmount();
  });

  it('渲染全部菜单项', () => {
    const view = render({ items: items() });
    const labels = Array.from(
      view.container.querySelectorAll('[data-testid^="context-menu-item-"]'),
    ).map((el) => el.textContent);
    expect(labels).toEqual(['还原', '移动', '大小', '最小化', '最大化', '关闭']);
    view.unmount();
  });

  it('点击菜单项触发对应的 onSelect', () => {
    const list = items();
    const view = render({ items: list });

    const item = view.container.querySelector<HTMLElement>('[data-testid="context-menu-item-关闭"]');
    act(() => item!.click());

    expect(list[5]!.onSelect).toHaveBeenCalledTimes(1);
    view.unmount();
  });

  it('点击菜单项后关闭菜单', () => {
    const onClose = vi.fn();
    const view = render({ items: items(), onClose });

    const item = view.container.querySelector<HTMLElement>('[data-testid="context-menu-item-最小化"]');
    act(() => item!.click());

    expect(onClose).toHaveBeenCalledTimes(1);
    view.unmount();
  });

  it('禁用的菜单项不触发 onSelect', () => {
    const list = items([{ disabled: true }, { disabled: true }, { disabled: true }]);
    const onClose = vi.fn();
    const view = render({ items: list, onClose });

    const item = view.container.querySelector<HTMLElement>('[data-testid="context-menu-item-移动"]');
    expect(item?.getAttribute('aria-disabled')).toBe('true');
    act(() => item!.click());

    expect(list[1]!.onSelect).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    view.unmount();
  });

  it('点击菜单外部时关闭菜单', () => {
    const onClose = vi.fn();
    const view = render({ items: items(), onClose });

    act(() => {
      window.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onClose).toHaveBeenCalledTimes(1);
    view.unmount();
  });

  it('菜单为空时只渲染菜单容器', () => {
    const view = render({ items: [] });
    const menu = view.container.querySelector('[data-testid="context-menu"]');
    expect(menu).not.toBeNull();
    expect(
      view.container.querySelectorAll('[data-testid^="context-menu-item-"]'),
    ).toHaveLength(0);
    view.unmount();
  });
});
