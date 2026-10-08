import { expect, it } from 'vitest';
import { createCore } from '../src/plugin.js';
import { createBridgeMethods } from '../src/bridge/methods.js';
import { registerBridge } from '../src/bridge/rpc.js';
import { Context } from '@deepseek-ai/cordis';
import { createTempRoot } from './helpers.js';

it.each(['slack', 'discord'] as const)(
  '%s reads and saves qualified defaults through the public RPC without crossing platform revisions',
  async (platform) => {
    const core = createCore({ dshHome: createTempRoot('bh-platform-defaults-') });
    const methods = createBridgeMethods({ ...core });
    const service = registerBridge(new Context(), methods);
    try {
      const lark = await service.messagingDefaults();
      const slack = await service.messagingDefaults(platform);
      expect(slack).toMatchObject({ platform, revision: 0, collection: 'mentions' });
      const { revision, changedAt: _at, ...preferences } = slack;
      const saved = await service.messagingDefaultsSet({
        ...preferences,
        expectedRevision: revision,
        collection: 'all',
        count: 2,
      });
      expect(saved).toMatchObject({ platform, revision: 1, collection: 'all', count: 2 });
      expect(await service.messagingDefaults()).toEqual(lark);
      expect(await service.messagingDefaults(platform)).toEqual(saved);
      await expect(
        service.messagingDefaultsSet({ ...preferences, expectedRevision: revision, count: 9 }),
      ).rejects.toMatchObject({ code: 'defaults-stale' });
      expect(await methods.messagingDefaults({ platform: 'weixin' })).toMatchObject({
        ok: false,
        error: { code: 'invalid-input' },
      });
      expect(await methods.messagingDefaults({ platform: 'slack', extra: true })).toMatchObject({
        ok: false,
      });
      expect(
        await methods.messagingDefaultsSet({
          ...preferences,
          platform: 'weixin',
          expectedRevision: 0,
        }),
      ).toMatchObject({ ok: false });
    } finally {
      core.externalMessaging.close();
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  },
);
