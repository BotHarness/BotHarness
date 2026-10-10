import { expect, it } from 'vitest';
import { developmentProfileManifest } from '../../../scripts/dev-profile.mjs';

it('retains installed optional Bundle composition and relinks only BotHarness packages', () => {
  const manifest = {
    name: 'web-dev',
    dependencies: { '@xmanrui/dsh-im': '4.32.0', deepseekbot: 'link:/old' },
    dsh: {
      profile: {
        bundles: ['@deepseek-ai/dsh-base', 'deepseekbot', '@xmanrui/dsh-im'],
        custom: true,
      },
    },
  };
  const updated = developmentProfileManifest(manifest, '/worktree');
  expect(updated.dependencies['@xmanrui/dsh-im']).toBe('4.32.0');
  expect(updated.dependencies.deepseekbot).toBe('link:/worktree/packages/deepseekbot');
  expect(updated.dependencies['@botharness/browser']).toBe('link:/worktree/packages/browser');
  expect(updated.dependencies['@botharness/computer']).toBe('link:/worktree/packages/computer');
  expect(updated.dsh.profile.bundles).toEqual([
    '@deepseek-ai/dsh-base',
    '@deepseek-ai/dsh-web-app',
    'deepseekbot',
    '@xmanrui/dsh-im',
  ]);
  expect(updated.dsh.profile.custom).toBe(true);
  expect(manifest.dependencies.deepseekbot).toBe('link:/old');
});

it('migrates formerly separate browser/computer Bundles into the umbrella', () => {
  const manifest = {
    name: 'web-dev',
    dependencies: {},
    dsh: {
      profile: {
        bundles: [
          '@deepseek-ai/dsh-base',
          '@deepseek-ai/dsh-web-app',
          'deepseekbot',
          '@botharness/computer',
          '@botharness/browser',
        ],
      },
    },
  };
  const updated = developmentProfileManifest(manifest, '/worktree');
  expect(updated.dsh.profile.bundles).toEqual([
    '@deepseek-ai/dsh-base',
    '@deepseek-ai/dsh-web-app',
    'deepseekbot',
  ]);
});
