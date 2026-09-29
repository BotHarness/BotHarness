import type { DatabaseSync } from 'node:sqlite';

export const FOUNDATION_SCHEMA_GENERATION = 1;

export interface SchemaMigration {
  generation: number;

  module: string;
  description: string;

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
