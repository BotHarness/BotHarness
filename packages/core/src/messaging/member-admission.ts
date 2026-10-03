import type { DatabaseSync } from 'node:sqlite';
import type { ChannelRecord } from '../channels/channel.js';
import { defaultGroupWakePolicy, type BotSourcePolicyStore } from '../runtime/source-policy.js';
import type { ThreadReceptionPolicy } from './thread-policy.js';

export function admitBridgeMembers(
  db: DatabaseSync,
  sourceEventId: string,
  channel: ChannelRecord,
  sourcePolicy: BotSourcePolicyStore,
  isBotActive: (botSlug: string) => boolean,
  followed?: {
    botSlug: string;
    wake: NonNullable<ThreadReceptionPolicy['wake']>;
    revision: number;
  },
): string[] {
  const admitted: string[] = [];
  for (const botSlug of channel.members) {
    if (!isBotActive(botSlug)) continue;
    const rule = sourcePolicy.resolveIn(db, botSlug, 'group-ordinary');
    const policy = channel.wakePolicies?.[botSlug] ?? defaultGroupWakePolicy(rule);
    const thread = followed?.botSlug === botSlug ? followed : undefined;
    const mode = thread
      ? thread.wake.wake === 'immediate'
        ? 'all'
        : thread.wake.wake
      : policy.mode;
    const result = db
      .prepare(`INSERT OR IGNORE INTO inbox_admissions
      (source_event_id, bot_slug, reason, source_policy_revision, source_policy_wake_mode,
       wake_policy_revision, wake_mode, wake_count, wake_interval_ms, external_thread_policy_revision)
      VALUES (?, ?, 'group-ordinary', ?, ?, ?, ?, ?, ?, ?)`)
      .run(
        sourceEventId,
        botSlug,
        rule.revision,
        rule.wake,
        policy.revision,
        mode,
        mode === 'all' ? 1 : mode === 'digest' ? (thread?.wake.count ?? policy.count) : null,
        mode === 'all'
          ? 0
          : mode === 'digest'
            ? (thread?.wake.intervalSeconds ?? policy.intervalSeconds) * 1000
            : null,
        thread?.revision ?? null,
      );
    if (result.changes > 0) admitted.push(botSlug);
  }
  return admitted;
}
