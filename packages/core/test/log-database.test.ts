import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { afterEach, describe, expect, it } from 'vitest';

import {
  LOG_DB_FILENAME,
  LOG_DEFAULT_MAX_AGE_MS,
  LOG_DEFAULT_MAX_ROWS,
  openLogDatabase,
} from '../src/logs/log-db.js';

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function makeDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'botharness-logdb-'));
  dirs.push(dir);
  return dir;
}

function rowsOf(dir: string): {
  ts: number;
  plugin: string;
  owner: string;
  kind: string;
  detail: string;
}[] {
  const database = new DatabaseSync(join(dir, LOG_DB_FILENAME));
  try {
    return database
      .prepare('SELECT ts, plugin, owner, kind, detail FROM log_entries ORDER BY id')
      .all() as { ts: number; plugin: string; owner: string; kind: string; detail: string }[];
  } finally {
    database.close();
  }
}

describe('operational log database', () => {
  it('creates a versioned schema on a fresh directory', () => {
    const dir = makeDir();
    const logs = openLogDatabase({ dir });
    try {
      const database = new DatabaseSync(join(dir, LOG_DB_FILENAME));
      try {
        const version = (
          database.prepare('SELECT version FROM log_schema WHERE singleton = 1').get() as {
            version: number;
          }
        ).version;
        expect(version).toBe(1);
      } finally {
        database.close();
      }
      expect(rowsOf(dir)).toEqual([]);
    } finally {
      logs.close();
    }
  });

  it('writes entries with plugin, owner scope, and kind', () => {
    const dir = makeDir();
    const logs = openLogDatabase({ dir, now: () => 1000 });
    try {
      logs.write({
        plugin: 'computer',
        owner: 'profile-shared',
        kind: 'viewer',
        detail: 'viewer phase connecting>live',
      });
      logs.write({
        plugin: 'computer',
        owner: 'bot:atlas',
        kind: 'lifecycle',
        detail: 'start requested (panel)',
      });
      expect(rowsOf(dir)).toEqual([
        {
          ts: 1000,
          plugin: 'computer',
          owner: 'profile-shared',
          kind: 'viewer',
          detail: 'viewer phase connecting>live',
        },
        {
          ts: 1000,
          plugin: 'computer',
          owner: 'bot:atlas',
          kind: 'lifecycle',
          detail: 'start requested (panel)',
        },
      ]);
    } finally {
      logs.close();
    }
  });

  it('rebuilds empty when the file is corrupt', () => {
    const dir = makeDir();
    writeFileSync(join(dir, LOG_DB_FILENAME), 'not a database');
    const logs = openLogDatabase({ dir });
    try {
      logs.write({ plugin: 'computer', owner: 'profile-shared', kind: 'viewer', detail: 'x' });
      expect(rowsOf(dir)).toHaveLength(1);
    } finally {
      logs.close();
    }
  });

  it('rebuilds empty when the version is newer than supported', () => {
    const dir = makeDir();
    const seed = openLogDatabase({ dir });
    try {
      seed.write({ plugin: 'computer', owner: 'profile-shared', kind: 'viewer', detail: 'old' });
    } finally {
      seed.close();
    }
    const database = new DatabaseSync(join(dir, LOG_DB_FILENAME));
    try {
      database.prepare('UPDATE log_schema SET version = 999 WHERE singleton = 1').run();
    } finally {
      database.close();
    }
    const logs = openLogDatabase({ dir });
    try {
      expect(rowsOf(dir)).toEqual([]);
    } finally {
      logs.close();
    }
  });

  it('prunes by row count, oldest first', () => {
    const dir = makeDir();
    const logs = openLogDatabase({
      dir,
      maxRows: 3,
      now: (() => {
        let at = 1000;
        return () => (at += 1000);
      })(),
    });
    try {
      for (const detail of ['a', 'b', 'c', 'd', 'e']) {
        logs.write({ plugin: 'computer', owner: 'profile-shared', kind: 'viewer', detail });
      }
      expect(rowsOf(dir).map((row) => row.detail)).toEqual(['c', 'd', 'e']);
    } finally {
      logs.close();
    }
  });

  it('prunes by age', () => {
    let now = 1000;
    const dir = makeDir();
    const logs = openLogDatabase({ dir, now: () => now, maxAgeMs: 10_000 });
    try {
      logs.write({ plugin: 'computer', owner: 'profile-shared', kind: 'viewer', detail: 'old' });
      now += 11_000;
      logs.write({ plugin: 'computer', owner: 'profile-shared', kind: 'viewer', detail: 'new' });
      expect(rowsOf(dir).map((row) => row.detail)).toEqual(['new']);
    } finally {
      logs.close();
    }
  });

  it('locks the ADR retention defaults', () => {
    expect(LOG_DEFAULT_MAX_ROWS).toBe(50_000);
    expect(LOG_DEFAULT_MAX_AGE_MS).toBe(30 * 24 * 60 * 60 * 1000);
  });

  it('migrates an older generation forward instead of wiping it', () => {
    const dir = makeDir();
    const now = Date.now();
    const database = new DatabaseSync(join(dir, LOG_DB_FILENAME));
    try {
      database.exec(`
        CREATE TABLE log_schema (singleton INTEGER PRIMARY KEY CHECK (singleton = 1), version INTEGER NOT NULL) STRICT;
        INSERT INTO log_schema (singleton, version) VALUES (1, 0);
        CREATE TABLE log_entries (id INTEGER PRIMARY KEY, ts INTEGER NOT NULL, plugin TEXT NOT NULL, owner TEXT NOT NULL, kind TEXT NOT NULL, detail TEXT NOT NULL) STRICT;
        INSERT INTO log_entries (ts, plugin, owner, kind, detail) VALUES (${now}, 'computer', 'profile-shared', 'viewer', 'kept');
      `);
    } finally {
      database.close();
    }
    const logs = openLogDatabase({
      dir,
      migrations: [
        {
          from: 0,
          migrate: (db) => {
            db.exec('CREATE INDEX log_entries_ts ON log_entries (ts);');
          },
        },
      ],
    });
    try {
      expect(rowsOf(dir).map((row) => row.detail)).toEqual(['kept']);
      logs.write({ plugin: 'computer', owner: 'profile-shared', kind: 'viewer', detail: 'new' });
      expect(rowsOf(dir).map((row) => row.detail)).toEqual(['kept', 'new']);
    } finally {
      logs.close();
    }
  });

  it('rebuilds empty when the file disappears mid-run', () => {
    const dir = makeDir();
    const logs = openLogDatabase({ dir });
    try {
      logs.write({ plugin: 'computer', owner: 'profile-shared', kind: 'viewer', detail: 'a' });
      rmSync(join(dir, LOG_DB_FILENAME), { force: true });
      logs.write({ plugin: 'computer', owner: 'profile-shared', kind: 'viewer', detail: 'b' });
      expect(rowsOf(dir).map((row) => row.detail)).toEqual(['b']);
    } finally {
      logs.close();
    }
  });
});
