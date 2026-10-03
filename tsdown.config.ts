import { defineConfig, type UserConfig } from 'tsdown';

const CLIENT_ID = '@botharness/ui';

const PLATFORM_MODULES = [
  /^react$/,
  /^react\/jsx-runtime$/,
  /^react\/jsx-dev-runtime$/,
  /^react-dom$/,
  /^react-dom\/client$/,
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-dockkit',
];

function clientBundle(id: string, entry: string[], outDir: string): UserConfig {
  return {
    entry,
    outDir,
    format: ['cjs'],
    platform: 'browser',
    dts: false,
    clean: true,
    sourcemap: true,
    external: PLATFORM_MODULES,
    outputOptions: {
      entryFileNames: 'client.js',
      banner: `window.__ModuleLoader__.load({
  id: '${id}',
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;`,
      footer: `    return module.exports;
  },
});`,
    },
  };
}

export const CLIENT_BUNDLE_OUT_DIR = 'packages/client/lib';

export const clientBundleOptions: UserConfig = clientBundle(
  CLIENT_ID,
  ['packages/client/src/client/index.ts'],
  CLIENT_BUNDLE_OUT_DIR,
);

export const computerClientBundleOptions: UserConfig = clientBundle(
  '@botharness/computer',
  ['packages/computer/src/client/index.tsx'],
  'packages/computer/lib',
);

export const browserClientBundleOptions: UserConfig = clientBundle(
  '@botharness/browser',
  ['packages/browser/src/client/index.tsx'],
  'packages/browser/lib',
);

export default defineConfig([
  {
    entry: ['packages/core/src/index.ts'],
    outDir: 'packages/core/dist',
    format: ['esm'],
    platform: 'node',
    dts: true,
    clean: true,
    external: [
      '@resvg/resvg-js',
      '@deepseek-ai/dsh-agent',
      '@deepseek-ai/dsh-llm',
      '@deepseek-ai/dsh-session',
      '@deepseek-ai/dsh-tools',
    ],
  },
  {
    entry: ['packages/client/src/index.ts'],
    outDir: 'packages/client/dist',
    format: ['esm'],
    platform: 'node',
    dts: true,
    clean: true,
  },
  {
    entry: ['packages/computer/src/index.ts'],
    outDir: 'packages/computer/dist',
    format: ['esm'],
    platform: 'node',
    dts: true,
    clean: true,
  },
  {
    entry: ['packages/browser/src/index.ts'],
    outDir: 'packages/browser/dist',
    format: ['esm'],
    platform: 'node',
    dts: true,
    clean: true,
  },
  clientBundleOptions,
  computerClientBundleOptions,
  browserClientBundleOptions,
]);
