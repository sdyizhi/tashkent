import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
// Vite 的 ?raw 导入：把样式表当作文本读进来，用于断言动效与壁纸规则
import xpCss from '../styles/xp.css?raw';
import Wallpaper from './Wallpaper.js';

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

/** 断言 xpCss 里存在某个片段 */
function hasCss(fragment: string): boolean {
  return xpCss.includes(fragment);
}

function render(): { container: HTMLElement; unmount: () => void } {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  act(() => {
    root.render(createElement(Wallpaper));
  });
  return {
    container,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe('Wallpaper Bliss 壁纸', () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = undefined;
  });

  it('渲染天空与绿丘图层', () => {
    const view = render();
    expect(view.container.querySelector('[data-testid="wallpaper"]')).not.toBeNull();
    expect(view.container.querySelector('.xp-wallpaper-sky')).not.toBeNull();
    expect(view.container.querySelectorAll('.xp-wallpaper-hill').length).toBeGreaterThanOrEqual(2);
    view.unmount();
  });

  it('渲染两朵积云：左上一朵大的、右侧一朵小的', () => {
    const view = render();
    const clouds = view.container.querySelectorAll('.xp-cloud');
    expect(clouds.length).toBe(2);
    expect(view.container.querySelector('[data-testid="wallpaper-cloud-large"]')).not.toBeNull();
    expect(view.container.querySelector('[data-testid="wallpaper-cloud-small"]')).not.toBeNull();
    view.unmount();
  });

  it('每朵云由多个椭圆团块叠成（而不是一整块渐变）', () => {
    const view = render();
    const large = view.container.querySelector('[data-testid="wallpaper-cloud-large"]')!;
    const small = view.container.querySelector('[data-testid="wallpaper-cloud-small"]')!;
    // 团块数量下限：太少就退化成一块糊开的渐变
    expect(large.querySelectorAll('.xp-puff').length).toBeGreaterThanOrEqual(6);
    expect(small.querySelectorAll('.xp-puff').length).toBeGreaterThanOrEqual(5);
    view.unmount();
  });

  it('每朵云只有一块平底底盘，底缘是水平直线', () => {
    const view = render();
    const large = view.container.querySelector('[data-testid="wallpaper-cloud-large"]')!;
    // 底盘负责 XP Bliss 最标志性的平底；两块并排会在接缝处留下台阶缺口
    expect(large.querySelectorAll('.xp-puff--base').length).toBe(1);
    expect(large.querySelectorAll('.xp-puff--crown').length).toBeGreaterThanOrEqual(1);
    view.unmount();
  });

  it('云团块边缘锐利：靠 border-radius 硬切，不用模糊', () => {
    const puffRule = xpCss.slice(
      xpCss.indexOf('.xp-puff {'),
      xpCss.indexOf('.xp-puff--base'),
    );
    expect(puffRule).toMatch(/border-radius:\s*50%/);
    // 羽化（blur / 渐变羽化）会让云糊成灰白污渍，是这次要修掉的旧问题
    expect(puffRule).not.toMatch(/filter:\s*blur/);
    expect(puffRule).not.toMatch(/backdrop-filter/);
  });

  it('壁纸层覆盖任务栏以外的全部桌面区域', () => {
    // 壁纸底边要留给 30px 的任务栏
    expect(xpCss).toMatch(/\.xp-wallpaper\s*\{[^}]*inset:\s*0 0 30px 0/);
  });

  it('壁纸不引用外部图片（避免网络依赖与版权风险）', () => {
    const start = xpCss.indexOf('.xp-wallpaper');
    const end = xpCss.indexOf('.xp-desktop-icon {', start);
    const wallpaperCss = xpCss.slice(start, end === -1 ? undefined : end);
    expect(wallpaperCss).not.toMatch(/url\(/);
    expect(wallpaperCss).not.toMatch(/https?:/);
  });

  it('绿丘用渐变绘制而不是位图', () => {
    expect(xpCss).toMatch(/\.xp-wallpaper-hill\s*\{[\s\S]*?background:[\s\S]*?gradient/);
  });
});

describe('XP 动效', () => {
  it('窗口、开始菜单、通知气泡都有入场动画', () => {
    expect(hasCss('@keyframes xp-window-open')).toBe(true);
    expect(hasCss('@keyframes xp-menu-in')).toBe(true);
    expect(hasCss('@keyframes xp-notify-in')).toBe(true);
  });

  it('动画只在用户未表达减少动效偏好时启用', () => {
    const noPref = xpCss.slice(
      xpCss.indexOf('@media (prefers-reduced-motion: no-preference)'),
    );
    expect(noPref).toContain('xp-window-open');
    expect(noPref).toContain('.xp-start-menu');
    expect(noPref).toContain('.xp-notification');
  });

  it('prefers-reduced-motion: reduce 时关闭动画', () => {
    const reduceBlock = xpCss.slice(xpCss.indexOf('@media (prefers-reduced-motion: reduce)'));
    expect(reduceBlock).toContain('animation: none');
    expect(reduceBlock).toContain('.xp-window');
    expect(reduceBlock).toContain('.xp-start-menu');
    expect(reduceBlock).toContain('.xp-notification');
  });

  it('任务栏按钮状态变化有过渡', () => {
    expect(xpCss).toMatch(/\.xp-taskbar-button\s*\{[\s\S]*?transition:/);
  });
});
