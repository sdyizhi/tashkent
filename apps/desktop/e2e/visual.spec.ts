import { test, expect } from './fixtures.js';

/**
 * 视觉回归基线。
 *
 * 基线在 M5 全部应用落地后才生成（M6 视觉打磨阶段），
 * 因此基线反映的是「完整桌面」的样子：七个应用图标 + Bliss 壁纸 + 任务栏。
 *
 * 生成与更新：
 *   pnpm exec playwright test --update-snapshots
 *
 * 注意：基线依赖字体渲染（XP 字体栈为 Tahoma / Microsoft Sans Serif），
 * 不同操作系统上可能有细微差异。提交基线时需在同一环境下生成。
 */

/** 桌面截图里会变化的元素（时钟每秒刷新、会话 id 随机） */
const desktopMask = (page: import('@playwright/test').Page) => [page.getByTestId('clock')];

/** 遮罩颜色：用深灰而不是默认的洋红，避免基线里出现突兀色块 */
const maskColor = '#808080';

test.describe('视觉回归', () => {
  // 基线在 Windows 上生成（XP 字体栈 Tahoma 渲染），Linux CI 的字体渲染不同，
  // 像素对比必然超阈值。视觉回归是本地开发回归用的，CI 上跳过。
  test.skip(
    process.env.CI === 'true',
    '视觉基线依赖字体渲染，与 CI 的 Linux 环境不兼容（基线在 Windows 生成）',
  );

  test('桌面视觉基线', async ({ page }) => {
    await page.goto('/');
    // 等待应用注册表拉取完成、桌面图标渲染出来
    await expect(page.getByTestId('desktop-icon-chat')).toBeVisible();
    await expect(page.getByTestId('desktop-icon-tasks')).toBeVisible();
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot('desktop.png', {
      maxDiffPixelRatio: 0.02,
      animations: 'disabled',
      mask: desktopMask(page),
      maskColor,
    });
  });

  test('窗口视觉基线', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('desktop-icon-chat').dblclick();
    await expect(page.getByTestId('window-chat')).toBeVisible();
    await page.waitForTimeout(500);

    await expect(page.getByTestId('window-chat')).toHaveScreenshot('window-chat.png', {
      maxDiffPixelRatio: 0.02,
      animations: 'disabled',
      // 会话 id 与连接状态是动态内容，遮罩掉避免基线失效
      mask: [page.getByTestId('chat-status')],
      maskColor,
    });
  });

  test('开始菜单视觉基线', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('start-button').click();
    await expect(page.getByTestId('start-menu')).toBeVisible();
    await page.waitForTimeout(300);

    await expect(page.getByTestId('start-menu')).toHaveScreenshot('start-menu.png', {
      maxDiffPixelRatio: 0.02,
      animations: 'disabled',
    });
  });
});
