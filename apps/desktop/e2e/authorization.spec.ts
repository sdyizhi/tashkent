import { test, expect } from './fixtures.js';

/**
 * 授权确认对话框的端到端验证。
 *
 * 环境里没有可用的 LLM key，无法让 Agent 真的触发 write 工具，
 * 因此这里拦截 /api/events，注入一条真实的 SSE 帧，
 * 验证「SSE 事件 → 前端弹出对话框 → 用户决策回传服务端」这条链路。
 */
const AUTH_EVENT = {
  type: 'authorization_required',
  sessionId: 's1',
  authorizationId: 'auth-e2e-1',
  toolCallId: 'c1',
  toolName: 'fs.write',
  args: { path: 'note.txt', content: '你好' },
  reason: '工具「fs.write」将修改文件或创建内容，需要确认',
};

test('授权请求弹出确认对话框，展示工具名与参数', async ({ page }) => {
  await page.route('**/api/events', async (route) => {
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
      body: `id: 1\nevent: agent-event\ndata: ${JSON.stringify(AUTH_EVENT)}\n\n`,
    });
  });

  await page.goto('/');

  const dialog = page.getByTestId('authorization-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('fs.write');
  await expect(dialog).toContainText('note.txt');
  await expect(page.getByTestId('authorization-approve')).toBeVisible();
  await expect(page.getByTestId('authorization-deny')).toBeVisible();
});

test('点击「同意」把授权决策回传服务端', async ({ page }) => {
  await page.route('**/api/events', async (route) => {
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
      body: `id: 1\nevent: agent-event\ndata: ${JSON.stringify(AUTH_EVENT)}\n\n`,
    });
  });

  let posted: unknown = null;
  await page.route('**/api/tools/*/authorize', async (route) => {
    posted = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true }),
    });
  });

  await page.goto('/');
  await expect(page.getByTestId('authorization-dialog')).toBeVisible();

  await page.getByTestId('authorization-approve').click();

  await expect.poll(() => posted).toEqual({
    authorizationId: 'auth-e2e-1',
    approved: true,
    remember: false,
  });
  // 决策提交后对话框关闭
  await expect(page.getByTestId('authorization-dialog')).toHaveCount(0);
});

test('点击「拒绝」把 approved=false 回传服务端', async ({ page }) => {
  await page.route('**/api/events', async (route) => {
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
      body: `id: 1\nevent: agent-event\ndata: ${JSON.stringify(AUTH_EVENT)}\n\n`,
    });
  });

  let posted: unknown = null;
  await page.route('**/api/tools/*/authorize', async (route) => {
    posted = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true }),
    });
  });

  await page.goto('/');
  await expect(page.getByTestId('authorization-dialog')).toBeVisible();

  await page.getByTestId('authorization-deny').click();

  await expect.poll(() => posted).toEqual({
    authorizationId: 'auth-e2e-1',
    approved: false,
    remember: false,
  });
});

test('勾选「记住」后同意会带上 remember=true', async ({ page }) => {
  await page.route('**/api/events', async (route) => {
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
      body: `id: 1\nevent: agent-event\ndata: ${JSON.stringify(AUTH_EVENT)}\n\n`,
    });
  });

  let posted: unknown = null;
  await page.route('**/api/tools/*/authorize', async (route) => {
    posted = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true }),
    });
  });

  await page.goto('/');
  await expect(page.getByTestId('authorization-dialog')).toBeVisible();

  await page.getByTestId('authorization-remember').check();
  await page.getByTestId('authorization-approve').click();

  await expect.poll(() => posted).toEqual({
    authorizationId: 'auth-e2e-1',
    approved: true,
    remember: true,
  });
});
