import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  oxc: { jsx: { runtime: 'automatic', importSource: 'react' } },
  resolve: { alias: { '@': fileURLToPath(new URL('./apps/docs/src', import.meta.url)) } },
  test: {
    fileParallelism: false,
    testTimeout: 15_000,
    include: [
      'packages/*/test/**/*.test.ts',
      'apps/docs/test/**/*.test.ts',
      'scripts/test/**/*.test.mjs',
    ],
  },
});
