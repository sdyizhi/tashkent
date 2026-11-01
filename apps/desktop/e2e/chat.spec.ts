import { test, expect } from './fixtures.js';

test('聊天窗口可创建会话并显示连接状态', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('desktop-icon-chat').dblclick();
  await expect(page.getByTestId('chat-input')).toBeVisible();
  await expect(page.getByTestId('window-chat')).toContainText('已连接', { timeout: 15000 });
});

test('聊天窗口显示已创建的会话 ID', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('desktop-icon-chat').dblclick();
  await expect(page.getByTestId('chat-status')).toContainText('会话', { timeout: 15000 });
  // 会话 ID 创建成功后应不再是「创建中…」
  await expect(page.getByTestId('chat-status')).not.toContainText('创建中…', { timeout: 15000 });
});

test('发送消息后消息出现在对话记录中', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('desktop-icon-chat').dblclick();
  await expect(page.getByTestId('chat-status')).not.toContainText('创建中…', { timeout: 15000 });

  await page.getByTestId('chat-input').fill('你好');
  await page.getByTestId('chat-send').click();

  await expect(page.getByTestId('chat-user-message')).toHaveText('你好');
});

test('桌面状态持久化：图标布局写入服务端后可读回', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('desktop-icon-chat')).toBeVisible();

  await expect
    .poll(
      async () => {
        const res = await page.request.get('/api/desktop/state?key=desktop');
        if (!res.ok()) return null;
        const body = (await res.json()) as { value: { icons?: unknown[] } | null };
        return body.value?.icons?.length ?? 0;
      },
      { timeout: 15000 },
    )
    .toBeGreaterThan(0);
});
