import { test, expect } from './fixtures.js';

test.describe('M5 应用集', () => {
  test('桌面显示七个应用图标', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('desktop-icon-chat')).toBeVisible();
    await expect(page.getByTestId('desktop-icon-files')).toBeVisible();
    await expect(page.getByTestId('desktop-icon-notes')).toBeVisible();
    await expect(page.getByTestId('desktop-icon-browser')).toBeVisible();
    await expect(page.getByTestId('desktop-icon-terminal')).toBeVisible();
    await expect(page.getByTestId('desktop-icon-settings')).toBeVisible();
    await expect(page.getByTestId('desktop-icon-tasks')).toBeVisible();
  });

  test('开始菜单列出全部应用', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('start-button').click();
    await expect(page.getByTestId('start-menu')).toBeVisible();
    await expect(page.getByTestId('start-menu-item-notes')).toBeVisible();
    await expect(page.getByTestId('start-menu-item-tasks')).toBeVisible();
  });

  test('我的文档显示文件列表', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('desktop-icon-files').dblclick();
    await expect(page.getByTestId('files-list')).toBeVisible();
  });

  test('控制面板显示工具权限列表', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('desktop-icon-settings').dblclick();
    await expect(page.getByTestId('settings-tools')).toBeVisible();
    await expect(page.getByTestId('settings-tools')).toContainText('dangerous');
  });

  test('记事本可列出工作区文件', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('desktop-icon-notes').dblclick();
    await expect(page.getByTestId('notes-list')).toBeVisible();
  });

  test('浏览器拒绝 javascript: 协议', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('desktop-icon-browser').dblclick();
    await page.getByTestId('browser-url').fill('javascript:alert(1)');
    await page.getByTestId('browser-go').click();
    await expect(page.getByTestId('browser-error')).toContainText('只支持 http/https');
    await expect(page.getByTestId('browser-frame')).toHaveCount(0);
  });

  test('命令提示符在 shell 未启用时如实提示', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('desktop-icon-terminal').dblclick();
    await expect(page.getByTestId('terminal-disabled')).toContainText('shell 工具未启用');
  });

  test('任务管理器显示 Agent 与工具列表', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('desktop-icon-tasks').dblclick();
    await expect(page.getByTestId('tasks-agents')).toBeVisible();
    await expect(page.getByTestId('tasks-tools')).toContainText('fs.read');
  });
});
