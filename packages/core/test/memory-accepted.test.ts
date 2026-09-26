import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { createPersonaBotRegistry } from '../src/bots/registry.js';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { defineSchemaPlan } from '../src/database/schema.js';
import { createMemoryService } from '../src/memory/service.js';
import { ensureMemoryRepository } from '../src/memory/repository.js';
import { toMemoryRelativePath } from '../src/memory/jail.js';
import { createSessionOwnership } from '../src/sessions/ownership.js';
import { createTempRoot, FIXED_NOW } from './helpers.js';

function git(root: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
}

function fixture() {
  const home = createTempRoot('botharness-memory-git-');
  const database = mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
  const registry = createPersonaBotRegistry({
    rootDir: join(home, 'bots'),
    initializeMemory(memoryDir) {
      const result = ensureMemoryRepository({ memoryDir });
      return result.ok ? { ok: true } : { ok: false, message: result.message };
    },
  });
  expect(registry.create({ slug: 'atlas', displayName: 'Atlas' }).ok).toBe(true);
  const ownership = createSessionOwnership(attachOperationalModule(database, 'session-ownership'));
  ownership.claim({
    sessionId: 'session-atlas',
    botSlug: 'atlas',
    rootRole: 'orchestrator',
    at: FIXED_NOW().toISOString(),
  });
  const source = attachOperationalModule(database, 'memory-test');
  const addSource = (id: string) =>
    source.transaction((db) => {
      db.prepare(`INSERT INTO source_events (
        source_event_id, source_kind, bot_slug, channel_id, message_id,
        body, created_at, attempt_state
      ) VALUES (?, 'human-message', 'atlas', 'dm-atlas', ?, 'remember', ?, 'running')`).run(
        id,
        id,
        FIXED_NOW().toISOString(),
      );
    });
  const memory = createMemoryService({ registry, ownership, database, now: FIXED_NOW });
  const root = registry.memoryDirFor('atlas');
  if (root === undefined) throw new Error('Memory root missing');
  return { home, database, registry, ownership, memory, root, addSource };
}

function makeExternalRepository(home: string) {
  const remote = join(home, 'external');
  mkdirSync(remote);
  git(remote, 'init', '-b', 'main');
  git(remote, 'config', 'user.name', 'External Author');
  git(remote, 'config', 'user.email', 'external@example.com');
  mkdirSync(join(remote, 'src'));
  mkdirSync(join(remote, '.github'));
  writeFileSync(join(remote, 'src', 'memory.ts'), 'export const memory = "remote";\n');
  writeFileSync(join(remote, '.github', 'notes.md'), 'Git metadata-style directory is data.\n');
  writeFileSync(join(remote, 'logo.bin'), Buffer.from([0, 1, 2, 255]));
  git(remote, 'add', '-A');
  git(remote, 'commit', '-m', 'External root');
  git(remote, 'switch', '-c', 'history');
  writeFileSync(join(remote, 'history.md'), 'Older branch memory\n');
  git(remote, 'add', 'history.md');
  git(remote, 'commit', '-m', 'History branch');
  const historyHead = git(remote, 'rev-parse', 'HEAD');
  git(remote, 'switch', 'main');
  writeFileSync(join(remote, 'main.md'), 'Main branch memory\n');
  git(remote, 'add', 'main.md');
  git(remote, 'commit', '-m', 'Main branch');
  git(remote, 'merge', '--no-ff', 'history', '-m', 'Merge memory histories');
  return { remote, head: git(remote, 'rev-parse', 'HEAD'), historyHead };
}

