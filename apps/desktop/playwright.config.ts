import { defineConfig, devices } from '@playwright/test';

/**
 * E2E 配置
 *
 * 需要两个服务：
 *   1. 后端 API（:8080）—— 桌面的权威状态源
 *   2. 前端 Vite（:5173）—— 代理 /api 到 8080
 *
 * 两者都由 webServer 管理，测试可独立运行，无需手工先起后端。
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  // 服务端是窗口状态的权威源，窗口列表全局共享；
  // 并行执行会让各用例互相看到对方的窗口，因此串行跑。
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      // 后端
      command: 'node ../server/dist/index.js',
      cwd: '../server',
      url: 'http://localhost:8080/api/health',
      reuseExistingServer: true,
      timeout: 60000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      // 前端
      command: 'pnpm dev',
      url: 'http://localhost:5173',
      reuseExistingServer: true,
      timeout: 120000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],
});
