import { test, expect } from './fixtures.js';

/**
 * M6 视觉打磨验收：图标集 / 动效 / 托盘浮层。
 *
 * 全局配置里开了 reducedMotion: 'reduce'（动效关闭），
 * 让位置类断言保持稳定；这里用 test.use 单独开一个「动效开启」的上下文，
 * 验证动效本身不会破坏交互。
 */
test.describe('M6 视觉打磨', () => {
  test('桌面图标用自绘 SVG 而不是 emoji', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('desktop-icon-chat')).toBeVisible();

    const svg = page.getByTestId('desktop-icon-chat').locator('svg');
    await expect(svg).toHaveCount(1);
    // emoji 回退不应出现
    await expect(page.getByTestId('desktop-icon-chat')).not.toContainText('💬');
  });

  test('开始菜单项用自绘 SVG 图标', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('start-button').click();
    await expect(page.getByTestId('start-menu')).toBeVisible();

    const svg = page.getByTestId('start-menu-item-notes').locator('svg');
    await expect(svg).toHaveCount(1);
  });

  test('双击时钟弹出 XP 日历并高亮今天', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('clock').dblclick();

    await expect(page.getByTestId('calendar-popup')).toBeVisible();
    await expect(page.getByTestId('calendar-title')).toContainText('年');
    // 6 行 × 7 列
    await expect(page.getByTestId('calendar-grid').locator('.xp-calendar-day')).toHaveCount(42);
    // 今天恰好一个高亮
    await expect(page.locator('.xp-calendar-day[data-today="true"]')).toHaveCount(1);
  });

  test('日历可关闭', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('clock').dblclick();
    await expect(page.getByTestId('calendar-popup')).toBeVisible();

    await page.getByTestId('calendar-close').click();
    await expect(page.getByTestId('calendar-popup')).toHaveCount(0);
  });

  test('点击托盘图标弹出状态气泡并可关闭', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('tray-icon').click();

    await expect(page.getByTestId('tray-bubble')).toBeVisible();
    await expect(page.getByTestId('bubble-connection')).toBeVisible();
    await expect(page.getByTestId('bubble-model')).toBeVisible();
    await expect(page.getByTestId('bubble-agent-count')).toBeVisible();

    await page.getByTestId('bubble-close').click();
    await expect(page.getByTestId('tray-bubble')).toHaveCount(0);
  });

  test('壁纸渲染出天空与绿丘图层', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('wallpaper-sky')).toBeVisible();
    await expect(page.getByTestId('wallpaper-hill')).toBeVisible();
    await expect(page.getByTestId('wallpaper-hill-far')).toBeVisible();
  });
});

test.describe('M6 动效开启时的交互', () => {
  // 这个上下文显式打开动效：验证入场动画不会让窗口变得不可点击 / 不可拖拽
  test.use({ reducedMotion: 'no-preference' });

  test('窗口打开动画期间仍可拖拽', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('desktop-icon-chat').dblclick();
    const win = page.getByTestId('window-chat');
    await expect(win).toBeVisible();

    // 立刻拖拽（动画尚未结束）
    const before = await win.boundingBox();
    const title = win.locator('.xp-titlebar');
    const box = await title.boundingBox();
    if (!before || !box) throw new Error('no bounding box');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2 + 60, { steps: 8 });
    await page.mouse.up();

    const after = await win.boundingBox();
    expect(after?.x).not.toBe(before.x);
  });

  test('窗口打开动画期间仍可点击关闭按钮', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('desktop-icon-chat').dblclick();
    await expect(page.getByTestId('window-chat')).toBeVisible();

    // 立刻点关闭：窗口应被关掉
    await page.getByLabel('关闭').click();
    await expect(page.getByTestId('window-chat')).toHaveCount(0);
  });

  test('开始菜单弹出的同时窗口仍可交互', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('start-button').click();
    await expect(page.getByTestId('start-menu')).toBeVisible();
    // 菜单打开时也能点任务栏的开始按钮收起它
    await page.getByTestId('start-button').click();
    await expect(page.getByTestId('start-menu')).toHaveCount(0);
  });
});
