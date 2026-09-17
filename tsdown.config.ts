import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['packages/core/src/index.ts'],
  outDir: 'packages/core/dist',
  format: ['esm'],
  platform: 'node',
  dts: true,
  clean: true,
});
