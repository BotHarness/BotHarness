import type { DatabaseSync } from 'node:sqlite';

import { DEFAULT_GROUP_WAKE_POLICY, type GroupWakePolicy } from '../channels/channel.js';
import type { OperationalDatabaseModulePort } from '../database/owner.js';

/** Application-defined source classes; Channel overrides remain on Group Channel records. */
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
export type BotSourcePolicyEditor = { kind: 'human' } | { kind: 'bot'; botSlug: string };
export type BotSourcePolicyActor =
  | { kind: 'built-in' }
  | { kind: 'template' }
  | BotSourcePolicyEditor;

export interface BotSourcePolicy {
  sourceClass: BotSourceClass;
  admission: 'admit';
  wake: BotSourceWake;
  digestCount?: number;
  digestIntervalSeconds?: number;
  revision: number;
  lastActor: BotSourcePolicyActor;
  changedAt: string;
  overrideActive: boolean;
  /** Actual Orchestrator wake attempts in the preceding seven days, not Admission count. */
  recentWakeCount: number;
}

export interface BotSourcePolicyStore {
  /** Resolve inside the caller's Admission transaction, seeding the built-in revision once. */
  resolveIn(database: DatabaseSync, botSlug: string, sourceClass: BotSourceClass): BotSourcePolicy;
  list(botSlug: string): BotSourcePolicy[];
  /** The first editable tracer is Assignment report: conditional or immediate wake. */
  setAssignmentReport(
    botSlug: string,
    wake: 'conditional' | 'immediate',
    actor: BotSourcePolicyEditor,
  ): BotSourcePolicy;
  resetAssignmentReport(botSlug: string, actor: BotSourcePolicyEditor): BotSourcePolicy;
}

/** An unset Group Channel override inherits the PersonaBot's ordinary-message default. */
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
  actor_bot_slug: string | null;
  digest_count: number | null;
  digest_interval_seconds: number | null;
  override_active: number;
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
               actor_bot_slug, digest_count, digest_interval_seconds, override_active
          FROM bot_source_policy_revisions
         WHERE bot_slug = ? AND source_class = ?
         ORDER BY revision DESC LIMIT 1
      `)
      .get(botSlug, sourceClass) as unknown as SourcePolicyRow;
    if (row.admission_mode !== 'admit')
      throw new Error(`Protected ${sourceClass} admission mode is invalid`);
    if (sourceClass === 'assignment-report') {
      if (
        (row.wake_mode !== 'conditional' && row.wake_mode !== 'immediate') ||
        row.digest_count !== null ||
        row.digest_interval_seconds !== null
      )
        throw new Error('Assignment report source wake mode is invalid');
    } else if (
      row.wake_mode !== builtIn.wake ||
      row.override_active !== 0 ||
      row.digest_count !== digestCount ||
      row.digest_interval_seconds !== digestIntervalSeconds
    ) {
      throw new Error(`Protected ${sourceClass} source policy is invalid`);
    }
    if (
      (row.override_active !== 0 && row.override_active !== 1) ||
      (row.actor_kind === 'built-in' && row.override_active !== 0) ||
      (row.actor_kind !== 'built-in' &&
        row.actor_kind !== 'human' &&
        row.actor_kind !== 'bot' &&
        row.actor_kind !== 'template') ||
      (row.actor_kind === 'bot' && row.actor_bot_slug !== botSlug)
    )
      throw new Error('Source policy actor is invalid');
    const count = db
      .prepare(`
      SELECT COUNT(*) AS count FROM bot_source_wake_attempts
       WHERE bot_slug = ? AND source_class = ? AND started_at >= ?
    `)
      .get(
        botSlug,
        sourceClass,
        new Date(now().getTime() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      ) as { count: number };
    return {
      sourceClass,
      admission: 'admit',
      wake: row.wake_mode as BotSourceWake,
      ...(row.digest_count === null ? {} : { digestCount: row.digest_count }),
      ...(row.digest_interval_seconds === null
        ? {}
        : { digestIntervalSeconds: row.digest_interval_seconds }),
      revision: row.revision,
      lastActor:
        row.actor_kind === 'bot'
          ? { kind: 'bot', botSlug: botSlug }
          : { kind: row.actor_kind as 'built-in' | 'human' | 'template' },
      changedAt: row.changed_at,
      overrideActive: row.override_active === 1,
      recentWakeCount: count.count,
    };
  };
  const changeAssignmentReport = (
    botSlug: string,
    wake: 'conditional' | 'immediate',
    actor: BotSourcePolicyEditor,
    overrideActive: boolean,
  ): BotSourcePolicy => {
    if (actor.kind === 'bot' && actor.botSlug !== botSlug)
      throw new Error('A PersonaBot may edit only its own source policy');
    return database.transaction((db) => {
      const current = resolveIn(db, botSlug, 'assignment-report');
      db.prepare(`
      INSERT INTO bot_source_policy_revisions
        (bot_slug, source_class, revision, actor_kind, actor_bot_slug, changed_at,
         admission_mode, wake_mode, digest_count, digest_interval_seconds, override_active)
      VALUES (?, 'assignment-report', ?, ?, ?, ?, 'admit', ?, NULL, NULL, ?)
    `).run(
        botSlug,
        current.revision + 1,
        actor.kind,
        actor.kind === 'bot' ? actor.botSlug : null,
        now().toISOString(),
        wake,
        overrideActive ? 1 : 0,
      );
      return resolveIn(db, botSlug, 'assignment-report');
    });
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
    setAssignmentReport(botSlug, wake, actor) {
      if (wake !== 'conditional' && wake !== 'immediate')
        throw new Error('Assignment report wake must be conditional or immediate');
      return changeAssignmentReport(botSlug, wake, actor, true);
    },
    resetAssignmentReport(botSlug, actor) {
      return changeAssignmentReport(botSlug, 'conditional', actor, false);
    },
  };
}
