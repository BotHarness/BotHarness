import { join } from 'node:path';

const BASE_BUNDLES = ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', 'deepseekbot'];
// The deepseekbot umbrella Patch inserts every owned Plugin (core, client,
// browser, computer); promoting a member to a top-level Bundle fails boot
// with a duplicate loader entry. Keep former separate entries in the owned
// set so reopening an older dev Profile migrates them into the umbrella.
const OWNED_BUNDLES = new Set([
  ...BASE_BUNDLES,
  '@botharness/browser',
  '@botharness/computer',
  '@botharness/core',
  '@botharness/ui',
]);

export function developmentProfileManifest(manifest, worktree) {
  const packages = join(worktree, 'packages');
  return {
    ...manifest,
    dependencies: {
      ...manifest.dependencies,
      '@botharness/ui': `link:${join(packages, 'client')}`,
      '@botharness/core': `link:${join(packages, 'core')}`,
      '@botharness/computer': `link:${join(packages, 'computer')}`,
      '@botharness/browser': `link:${join(packages, 'browser')}`,
      deepseekbot: `link:${join(packages, 'deepseekbot')}`,
    },
    dsh: {
      ...manifest.dsh,
      profile: {
        ...manifest.dsh?.profile,
        bundles: [
          ...BASE_BUNDLES,
          ...(manifest.dsh?.profile?.bundles ?? []).filter((bundle) => !OWNED_BUNDLES.has(bundle)),
        ],
      },
    },
  };
}
