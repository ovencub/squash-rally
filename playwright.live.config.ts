import { defineConfig } from '@playwright/test';
// 배포된 사이트에서 직접 확인 (예: npx playwright test -c playwright.live.config.ts online)
export default defineConfig({
  testDir: 'tests/e2e',
  outputDir: 'test-results/live',
  use: {
    baseURL: 'https://ovencub.github.io/squash-rally/',
    launchOptions: { args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] },
  },
});
