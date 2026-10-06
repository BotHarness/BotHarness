import { build } from 'esbuild';

await build({
  entryPoints: ['src/client/admin-charts.ts'],
  outfile: 'public/admin/assets/admin-charts.js',
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  minify: true,
  legalComments: 'none',
});
