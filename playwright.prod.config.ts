import { defineConfig, devices } from '@playwright/test';

// 배포용 빌드(vite preview)로 브라우저 3종 호환성 스모크 테스트: npm run e2e:prod
export default defineConfig({
  testDir: 'tests/prod',
  outputDir: 'test-results/prod',
  timeout: 60_000,
  use: { baseURL: 'http://localhost:4173/squash-rally/' },
  webServer: {
    command: 'npm run build && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173/squash-rally/',
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], launchOptions: { args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] } },
    },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
});
