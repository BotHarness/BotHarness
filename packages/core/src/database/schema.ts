import type { DatabaseSync } from 'node:sqlite';

export const FOUNDATION_SCHEMA_GENERATION = 1;

export interface SchemaMigration {
  /** The complete operational database generation after this step commits. */
  generation: number;
  /** Deep module that owns the tables and invariants changed by this step. */
  module: string;
  description: string;
  /** A staged migration that rebuilds a referenced table; integrity is checked before activation. */
  rebuildsReferencedTables?: boolean;
  migrate(database: DatabaseSync): void;
}

export interface SchemaPlan {
  readonly targetGeneration: number;
  readonly migrations: readonly SchemaMigration[];
}

export interface LegacyForwardMigrationPlanEntry {
  readonly source: 'dsh-storage-domain';
  readonly sourceName: string;
  readonly targetOwner: 'roster' | 'session-ownership';
  readonly policy: 'import-once-when-target-empty';
}

/**
 * The old domains are inputs to future owning-module migrations, never fallback
 * authorities. Their adapters land with the target tables (#80 / roster follow-up),
 * rather than making the database owner understand either domain model.
 */
export const LEGACY_FORWARD_MIGRATION_PLAN: readonly LegacyForwardMigrationPlanEntry[] = [
  {
    source: 'dsh-storage-domain',
    sourceName: 'botharness_roster',
    targetOwner: 'roster',
    policy: 'import-once-when-target-empty',
  },
  {
    source: 'dsh-storage-domain',
    sourceName: 'botharness_sessions',
    targetOwner: 'session-ownership',
    policy: 'import-once-when-target-empty',
  },
];

export function defineSchemaPlan(migrations: readonly SchemaMigration[] = []): SchemaPlan {
  const ordered = [...migrations].sort((left, right) => left.generation - right.generation);
  let expected = FOUNDATION_SCHEMA_GENERATION + 1;

  for (const migration of ordered) {
    if (!Number.isSafeInteger(migration.generation) || migration.generation !== expected) {
      throw new TypeError(
        `Schema migrations must be contiguous from generation ${FOUNDATION_SCHEMA_GENERATION + 1}; expected ${expected}, received ${migration.generation}`,
      );
    }
    if (migration.module.trim().length === 0) {
      throw new TypeError(`Schema migration ${migration.generation} must name its owning module`);
    }
    expected += 1;
  }

  return Object.freeze({
    targetGeneration: expected - 1,
    migrations: Object.freeze(ordered),
  });
}

export const FOUNDATION_SCHEMA_PLAN = defineSchemaPlan();
