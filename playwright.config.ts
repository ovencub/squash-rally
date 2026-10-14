import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  outputDir: 'test-results',
  use: {
    baseURL: 'http://localhost:5173/squash-rally/',
    // 기본 headless는 소프트웨어 렌더링이라 FPS가 낮게 나옴 → GPU 사용
    launchOptions: { args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] },
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173/squash-rally/',
    reuseExistingServer: true,
  },
});
