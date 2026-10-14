import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: '/squash-rally/',
  server: { port: 5173, strictPort: true },
  build: {
    chunkSizeWarningLimit: 600, // three.js 단독 청크(약 550kB)는 의도된 것
    // three.js는 따로 묶어 브라우저 캐시를 오래 쓰게 한다
    rolldownOptions: { output: { codeSplitting: { groups: [{ name: 'three', test: /node_modules[\/]three/ }] } } },
  },
  test: { include: ['tests/**/*.test.ts'] },
});
