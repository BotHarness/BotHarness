import { z } from 'zod';
import type { DatabaseSync } from 'node:sqlite';
import type { BotSourcePolicyEditor } from '../runtime/source-policy.js';
import { DEFAULT_GROUP_WAKE_POLICY } from '../channels/channel.js';

export const groupReceptionInput = z
  .object({
    collection: z.enum(['mentions', 'all']),
    wake: z.enum(['immediate', 'digest', 'mentions', 'silent']),
    count: z.number().int().min(1).max(100),
    intervalSeconds: z.number().int().min(1).max(86400),
  })
  .strict();

export type GroupReceptionInput = z.infer<typeof groupReceptionInput>;
export interface GroupReceptionPolicy extends GroupReceptionInput {
  revision: number;
  changedAt: string;
  editor: BotSourcePolicyEditor | { kind: 'built-in' };
}

export function groupReceptionPolicy(db: DatabaseSync, grantId: string): GroupReceptionPolicy {
  const row = db
    .prepare(
      'SELECT body FROM messaging_group_policy_revisions WHERE grant_id = ? ORDER BY revision DESC LIMIT 1',
    )
    .get(grantId) as { body: string } | undefined;
  return row
    ? (JSON.parse(row.body) as GroupReceptionPolicy)
    : {
        revision: 0,
        changedAt: '',
        editor: { kind: 'built-in' },
        collection: 'mentions',
        wake: 'digest',
        count: DEFAULT_GROUP_WAKE_POLICY.count,
        intervalSeconds: DEFAULT_GROUP_WAKE_POLICY.intervalSeconds,
      };
}

export function commitGroupReceptionPolicy(
  db: DatabaseSync,
  grantId: string,
  input: GroupReceptionInput,
  editor: BotSourcePolicyEditor,
): GroupReceptionPolicy {
  const policy: GroupReceptionPolicy = {
    ...groupReceptionInput.parse(input),
    revision: groupReceptionPolicy(db, grantId).revision + 1,
    changedAt: new Date().toISOString(),
    editor,
  };
  db.prepare(
    'INSERT INTO messaging_group_policy_revisions (grant_id, revision, body) VALUES (?, ?, ?)',
  ).run(grantId, policy.revision, JSON.stringify(policy));
  return policy;
}

export function initializeGroupReceptionPolicy(db: DatabaseSync, grantId: string): void {
  const policy = groupReceptionPolicy(db, grantId);
  if (policy.revision !== 0) return;
  const initial = { ...policy, changedAt: new Date().toISOString() };
  db.prepare(
    'INSERT OR IGNORE INTO messaging_group_policy_revisions (grant_id, revision, body) VALUES (?, 0, ?)',
  ).run(grantId, JSON.stringify(initial));
}
