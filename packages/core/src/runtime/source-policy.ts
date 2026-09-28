import type { DatabaseSync } from 'node:sqlite';

import type { OperationalDatabaseModulePort } from '../database/owner.js';

/** Application-defined source class; the first tracer migrates Human DM. */
export type BotSourceClass = 'human-dm';

export interface BotSourcePolicy {
  sourceClass: BotSourceClass;
  admission: 'admit';
  wake: 'immediate';
  revision: number;
  lastActor: { kind: 'built-in' };
  changedAt: string;
}

export interface BotSourcePolicyStore {
  /** Resolve inside the caller's Admission transaction, seeding the built-in revision once. */
  resolveIn(database: DatabaseSync, botSlug: string, sourceClass: BotSourceClass): BotSourcePolicy;
  list(botSlug: string): BotSourcePolicy[];
}

interface SourcePolicyRow {
  revision: number;
  changed_at: string;
  admission_mode: string;
  wake_mode: string;
  actor_kind: string;
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
    db.prepare(`
      INSERT OR IGNORE INTO bot_source_policy_revisions
        (bot_slug, source_class, revision, actor_kind, changed_at,
         admission_mode, wake_mode, digest_count, digest_interval_seconds)
      VALUES (?, ?, 1, 'built-in', ?, 'admit', 'immediate', NULL, NULL)
    `).run(botSlug, sourceClass, now().toISOString());
    const row = db
      .prepare(`
        SELECT revision, changed_at, admission_mode, wake_mode, actor_kind
          FROM bot_source_policy_revisions
         WHERE bot_slug = ? AND source_class = ?
         ORDER BY revision DESC LIMIT 1
      `)
      .get(botSlug, sourceClass) as unknown as SourcePolicyRow;
    if (
      row.admission_mode !== 'admit' ||
      row.wake_mode !== 'immediate' ||
      row.actor_kind !== 'built-in'
    )
      throw new Error('Protected Human DM source policy is invalid');
    return {
      sourceClass,
      admission: 'admit',
      wake: 'immediate',
      revision: row.revision,
      lastActor: { kind: 'built-in' },
      changedAt: row.changed_at,
    };
  };
  return {
    resolveIn,
    list(botSlug) {
      return database.transaction((db) => [resolveIn(db, botSlug, 'human-dm')]);
    },
  };
}
