import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { createWorkspaceGrantStore, type DshWorkspace } from '../src/workspaces/grants.js';
import { createTempRoot, FIXED_NOW } from './helpers.js';

describe('Workspace Grant store', () => {
  it('records a canonical DSH Workspace and blocks later use after revocation', async () => {
    const home = createTempRoot('botharness-grant-');
    const path = join(home, 'project');
    mkdirSync(path);
    const owner = mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
    let workspace: DshWorkspace | undefined = {
      id: 'workspace-1',
      path,
      title: 'Project',
      status: async () => 'ok',
    };
    let index = 0;
    const grants = createWorkspaceGrantStore({
      database: attachOperationalModule(owner, 'workspace-grants'),
      now: FIXED_NOW,
      createId: () => `grant-${++index}`,
      workspaces: () => ({
        get: (id) => (id === workspace?.id ? workspace : undefined),
        list: () => (workspace === undefined ? [] : [workspace]),
      }),
    });
    try {
      const first = await grants.create('ada', 'workspace-1');
      expect(first).toMatchObject({
        id: 'grant-1',
        botSlug: 'ada',
        workspaceId: 'workspace-1',
        workspacePath: path,
      });
      expect(await grants.create('ada', 'workspace-1')).toEqual(first);
      expect(grants.requireActive('ada', first.id)).toEqual(first);
      expect(() => grants.requireActive('bob', first.id)).toThrow(/missing or revoked/);

      const revoked = grants.revoke('ada', first.id);
      expect(revoked.revokedAt).toBe(FIXED_NOW().toISOString());
      expect(() => grants.requireActive('ada', first.id)).toThrow(/missing or revoked/);
      expect((await grants.create('ada', 'workspace-1')).id).toBe('grant-2');

      workspace = { ...workspace!, path: join(home, 'other') };
      expect(() => grants.requireActive('ada', 'grant-2')).toThrow(/unavailable/);
      workspace = undefined;
      await expect(grants.create('ada', 'workspace-1')).rejects.toThrow(/Unknown DSH Workspace/);
    } finally {
      owner.close();
      rmSync(home, { recursive: true, force: true });
    }
  });
});