describe('current Git working tree is Memory', () => {
  it('migrates an older recorded main checkpoint to branch-scoped storage', () => {
    const home = createTempRoot('botharness-memory-migration-');
    const previousPlan = defineSchemaPlan(
      BOT_HARNESS_SCHEMA_PLAN.migrations.filter((migration) => migration.generation < 14),
    );
    const sha = 'a'.repeat(40);
    let owner = mountOperationalDatabase({ dshHome: home, schemaPlan: previousPlan });
    try {
      expect(owner.mode).toBe('ready');
      attachOperationalModule(owner, 'memory-test').transaction((db) => {
        db.prepare(
          "INSERT INTO memory_accepted_commits (bot_slug, sha, parent_sha, actor_kind, actor_id, cause_kind, cause_id, validation_result, accepted_at) VALUES (?, ?, NULL, 'system', 'test', 'repository-init', 'bootstrap', 'ok', ?)",
        ).run('atlas', sha, FIXED_NOW().toISOString());
        db.prepare(
          'INSERT INTO memory_accepted_heads (bot_slug, head_sha, updated_at) VALUES (?, ?, ?)',
        ).run('atlas', sha, FIXED_NOW().toISOString());
      });
      owner.close();

      owner = mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
      expect(owner.mode).toBe('ready');
      const port = attachOperationalModule(owner, 'memory-test');
      expect(
        port.read((db) =>
          db
            .prepare('SELECT branch_name, head_sha FROM memory_accepted_heads WHERE bot_slug = ?')
            .all('atlas'),
        ),
      ).toEqual([{ branch_name: 'main', head_sha: sha }]);
    } finally {
      owner.close();
      rmSync(home, { recursive: true, force: true });
    }
  });

  it('shows ordinary text, code, and binary files before a commit', () => {
    const { database, memory, root } = fixture();
    try {
      const seed = git(root, 'rev-parse', 'HEAD');
      writeFileSync(join(root, 'note.md'), 'Uncommitted memory\n');
      writeFileSync(join(root, 'code.ts'), 'export const answer = 42;\n');
      writeFileSync(join(root, 'image.bin'), Buffer.from([0, 255]));
      const snapshot = memory.snapshot('atlas');
      expect(snapshot.head).toBe(seed);
      expect(snapshot.provisional).toBe(false);
      expect(snapshot.files).toEqual(expect.arrayContaining(['note.md', 'code.ts', 'image.bin']));
      expect(memory.readAccepted('atlas', 'code.ts')?.body).toBe('export const answer = 42;\n');
      expect(memory.readAccepted('atlas', 'image.bin')).toMatchObject({
        path: 'image.bin',
        head: seed,
        binary: true,
      });
      expect(git(root, 'status', '--porcelain')).toContain('code.ts');
    } finally {
      database.close();
    }
  });

  it('follows a native fetch and reset to an unrelated merged history without admission', () => {
    const { home, database, registry, ownership, memory, root, addSource } = fixture();
    try {
      const external = makeExternalRepository(home);
      const seed = memory.snapshot('atlas').head;
      git(root, 'remote', 'add', 'origin', external.remote);
      git(root, 'fetch', 'origin');
      git(root, 'reset', '--hard', 'origin/main');
      git(root, 'branch', 'history', 'origin/history');
      expect(git(root, 'rev-parse', 'HEAD')).toBe(external.head);
      expect(memory.snapshot('atlas')).toMatchObject({ head: external.head, provisional: false });
      expect(memory.snapshot('atlas').files).toEqual(
        expect.arrayContaining(['src/memory.ts', '.github/notes.md', 'logo.bin', 'history.md']),
      );
      expect(memory.readAccepted('atlas', 'src/memory.ts')?.body).toContain('"remote"');
      expect(memory.readAccepted('atlas', '.github/notes.md')?.body).toContain('data');
      expect(memory.readAccepted('atlas', 'logo.bin')?.binary).toBe(true);
      const graph = memory.gitGraph('atlas');
      expect(graph.currentBranch).toBe('main');
      expect(graph.head).toBe(external.head);
      expect(graph.branches).toEqual(expect.arrayContaining(['main', 'history']));
      expect(graph.commits.find((commit) => commit.sha === external.head)?.parents).toHaveLength(2);
      expect(graph.commits.some((commit) => commit.sha === seed)).toBe(false);

      addSource('observe-external');
      memory.prepareTurn('atlas', 'session-atlas');
      const checkpoints = memory.reconcileTurn({
        botSlug: 'atlas',
        sessionId: 'session-atlas',
        sourceEventId: 'observe-external',
      });
      expect(checkpoints).toHaveLength(1);
      expect(checkpoints[0]?.sha).toBe(external.head);
      expect(checkpoints[0]?.actorId).toBe('session-atlas');
      expect(memory.snapshot('atlas').head).toBe(external.head);
      const reopened = createMemoryService({ registry, ownership, database, now: FIXED_NOW });
      expect(reopened.readAccepted('atlas', 'src/memory.ts')?.body).toContain('"remote"');
    } finally {
      database.close();
    }
  });

  it('switches to an unrecorded local branch and reads its files in the same Session', () => {
    const { home, database, memory, root, addSource } = fixture();
    try {
      const external = makeExternalRepository(home);
      git(root, 'remote', 'add', 'origin', external.remote);
      git(root, 'fetch', 'origin');
      git(root, 'reset', '--hard', 'origin/main');
      git(root, 'branch', 'history', 'origin/history');
      addSource('switch-history');
      memory.prepareTurn('atlas', 'session-atlas');
      const switched = memory.switchBranch({
        botSlug: 'atlas',
        sessionId: 'session-atlas',
        branch: 'history',
      });
      expect(switched.head).toBe(external.historyHead);
      expect(readFileSync(join(root, 'history.md'), 'utf8')).toBe('Older branch memory\n');
      expect(memory.readAccepted('atlas', 'history.md')?.body).toBe('Older branch memory\n');
      expect(memory.snapshot('atlas').head).toBe(external.historyHead);
      memory.reconcileTurn({
        botSlug: 'atlas',
        sessionId: 'session-atlas',
        sourceEventId: 'switch-history',
      });
      expect(memory.gitGraph('atlas').currentBranch).toBe('history');
    } finally {
      database.close();
    }
  });

  it('keeps a failed-turn edit visible and permits the next turn without changing Git', () => {
    const { database, memory, root, addSource } = fixture();
    try {
      const seed = memory.snapshot('atlas').head;
      memory.prepareTurn('atlas', 'session-atlas');
      writeFileSync(join(root, 'unfinished.md'), 'Visible now\n');
      memory.abortTurn('atlas', 'session-atlas');
      expect(memory.readAccepted('atlas', 'unfinished.md')?.body).toBe('Visible now\n');
      expect(memory.snapshot('atlas').head).toBe(seed);
      expect(memory.gitGraph('atlas').dirty).toBe(true);
      addSource('next-turn');
      memory.prepareTurn('atlas', 'session-atlas');
      expect(
        memory.reconcileTurn({
          botSlug: 'atlas',
          sessionId: 'session-atlas',
          sourceEventId: 'next-turn',
        }),
      ).toEqual([]);
      expect(git(root, 'status', '--porcelain')).toContain('unfinished.md');
    } finally {
      database.close();
    }
  });

  it('lets the Human edit a code file on a raw branch and records the resulting commit', () => {
    const { home, database, memory, root } = fixture();
    try {
      const external = makeExternalRepository(home);
      git(root, 'remote', 'add', 'origin', external.remote);
      git(root, 'fetch', 'origin');
      git(root, 'reset', '--hard', 'origin/main');
      const saved = memory.saveHuman({
        botSlug: 'atlas',
        path: 'src/memory.ts',
        body: 'export const memory = "human";\n',
        expectedHead: external.head,
        editId: 'edit-code',
      });
      expect(saved.actorKind).toBe('human');
      expect(saved.parentSha).toBe(external.head);
      expect(memory.readAccepted('atlas', 'src/memory.ts')?.body).toContain('"human"');
      expect(memory.gitGraph('atlas').head).toBe(saved.sha);
    } finally {
      database.close();
    }
  });

  it('keeps the Git directory and symlink escapes outside the Memory file API', () => {
    const { home, database, memory, root } = fixture();
    try {
      expect(toMemoryRelativePath('.github/notes.md')).toBe('.github/notes.md');
      expect(() => toMemoryRelativePath('.git/config')).toThrow(/reserved/);
      const outside = join(home, 'secret.txt');
      writeFileSync(outside, 'outside\n');
      symlinkSync(outside, join(root, 'escape.txt'));
      expect(memory.snapshot('atlas').files).toContain('escape.txt');
      expect(() => memory.readAccepted('atlas', 'escape.txt')).toThrow(/escapes/);
      expect(existsSync(join(dirname(root), 'secret.txt'))).toBe(false);
    } finally {
      database.close();
    }
  });

  it('requires an owning Orchestrator Session for turn observation', () => {
    const { database, memory } = fixture();
    try {
      expect(() => memory.prepareTurn('atlas', 'unowned')).toThrow(/does not own/);
    } finally {
      database.close();
    }
  });
});

