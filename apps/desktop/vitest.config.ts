import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    // 需要读到样式表源码来断言动效规则（?raw 导入）
    css: true,
  },
});
