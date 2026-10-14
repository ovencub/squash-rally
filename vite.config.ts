import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: '/squash-rally/',
  server: { port: 5173, strictPort: true },
  test: { include: ['tests/**/*.test.ts'] },
});
