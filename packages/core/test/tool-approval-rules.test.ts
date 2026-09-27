import { rmSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { createToolApprovalRuleStore } from '../src/workspaces/tool-approval-rules.js';
import { createTempRoot } from './helpers.js';

describe('durable tool approval rules', () => {
  it('matches exact calls and broad opaque calls within one Bot and scope, then revokes immediately', () => {
    const home = createTempRoot('botharness-tool-rules-');
    let owner = mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
    const store = () =>
      createToolApprovalRuleStore(attachOperationalModule(owner, 'tool-approval-rules'));
    const target = {
      botSlug: 'ada',
      role: 'assignment' as const,
      scopeKey: 'grant-1',
      toolName: 'bash',
      input: '{"command":"pwd"}',
    };
    try {
      const exact = store().createPending({ ...target, kind: 'exact' });
      expect(store().match(target)).toBeUndefined();
      expect(store().list('ada')).toEqual([]);
      store().activate('ada', exact.id);
      expect(
        store()
          .list('ada')
          .map((rule) => rule.id),
      ).toEqual([exact.id]);
      expect(store().match(target)?.id).toBe(exact.id);
      expect(store().match({ ...target, botSlug: 'bob' })).toBeUndefined();
      expect(store().match({ ...target, scopeKey: 'grant-2' })).toBeUndefined();
      expect(store().match({ ...target, input: '{"command":"cat /etc/passwd"}' })).toBeUndefined();
      expect(store().match({ ...target, role: 'orchestrator' })).toBeUndefined();
      owner.close();
      owner = mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
      expect(store().match(target)?.id).toBe(exact.id);
      expect(store().revoke('ada', exact.id)?.revokedAt).toBeDefined();
      expect(store().match(target)).toBeUndefined();
      const broad = store().createPending({
        ...target,
        kind: 'all-opaque',
        toolName: '*',
        input: '',
      });
      store().activate('ada', broad.id);
      expect(store().match({ ...target, toolName: 'run_code', input: '{"code":"1+1"}' })?.id).toBe(
        broad.id,
      );
      expect(store().match({ ...target, scopeKey: 'grant-2' })).toBeUndefined();
      store().revoke('ada', broad.id);
      expect(store().match(target)).toBeUndefined();
    } finally {
      owner.close();
      rmSync(home, { recursive: true, force: true });
    }
  });
});
