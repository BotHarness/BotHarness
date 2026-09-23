import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { describe, expect, it } from 'vitest';

import { createPersonaBotRegistry } from '../src/bots/registry.js';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { createMemoryService } from '../src/memory/service.js';
import { ensureMemoryRepository } from '../src/memory/repository.js';
import { createSessionOwnership } from '../src/sessions/ownership.js';
import { createTempRoot, FIXED_NOW } from './helpers.js';

function fixture() {
  const dshHome = createTempRoot('botharness-memory-accepted-');
  const database = mountOperationalDatabase({ dshHome, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
  const registry = createPersonaBotRegistry({
    rootDir: join(dshHome, 'botharness', 'bots'),
    initializeMemory(memoryDir) {
      const result = ensureMemoryRepository({ memoryDir });
      return result.ok ? { ok: true } : { ok: false, message: result.message };
    },
  });
  const created = registry.create({ slug: 'atlas', displayName: 'Atlas' });
  expect(created.ok).toBe(true);
  const ownership = createSessionOwnership(attachOperationalModule(database, 'session-ownership'));
  ownership.claim({
    sessionId: 'session-atlas',
    botSlug: 'atlas',
    rootRole: 'orchestrator',
    at: FIXED_NOW().toISOString(),
  });
  const source = attachOperationalModule(database, 'memory-test');
  const addSource = (sourceEventId: string) =>
    source.transaction((db) => {
      db.prepare(`INSERT INTO source_events (
      source_event_id, source_kind, bot_slug, channel_id, message_id,
      body, created_at, attempt_state
    ) VALUES (?, 'human-message', 'atlas', 'dm-atlas', ?, 'remember', ?, 'running')`).run(
        sourceEventId,
        sourceEventId,
        FIXED_NOW().toISOString(),
      );
    });
  const memory = createMemoryService({ registry, ownership, database, now: FIXED_NOW });
  const root = registry.memoryDirFor('atlas');
  if (root === undefined) throw new Error('Memory root missing');
  return { database, registry, memory, root, addSource };
}

function git(root: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
}

describe('accepted Memory Commit boundary', () => {
  it('bootstraps a clean new repository when Human opens Memory first', () => {
    const { database, memory, root } = fixture();
    try {
      const seed = git(root, 'rev-parse', 'HEAD');
      expect(memory.snapshot('atlas')).toEqual({
        head: seed,
        files: [],
        provisional: false,
      });
      expect(memory.history('atlas')).toMatchObject([
        { sha: seed, actorKind: 'system', causeKind: 'repository-init' },
      ]);
      const saved = memory.saveHuman({
        botSlug: 'atlas',
        path: 'first.md',
        body: 'Human first\n',
        expectedHead: seed,
        editId: 'human-first',
      });
      expect(saved.parentSha).toBe(seed);
      expect(memory.readAccepted('atlas', 'first.md')?.body).toBe('Human first\n');
    } finally {
      database.close();
    }
  });
  it('accepts an ordinary Agent file write once and reads only accepted Git content', () => {
    const { database, registry, memory, root, addSource } = fixture();
    try {
      addSource('event-1');
      memory.prepareTurn('atlas', 'session-atlas');
      writeFileSync(join(root, 'fact.md'), '# Acme renewal\n', 'utf8');
      expect(memory.snapshot('atlas')).toEqual({
        head: git(root, 'rev-parse', 'HEAD'),
        files: [],
        provisional: true,
      });
      const [accepted] = memory.reconcileTurn({
        botSlug: 'atlas',
        sessionId: 'session-atlas',
        sourceEventId: 'event-1',
      });
      expect(accepted).toMatchObject({
        actorKind: 'agent',
        actorId: 'session-atlas',
        causeKind: 'source-event',
        causeId: 'event-1',
        parentSha: expect.stringMatching(/^[0-9a-f]{40}$/),
      });
      expect(memory.snapshot('atlas')).toEqual({
        head: accepted!.sha,
        files: ['fact.md'],
        provisional: false,
      });
      expect(memory.readAccepted('atlas', 'fact.md')).toEqual({
        path: 'fact.md',
        body: '# Acme renewal\n',
        head: accepted!.sha,
      });
      expect(memory.history('atlas').map((item) => item.sha)).toEqual([
        accepted!.sha,
        accepted!.parentSha,
      ]);
      expect(memory.diff('atlas', accepted!.sha).diff).toContain('+# Acme renewal');
      expect(memory.reconcileTurn).toBeDefined();

      const reopened = createMemoryService({
        registry,
        ownership: ownershipOf(database),
        database,
        now: FIXED_NOW,
      });
      expect(reopened.history('atlas')[0]?.sha).toBe(accepted!.sha);
    } finally {
      database.close();
    }
  });

  it('does not execute repository hooks for an Agent commit or Human save', () => {
    const { database, memory, root, addSource } = fixture();
    try {
      const marker = join(root, 'hook-ran');
      const hook = join(root, '.git', 'hooks', 'pre-commit');
      mkdirSync(join(root, '.git', 'hooks'), { recursive: true });
      writeFileSync(hook, `#!/bin/sh\ntouch "${marker}"\n`, 'utf8');
      chmodSync(hook, 0o755);

      addSource('event-2');
      memory.prepareTurn('atlas', 'session-atlas');
      writeFileSync(join(root, 'fact.md'), 'first\n');
      const [agent] = memory.reconcileTurn({
        botSlug: 'atlas',
        sessionId: 'session-atlas',
        sourceEventId: 'event-2',
      });
      expect(agent).toBeDefined();
      expect(existsSync(marker)).toBe(false);
      const human = memory.saveHuman({
        botSlug: 'atlas',
        path: 'fact.md',
        body: 'second\n',
        expectedHead: agent!.sha,
        editId: 'edit-1',
      });
      expect(human.actorKind).toBe('human');
      expect(human.causeKind).toBe('human-edit');
      expect(existsSync(marker)).toBe(false);
      expect(
        memory.saveHuman({
          botSlug: 'atlas',
          path: 'fact.md',
          body: 'second\n',
          expectedHead: agent!.sha,
          editId: 'edit-1',
        }).sha,
      ).toBe(human.sha);
      expect(() =>
        memory.saveHuman({
          botSlug: 'atlas',
          path: 'fact.md',
          body: 'third\n',
          expectedHead: agent!.sha,
          editId: 'edit-2',
        }),
      ).toThrow(/changed since/);
    } finally {
      database.close();
    }
  });

  it('rejects invalid UTF-8 and never accepts a raw historical commit as repository initialization', () => {
    const { database, memory, root, addSource } = fixture();
    try {
      addSource('event-3');
      memory.prepareTurn('atlas', 'session-atlas');
      writeFileSync(join(root, 'invalid.md'), Buffer.from([0xff]));
      expect(() =>
        memory.reconcileTurn({
          botSlug: 'atlas',
          sessionId: 'session-atlas',
          sourceEventId: 'event-3',
        }),
      ).toThrow(/not UTF-8/);
      expect(memory.history('atlas')).toHaveLength(1);
      memory.abortTurn('atlas', 'session-atlas');
    } finally {
      database.close();
    }

    const another = fixture();
    try {
      writeFileSync(join(another.root, 'raw.md'), 'untrusted\n');
      git(another.root, 'add', 'raw.md');
      git(another.root, 'commit', '--no-gpg-sign', '-m', 'raw commit');
      another.addSource('event-4');
      expect(() => another.memory.prepareTurn('atlas', 'session-atlas')).toThrow(
        /explicit legacy import/,
      );
      expect(() => another.memory.history('atlas')).toThrow(/explicit legacy import/);
    } finally {
      another.database.close();
    }
  });

  it('refuses modified attributes before staging, so filters cannot run', () => {
    const { database, memory, root, addSource } = fixture();
    try {
      const marker = join(root, 'filter-ran');
      addSource('event-filter');
      memory.prepareTurn('atlas', 'session-atlas');
      git(root, 'config', 'filter.evil.clean', 'touch filter-ran; cat');
      writeFileSync(join(root, '.gitattributes'), '*.md filter=evil\n');
      writeFileSync(join(root, 'fact.md'), 'fact\n');
      expect(() =>
        memory.reconcileTurn({
          botSlug: 'atlas',
          sessionId: 'session-atlas',
          sourceEventId: 'event-filter',
        }),
      ).toThrow(/filter configuration/);
      expect(existsSync(marker)).toBe(false);
    } finally {
      database.close();
    }
  });

  it('refuses Git info attributes before staging', () => {
    const { database, memory, root, addSource } = fixture();
    try {
      const marker = join(root, 'filter-ran');
      addSource('event-info');
      memory.prepareTurn('atlas', 'session-atlas');
      git(root, 'config', 'filter.evil.clean', 'touch filter-ran; cat');
      writeFileSync(join(root, '.git', 'info', 'attributes'), '*.md filter=evil\n');
      writeFileSync(join(root, 'fact.md'), 'fact\n');
      expect(() =>
        memory.reconcileTurn({
          botSlug: 'atlas',
          sessionId: 'session-atlas',
          sourceEventId: 'event-info',
        }),
      ).toThrow(/attributes override/);
      expect(existsSync(marker)).toBe(false);
    } finally {
      database.close();
    }
  });

  it('ignores inherited Git repository redirect variables', () => {
    const first = fixture();
    const second = fixture();
    const previousDir = process.env.GIT_DIR;
    const previousWorkTree = process.env.GIT_WORK_TREE;
    const seed = git(first.root, 'rev-parse', 'HEAD');
    try {
      process.env.GIT_DIR = join(second.root, '.git');
      process.env.GIT_WORK_TREE = second.root;
      expect(first.memory.snapshot('atlas').head).toBe(seed);
      const saved = first.memory.saveHuman({
        botSlug: 'atlas',
        path: 'owned.md',
        body: 'owned\n',
        expectedHead: seed,
        editId: 'redirected-env',
      });
      expect(first.memory.readAccepted('atlas', 'owned.md')?.head).toBe(saved.sha);
      expect(existsSync(join(second.root, 'owned.md'))).toBe(false);
    } finally {
      if (previousDir === undefined) delete process.env.GIT_DIR;
      else process.env.GIT_DIR = previousDir;
      if (previousWorkTree === undefined) delete process.env.GIT_WORK_TREE;
      else process.env.GIT_WORK_TREE = previousWorkTree;
      first.database.close();
      second.database.close();
    }
  });

  it.skipIf(process.platform === 'win32')(
    'rejects a Human commit whose actual parent raced ahead',
    () => {
      const { database, memory, root } = fixture();
      const shim = mkdtempSync(join(tmpdir(), 'bh115-git-race-'));
      const previousPath = process.env.PATH;
      try {
        const seed = memory.snapshot('atlas').head;
        if (seed === null) throw new Error('Missing seed');
        const realGit = execFileSync('which', ['git'], { encoding: 'utf8' }).trim();
        const wrapper = join(shim, 'git');
        writeFileSync(
          wrapper,
          `#!/bin/sh
for arg in "$@"; do
  if [ "$arg" = "commit" ] && [ ! -e "$PWD/.git/race-injected" ]; then
    touch "$PWD/.git/race-injected"
    printf "raw\n" > "$PWD/race.md"
    GIT_INDEX_FILE="$PWD/.git/race-index" "${realGit}" read-tree HEAD
    GIT_INDEX_FILE="$PWD/.git/race-index" "${realGit}" add race.md
    GIT_INDEX_FILE="$PWD/.git/race-index" "${realGit}" -c core.hooksPath=/dev/null commit --no-gpg-sign -m "interleaved raw commit" >/dev/null
  fi
done
exec "${realGit}" "$@"
`,
        );
        chmodSync(wrapper, 0o755);
        process.env.PATH = `${shim}:${previousPath ?? ''}`;
        expect(() =>
          memory.saveHuman({
            botSlug: 'atlas',
            path: 'human.md',
            body: 'human\n',
            expectedHead: seed,
            editId: 'raced-human',
          }),
        ).toThrow(/unaccepted parent/);
        expect(memory.history('atlas')).toHaveLength(1);
      } finally {
        process.env.PATH = previousPath;
        rmSync(shim, { recursive: true, force: true });
        database.close();
      }
    },
  );

  it('rejects a divergent repeat of the same Source Event', () => {
    const { database, memory, root, addSource } = fixture();
    try {
      addSource('event-5');
      memory.prepareTurn('atlas', 'session-atlas');
      writeFileSync(join(root, 'one.md'), 'one\n');
      const [first] = memory.reconcileTurn({
        botSlug: 'atlas',
        sessionId: 'session-atlas',
        sourceEventId: 'event-5',
      });
      memory.prepareTurn('atlas', 'session-atlas');
      expect(
        memory.reconcileTurn({
          botSlug: 'atlas',
          sessionId: 'session-atlas',
          sourceEventId: 'event-5',
        })[0]?.sha,
      ).toBe(first?.sha);
      memory.prepareTurn('atlas', 'session-atlas');
      writeFileSync(join(root, 'two.md'), 'two\n');
      expect(() =>
        memory.reconcileTurn({
          botSlug: 'atlas',
          sessionId: 'session-atlas',
          sourceEventId: 'event-5',
        }),
      ).toThrow(/already accepted/);
    } finally {
      database.close();
    }
  });
});

function ownershipOf(database: ReturnType<typeof mountOperationalDatabase>) {
  return createSessionOwnership(attachOperationalModule(database, 'session-ownership'));
}
