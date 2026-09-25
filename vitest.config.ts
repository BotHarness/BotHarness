import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Git-backed fixtures and the docs build contend when test files run together.
    fileParallelism: false,
    testTimeout: process.platform === 'win32' ? 15_000 : 5_000,
    include: [
      'packages/*/test/**/*.test.ts',
      'apps/docs/test/**/*.test.ts',
      'scripts/test/**/*.test.mjs',
    ],
  },
});
