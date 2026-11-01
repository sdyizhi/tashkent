import { test as base, expect } from '@playwright/test';

/**
 * 桌面 E2E 夹具。
 *
 * 服务端是窗口状态的权威源（ADR-004），窗口列表在服务端是全局的。
 * 多个浏览器上下文并行跑用例时彼此会看到对方的窗口，因此：
 *  - 用例串行执行（workers = 1）；
 *  - 每个用例开始前通过公开 API 清空服务端的窗口列表。
 */
export const test = base.extend<{ resetDesktop: void }>({
  resetDesktop: [
    async ({ request, baseURL }, use) => {
      await closeAllWindows(request, baseURL);
      await use();
    },
    { auto: true },
  ],
});

async function closeAllWindows(
  request: import('@playwright/test').APIRequestContext,
  baseURL: string | undefined,
): Promise<void> {
  const origin = baseURL ?? 'http://localhost:5173';
  try {
    const res = await request.get(`${origin}/api/desktop/windows`);
    if (!res.ok()) return;
    const body = (await res.json()) as { windows: Array<{ id: string }> };
    for (const w of body.windows) {
      await request.delete(`${origin}/api/desktop/windows/${w.id}`);
    }
  } catch {
    // 后端不可达时跳过清理
  }
}

export { expect };
