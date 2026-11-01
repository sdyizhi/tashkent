import { test, expect } from './fixtures.js';

test.describe('桌面外壳交互', () => {
  test('显示壁纸、任务栏与桌面图标', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('wallpaper')).toBeVisible();
    await expect(page.getByTestId('taskbar')).toBeVisible();
    await expect(page.getByTestId('desktop-icon-chat')).toBeVisible();
  });

  test('双击桌面图标打开窗口', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('desktop-icon-chat').dblclick();
    await expect(page.getByTestId('window-chat')).toBeVisible();
  });

  test('重复双击同一图标聚焦已有窗口，不新建第二个窗口', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('desktop-icon-chat').dblclick();
    await expect(page.getByTestId('window-chat')).toBeVisible();

    // 再双击一次：XP 语义是聚焦已有窗口，而不是再开一个
    await page.getByTestId('desktop-icon-chat').dblclick();
    await page.waitForTimeout(500);
    await expect(page.getByTestId('window-chat')).toHaveCount(1);

    const res = await page.request.get('/api/desktop/windows');
    expect(res.ok()).toBe(true);
    const body = (await res.json()) as { windows: Array<{ appId: string }> };
    expect(body.windows.filter((w) => w.appId === 'chat')).toHaveLength(1);
  });

  test('双击已最小化的图标把窗口恢复并置顶', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('desktop-icon-chat').dblclick();
    await expect(page.getByTestId('window-chat')).toBeVisible();
    await page.getByLabel('最小化').click();
    await expect(page.getByTestId('window-chat')).toHaveCount(0);

    // 再次双击图标：窗口应被恢复，而不是新建一个
    await page.getByTestId('desktop-icon-chat').dblclick();
    await expect(page.getByTestId('window-chat')).toHaveCount(1);
    await expect(page.getByTestId('window-chat')).toBeVisible();

    const res = await page.request.get('/api/desktop/windows');
    const body = (await res.json()) as { windows: Array<{ appId: string; mode: string }> };
    const chatWindows = body.windows.filter((w) => w.appId === 'chat');
    expect(chatWindows).toHaveLength(1);
    expect(chatWindows[0]?.mode).toBe('normal');
  });

  test('开始菜单可展开并可启动应用', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('start-button').click();
    await expect(page.getByTestId('start-menu')).toBeVisible();
    await page.getByTestId('start-menu-item-files').click();
    await expect(page.getByTestId('window-files')).toBeVisible();
  });

  test('窗口最小化后从任务栏还原', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('desktop-icon-chat').dblclick();
    await page.getByLabel('最小化').click();
    await expect(page.getByTestId('window-chat')).toHaveCount(0);
    await page.locator('.xp-taskbar-button').first().click();
    await expect(page.getByTestId('window-chat')).toBeVisible();
  });

  test('关闭按钮关闭窗口', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('desktop-icon-chat').dblclick();
    await page.getByLabel('关闭').click();
    await expect(page.getByTestId('window-chat')).toHaveCount(0);
  });

  test('可拖拽窗口', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('desktop-icon-chat').dblclick();
    const win = page.getByTestId('window-chat');
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

  test('窗口布局由服务端权威持有，刷新后恢复', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('desktop-icon-chat').dblclick();
    const win = page.getByTestId('window-chat');
    await expect(win).toBeVisible();

    const before = await win.boundingBox();
    if (!before) throw new Error('no bounding box');

    // 服务端权威列表里应能看到该窗口
    await expect
      .poll(
        async () => {
          const res = await page.request.get('/api/desktop/windows');
          if (!res.ok()) return 0;
          const body = (await res.json()) as { windows: Array<{ id: string }> };
          return body.windows.length;
        },
        { timeout: 15000 },
      )
      .toBeGreaterThan(0);

    // 刷新页面：窗口应按服务端持久化的布局恢复
    await page.reload();
    await expect(page.getByTestId('window-chat')).toBeVisible();
    const after = await page.getByTestId('window-chat').boundingBox();
    expect(Math.round(after?.x ?? -1)).toBe(Math.round(before.x));
    expect(Math.round(after?.y ?? -1)).toBe(Math.round(before.y));
  });
});
