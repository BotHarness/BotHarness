import type { DatabaseSync } from 'node:sqlite';

import { DEFAULT_GROUP_WAKE_POLICY, type GroupWakePolicy } from '../channels/channel.js';
import type { OperationalDatabaseModulePort } from '../database/owner.js';

export const BOT_SOURCE_DEFAULTS = {
  'human-dm': { wake: 'immediate' },
  'bot-dm': { wake: 'immediate' },
  'group-mention': { wake: 'immediate' },
  'group-ordinary': {
    wake: 'digest',
    digestCount: DEFAULT_GROUP_WAKE_POLICY.count,
    digestIntervalSeconds: DEFAULT_GROUP_WAKE_POLICY.intervalSeconds,
  },
  'group-invite': { wake: 'immediate' },
  'group-join-request': { wake: 'immediate' },
  'group-join-decision': { wake: 'immediate' },
  'assignment-report': { wake: 'conditional' },
  'assignment-lifecycle': { wake: 'immediate' },
} as const;

export type BotSourceClass = keyof typeof BOT_SOURCE_DEFAULTS;
export type BotSourceWake = 'immediate' | 'digest' | 'conditional';

export interface BotSourcePolicy {
  sourceClass: BotSourceClass;
  admission: 'admit';
  wake: BotSourceWake;
  digestCount?: number;
  digestIntervalSeconds?: number;
  revision: number;
  lastActor: { kind: 'built-in' };
  changedAt: string;
}

export interface BotSourcePolicyStore {
  resolveIn(database: DatabaseSync, botSlug: string, sourceClass: BotSourceClass): BotSourcePolicy;
  list(botSlug: string): BotSourcePolicy[];
}

export function defaultGroupWakePolicy(policy: BotSourcePolicy): GroupWakePolicy {
  if (
    policy.sourceClass !== 'group-ordinary' ||
    policy.wake !== 'digest' ||
    policy.digestCount === undefined ||
    policy.digestIntervalSeconds === undefined
  )
    throw new Error('Group ordinary source default is invalid');
  return {
    mode: 'digest',
    count: policy.digestCount,
    intervalSeconds: policy.digestIntervalSeconds,
    revision: 0,
  };
}

interface SourcePolicyRow {
  revision: number;
  changed_at: string;
  admission_mode: string;
  wake_mode: string;
  actor_kind: string;
  digest_count: number | null;
  digest_interval_seconds: number | null;
}

export function createBotSourcePolicyStore(
  database: OperationalDatabaseModulePort,
  now: () => Date = () => new Date(),
): BotSourcePolicyStore {
  const resolveIn = (
    db: DatabaseSync,
    botSlug: string,
    sourceClass: BotSourceClass,
  ): BotSourcePolicy => {
    const builtIn = BOT_SOURCE_DEFAULTS[sourceClass];
    const digestCount = 'digestCount' in builtIn ? builtIn.digestCount : null;
    const digestIntervalSeconds =
      'digestIntervalSeconds' in builtIn ? builtIn.digestIntervalSeconds : null;
    db.prepare(`
      INSERT OR IGNORE INTO bot_source_policy_revisions
        (bot_slug, source_class, revision, actor_kind, changed_at,
         admission_mode, wake_mode, digest_count, digest_interval_seconds)
      VALUES (?, ?, 1, 'built-in', ?, 'admit', ?, ?, ?)
    `).run(
      botSlug,
      sourceClass,
      now().toISOString(),
      builtIn.wake,
      digestCount,
      digestIntervalSeconds,
    );
    const row = db
      .prepare(`
        SELECT revision, changed_at, admission_mode, wake_mode, actor_kind,
               digest_count, digest_interval_seconds
          FROM bot_source_policy_revisions
         WHERE bot_slug = ? AND source_class = ?
         ORDER BY revision DESC LIMIT 1
      `)
      .get(botSlug, sourceClass) as unknown as SourcePolicyRow;
    if (
      row.admission_mode !== 'admit' ||
      row.wake_mode !== builtIn.wake ||
      row.actor_kind !== 'built-in' ||
      row.digest_count !== digestCount ||
      row.digest_interval_seconds !== digestIntervalSeconds
    )
      throw new Error(`Built-in ${sourceClass} source policy is invalid`);
    return {
      sourceClass,
      admission: 'admit',
      wake: builtIn.wake,
      ...(digestCount === null ? {} : { digestCount }),
      ...(digestIntervalSeconds === null ? {} : { digestIntervalSeconds }),
      revision: row.revision,
      lastActor: { kind: 'built-in' },
      changedAt: row.changed_at,
    };
  };
  return {
    resolveIn,
    list(botSlug) {
      return database.transaction((db) =>
        (Object.keys(BOT_SOURCE_DEFAULTS) as BotSourceClass[]).map((sourceClass) =>
          resolveIn(db, botSlug, sourceClass),
        ),
      );
    },
  };
}
