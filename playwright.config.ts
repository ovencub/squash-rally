import { defineConfig } from '@playwright/test';

// e2e 전용 포트 (5173은 다른 프로젝트 dev 서버와 겹칠 수 있어 따로 씀)
const PORT = 5199;

export default defineConfig({
  testDir: 'tests/e2e',
  outputDir: 'test-results',
  use: {
    baseURL: `http://localhost:${PORT}/squash-rally/`,
    // 기본 headless는 소프트웨어 렌더링이라 FPS가 낮게 나옴 → GPU 사용
    launchOptions: { args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] },
  },
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/squash-rally/`,
    reuseExistingServer: true,
  },
});
