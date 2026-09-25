import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
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
  it('shows local Git branches and opens the diff of a pending commit without accepting it', () => {
    const { database, registry, memory, root } = fixture();
    try {
      const seed = memory.snapshot('atlas').head!;
      git(root, 'switch', '-c', 'experiment', seed);
      writeFileSync(join(root, 'branch-note.md'), 'Branch memory\n', 'utf8');
      git(root, 'add', 'branch-note.md');
      git(
        root,
        '-c',
        'user.name=Tester',
        '-c',
        'user.email=test@example.com',
        'commit',
        '-m',
        'Branch memory',
      );
      const branchSha = git(root, 'rev-parse', 'HEAD');
      git(root, 'switch', 'main');
      writeFileSync(join(root, 'main-note.md'), 'Main memory\n', 'utf8');
      git(root, 'add', 'main-note.md');
      git(
        root,
        '-c',
        'user.name=Tester',
        '-c',
        'user.email=test@example.com',
        'commit',
        '-m',
        'Main memory',
      );
      const mainSha = git(root, 'rev-parse', 'HEAD');

      const graph = memory.gitGraph('atlas', 0);
      expect(graph.currentBranch).toBe('main');
      expect(graph.head).toBe(mainSha);
      expect(graph.commits).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ sha: mainSha, branches: ['main'], status: 'needs-repair' }),
        ]),
      );
      expect(graph.commits).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ sha: branchSha, branches: ['experiment'], status: 'pending' }),
          expect.objectContaining({ sha: seed, branches: [], status: 'accepted' }),
        ]),
      );
      expect(memory.gitCommitDiff('atlas', branchSha).files).toEqual([
        { path: 'branch-note.md', status: 'A' },
      ]);
      expect(memory.gitCommitDiff('atlas', branchSha).diff).toContain('+Branch memory');
      expect(memory.history('atlas').map((commit) => commit.sha)).toEqual([seed]);
      const reopened = createMemoryService({
        registry,
        ownership: ownershipOf(database),
        database,
        now: FIXED_NOW,
      });
      expect(reopened.gitGraph('atlas', 0).commits).toEqual(graph.commits);
      expect(memory.gitGraph('atlas', 1).commits).toHaveLength(2);
      expect(() => memory.gitGraph('atlas', 10_001)).toThrow(/offset/);
      expect(() => memory.gitCommitDiff('atlas', 'not-a-sha')).toThrow(/Unknown Memory Git commit/);
      expect(() => memory.gitCommitDiff('atlas', '0'.repeat(40))).toThrow(
        /Unknown Memory Git commit/,
      );
      git(
        root,
        '-c',
        'user.name=Tester',
        '-c',
        'user.email=test@example.com',
        'merge',
        '--no-ff',
        'experiment',
        '-m',
        'Merge experiment',
      );
      const mergeSha = git(root, 'rev-parse', 'HEAD');
      expect(memory.gitCommitDiff('atlas', mergeSha).files).toContainEqual({
        path: 'branch-note.md',
        status: 'A',
      });
      expect(memory.gitCommitDiff('atlas', mergeSha).diff).toContain('+Branch memory');
    } finally {
      database.close();
    }
  });
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

  it('archives failed-turn changes, restores the accepted head, and permits a later turn', () => {
    const { database, memory, root, addSource } = fixture();
    try {
      const seed = memory.snapshot('atlas').head!;
      addSource('event-failed');
      memory.prepareTurn('atlas', 'session-atlas');
      writeFileSync(join(root, 'fact.md'), 'failed turn\n');
      memory.abortTurn('atlas', 'session-atlas');
      expect(memory.snapshot('atlas').provisional).toBe(true);
      expect(() => memory.prepareTurn('atlas', 'session-atlas')).toThrow(/provisional/);

      const repairId = '11111111-1111-4111-8111-111111111111';
      const repaired = memory.repairHuman({
        botSlug: 'atlas',
        expectedHead: seed,
        repairId,
      });
      expect(repaired).toMatchObject({
        id: repairId,
        acceptedHeadSha: seed,
        actorKind: 'human',
        causeKind: 'human-repair',
        status: 'completed',
      });
      expect(readFileSync(join(repaired.backupPath, 'repository', 'fact.md'), 'utf8')).toBe(
        'failed turn\n',
      );
      expect(memory.snapshot('atlas')).toEqual({ head: seed, files: [], provisional: false });
      expect(memory.history('atlas')).toHaveLength(1);
      expect(memory.repairHuman({ botSlug: 'atlas', expectedHead: seed, repairId })).toEqual(
        repaired,
      );
      const row = attachOperationalModule(database, 'memory-test').read((db) =>
        db.prepare('SELECT * FROM memory_repair_events WHERE id = ?').get(repairId),
      );
      expect(row).toMatchObject({ status: 'completed', provisional_head_sha: seed });

      addSource('event-retry');
      memory.prepareTurn('atlas', 'session-atlas');
      writeFileSync(join(root, 'fact.md'), 'successful turn\n');
      const [accepted] = memory.reconcileTurn({
        botSlug: 'atlas',
        sessionId: 'session-atlas',
        sourceEventId: 'event-retry',
      });
      expect(accepted?.parentSha).toBe(seed);
      expect(memory.readAccepted('atlas', 'fact.md')?.body).toBe('successful turn\n');
    } finally {
      database.close();
    }
  });

  it('archives a raw commit left before database acceptance without adding it to accepted history', () => {
    const { database, memory, root, addSource } = fixture();
    try {
      const seed = memory.snapshot('atlas').head!;
      addSource('event-crashed');
      memory.prepareTurn('atlas', 'session-atlas');
      writeFileSync(join(root, 'fact.md'), 'raw commit\n');
      git(root, 'add', 'fact.md');
      git(root, 'commit', '--no-gpg-sign', '-m', 'unfinished turn');
      const raw = git(root, 'rev-parse', 'HEAD');
      memory.abortTurn('atlas', 'session-atlas');
      const repaired = memory.repairHuman({
        botSlug: 'atlas',
        expectedHead: seed,
        repairId: '22222222-2222-4222-8222-222222222222',
      });
      expect(repaired.provisionalHeadSha).toBe(raw);
      expect(git(join(repaired.backupPath, 'repository'), 'rev-parse', 'HEAD')).toBe(raw);
      expect(git(root, 'rev-parse', 'HEAD')).toBe(seed);
      expect(memory.history('atlas').map((commit) => commit.sha)).toEqual([seed]);
    } finally {
      database.close();
    }
  });

  it('resumes an interrupted archive move and preserves a late write in the archived repository', () => {
    const { database, memory, root } = fixture();
    try {
      const seed = memory.snapshot('atlas').head!;
      writeFileSync(join(root, 'before.md'), 'before\n');
      const repairId = '33333333-3333-4333-8333-333333333333';
      const backupPath = join(dirname(root), 'memory-repairs', repairId);
      mkdirSync(backupPath, { recursive: true });
      attachOperationalModule(database, 'memory-test').transaction((db) => {
        db.prepare(`INSERT INTO memory_repair_events (
          id, bot_slug, accepted_head_sha, provisional_head_sha, backup_path,
          actor_kind, actor_id, cause_kind, status, requested_at
        ) VALUES (?, 'atlas', ?, ?, ?, 'human', 'authenticated-dsh-human',
          'human-repair', 'started', ?)`).run(
          repairId,
          seed,
          seed,
          backupPath,
          FIXED_NOW().toISOString(),
        );
      });
      renameSync(root, join(backupPath, 'repository'));
      writeFileSync(join(backupPath, 'repository', 'late.md'), 'late\n');
      expect(memory.snapshot('atlas')).toMatchObject({ head: seed, provisional: true });
      expect(memory.history('atlas')).toHaveLength(1);
      const repaired = memory.repairHuman({
        botSlug: 'atlas',
        expectedHead: seed,
        repairId: '44444444-4444-4444-8444-444444444444',
      });
      expect(repaired.id).toBe(repairId);
      expect(repaired.status).toBe('completed');
      expect(memory.snapshot('atlas').provisional).toBe(false);
      expect(readFileSync(join(backupPath, 'repository', 'late.md'), 'utf8')).toBe('late\n');
      expect(existsSync(join(root, 'late.md'))).toBe(false);
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
