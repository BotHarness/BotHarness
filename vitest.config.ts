import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Native Windows Git and SQLite tests exceed per-test budgets under file-level contention.
    fileParallelism: process.platform !== 'win32',
    testTimeout: process.platform === 'win32' ? 15_000 : 5_000,
    include: [
      'packages/*/test/**/*.test.ts',
      'apps/docs/test/**/*.test.ts',
      'scripts/test/**/*.test.mjs',
    ],
  },
});