describe('turn-annotation for out-of-band worktree changes', () => {
  function agentTurn(
    memory: ReturnType<typeof fixture>['memory'],
    addSource: (id: string) => void,
    id: string,
    edit?: () => void,
  ) {
    addSource(id);
    memory.prepareTurn('atlas', 'session-atlas');
    expect(
      memory.takeTurnAnnotation({ botSlug: 'atlas', sessionId: 'session-atlas' }),
    ).toBeUndefined();
    edit?.();
    return memory.reconcileTurn({ botSlug: 'atlas', sessionId: 'session-atlas', sourceEventId: id });
  }

  function gitIdentity(root: string) {
    git(root, 'config', 'user.name', 'Out Of Band');
    git(root, 'config', 'user.email', 'oob@example.com');
  }

  function takeNote(memory: ReturnType<typeof fixture>['memory']) {
    return memory.takeTurnAnnotation({ botSlug: 'atlas', sessionId: 'session-atlas' });
  }

  it('stays silent on the first turn and for the agent’s own committed turn', () => {
    const { database, memory, root, addSource } = fixture();
    try {
      gitIdentity(root);
      agentTurn(memory, addSource, 'turn-one', () => {
        writeFileSync(join(root, 'agent-note.md'), 'Agent wrote this\n');
        git(root, 'add', 'agent-note.md');
        git(root, 'commit', '-m', 'agent note');
      });
      addSource('turn-two');
      memory.prepareTurn('atlas', 'session-atlas');
      expect(takeNote(memory)).toBeUndefined();
    } finally {
      database.close();
    }
  });

  it('annotates an out-of-band unstaged edit with its path, once', () => {
    const { database, memory, root, addSource } = fixture();
    try {
      agentTurn(memory, addSource, 'baseline');
      writeFileSync(join(root, 'human-note.md'), 'Human wrote this\n');
      addSource('next');
      memory.prepareTurn('atlas', 'session-atlas');
      const note = takeNote(memory);
      expect(note).toContain('Memory changed since your last turn');
      expect(note).toContain('human-note.md');
      expect(takeNote(memory)).toBeUndefined();
    } finally {
      database.close();
    }
  });

  it('annotates an out-of-band disk commit with their paths', () => {
    const { database, memory, root, addSource } = fixture();
    try {
      gitIdentity(root);
      agentTurn(memory, addSource, 'baseline');
      writeFileSync(join(root, 'human-note.md'), 'Human wrote this\n');
      git(root, 'add', 'human-note.md');
      git(root, 'commit', '-m', 'human note');
      addSource('next');
      memory.prepareTurn('atlas', 'session-atlas');
      const note = takeNote(memory);
      expect(note).toContain('Memory changed since your last turn');
      expect(note).toContain('human-note.md');
    } finally {
      database.close();
    }
  });

  it('notes an out-of-band branch switch', () => {
    const { database, memory, root, addSource } = fixture();
    try {
      agentTurn(memory, addSource, 'baseline');
      git(root, 'switch', '-c', 'detour');
      addSource('next');
      memory.prepareTurn('atlas', 'session-atlas');
      const note = takeNote(memory);
      expect(note).toContain("Memory branch is now 'detour'");
    } finally {
      database.close();
    }
  });

  it('adds the frozen-persona sentence for PERSONA.md', () => {
    const { database, memory, root, addSource } = fixture();
    try {
      agentTurn(memory, addSource, 'baseline');
      writeFileSync(join(root, 'PERSONA.md'), 'You are now someone else.\n');
      addSource('next');
      memory.prepareTurn('atlas', 'session-atlas');
      const note = takeNote(memory);
      expect(note).toContain('PERSONA.md');
      expect(note).toContain('frozen');
    } finally {
      database.close();
    }
  });

  it('reports Human UI saves as out-of-band', () => {
    const { database, memory, addSource } = fixture();
    try {
      agentTurn(memory, addSource, 'baseline');
      const baselineHead = memory.snapshot('atlas').head;
      if (baselineHead === null) throw new Error('Memory head missing');
      const saved = memory.saveHuman({
        botSlug: 'atlas',
        path: 'ui-note.md',
        body: 'Saved in the UI\n',
        expectedHead: baselineHead,
        editId: 'edit-ui',
      });
      expect(saved.actorKind).toBe('human');
      addSource('next');
      memory.prepareTurn('atlas', 'session-atlas');
      expect(takeNote(memory)).toContain('ui-note.md');
    } finally {
      database.close();
    }
  });

  it('parses staged renames without corrupting the original path', () => {
    const { database, memory, root, addSource } = fixture();
    try {
      gitIdentity(root);
      agentTurn(memory, addSource, 'baseline', () => {
        writeFileSync(join(root, 'alpha-note.md'), 'Alpha\n');
        git(root, 'add', 'alpha-note.md');
        git(root, 'commit', '-m', 'alpha note');
      });
      git(root, 'mv', 'alpha-note.md', 'beta-note.md');
      addSource('next');
      memory.prepareTurn('atlas', 'session-atlas');
      const note = takeNote(memory);
      expect(note).toContain('beta-note.md');
      expect(note).not.toContain('alpha-note.md');
    } finally {
      database.close();
    }
  });

  it('names only the branch on an out-of-band switch, even when many files differ', () => {
    const { database, memory, root, addSource } = fixture();
    try {
      gitIdentity(root);
      agentTurn(memory, addSource, 'baseline');
      git(root, 'switch', '-c', 'side');
      writeFileSync(join(root, 'side-file-1.md'), 'one\n');
      writeFileSync(join(root, 'side-file-2.md'), 'two\n');
      git(root, 'add', '-A');
      git(root, 'commit', '-m', 'side work');
      addSource('next');
      memory.prepareTurn('atlas', 'session-atlas');
      const note = takeNote(memory);
      expect(note).toContain("Memory branch is now 'side'");
      expect(note).not.toContain('side-file-1.md');
      expect(note).not.toContain('frozen');
    } finally {
      database.close();
    }
  });

  it('stays silent after a tool-driven branch switch', () => {
    const { database, memory, root, addSource } = fixture();
    try {
      gitIdentity(root);
      agentTurn(memory, addSource, 'baseline');
      git(root, 'switch', '-c', 'side');
      writeFileSync(join(root, 'side-note.md'), 'Side\n');
      git(root, 'add', 'side-note.md');
      git(root, 'commit', '-m', 'side note');
      addSource('adopt-side');
      memory.prepareTurn('atlas', 'session-atlas');
      expect(takeNote(memory)).toContain("Memory branch is now 'side'");
      memory.reconcileTurn({ botSlug: 'atlas', sessionId: 'session-atlas', sourceEventId: 'adopt-side' });
      addSource('switch-back');
      memory.prepareTurn('atlas', 'session-atlas');
      expect(takeNote(memory)).toBeUndefined();
      const switched = memory.switchBranch({ botSlug: 'atlas', sessionId: 'session-atlas', branch: 'main' });
      expect(switched.to).toBe('main');
      memory.reconcileTurn({ botSlug: 'atlas', sessionId: 'session-atlas', sourceEventId: 'switch-back' });
      addSource('after');
      memory.prepareTurn('atlas', 'session-atlas');
      expect(takeNote(memory)).toBeUndefined();
    } finally {
      database.close();
    }
  });

  it('leaves no stuck turn behind when worktree observation fails', () => {
    const { database, memory, root, addSource } = fixture();
    try {
      agentTurn(memory, addSource, 'baseline');
      git(root, 'switch', '--detach', 'HEAD');
      addSource('broken');
      expect(() => memory.prepareTurn('atlas', 'session-atlas')).toThrow(/local branch/);
      git(root, 'switch', 'main');
      addSource('recovered');
      memory.prepareTurn('atlas', 'session-atlas');
      expect(takeNote(memory)).toBeUndefined();
      memory.reconcileTurn({ botSlug: 'atlas', sessionId: 'session-atlas', sourceEventId: 'recovered' });
    } finally {
      database.close();
    }
  });

  it('counts overflowed paths instead of silently dropping them', () => {
    const { database, memory, root, addSource } = fixture();
    try {
      agentTurn(memory, addSource, 'baseline');
      for (let index = 0; index < 40; index += 1) {
        writeFileSync(join(root, `overflow-${String(index).padStart(2, '0')}.md`), 'x\n');
      }
      addSource('next');
      memory.prepareTurn('atlas', 'session-atlas');
      const note = takeNote(memory);
      expect(note).toContain('(+10 more)');
      expect(note?.endsWith('…(truncated)')).toBe(false);
    } finally {
      database.close();
    }
  });

  it('caps annotations in UTF-8 bytes without splitting characters', () => {
    const { database, memory, root, addSource } = fixture();
    try {
      agentTurn(memory, addSource, 'baseline');
      for (let index = 0; index < 40; index += 1) {
        const name = `记忆文件-${String(index).padStart(2, '0')}-${'记'.repeat(60)}.md`;
        writeFileSync(join(root, name), 'x\n');
      }
      addSource('next');
      memory.prepareTurn('atlas', 'session-atlas');
      const note = takeNote(memory);
      expect(note?.endsWith('…(truncated)')).toBe(true);
      const kept = note?.split('\n…(truncated)')[0] ?? '';
      expect(Buffer.byteLength(kept, 'utf8')).toBeLessThanOrEqual(4096);
      expect(/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/u.test(note ?? '')).toBe(
        false,
      );
    } finally {
      database.close();
    }
  });
});
