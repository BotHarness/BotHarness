import { execFileSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
} from 'node:fs';
import { dirname, join } from 'node:path';

import type { PersonaBotRegistry } from '../bots/registry.js';
import { atomicWriteFile } from '../fs/atomic-write.js';
import type { OperationalDatabaseModulePort } from '../database/owner.js';
import type { SessionOwnership } from '../sessions/ownership.js';
import { toMemoryRelativePath, toMemoryWritePath, resolveMemoryPath } from './jail.js';

export type MemoryAcceptErrorCode =
  | 'memory-unavailable'
  | 'memory-conflict'
  | 'memory-invalid'
  | 'memory-unknown-commit';

export class MemoryAcceptError extends Error {
  constructor(
    readonly code: MemoryAcceptErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'MemoryAcceptError';
  }
}

export interface MemoryAcceptedCommit {
  botSlug: string;
  sha: string;
  parentSha: string | null;
  actorKind: 'agent' | 'human' | 'system';
  actorId: string;
  causeKind: 'source-event' | 'human-edit' | 'repository-init';
  causeId: string;
  validationResult: string;
  acceptedAt: string;
}

export interface MemoryRepairEvent {
  id: string;
  botSlug: string;
  acceptedHeadSha: string;
  provisionalHeadSha: string;
  backupPath: string;
  actorKind: 'human';
  actorId: string;
  causeKind: 'human-repair';
  status: 'started' | 'completed';
  requestedAt: string;
  completedAt: string | null;
}

export interface MemoryAcceptedSnapshot {
  head: string | null;
  files: string[];
  provisional: boolean;
}

export interface MemoryAcceptance {
  prepareTurn(botSlug: string, sessionId: string): void;
  reconcileTurn(input: {
    botSlug: string;
    sessionId: string;
    sourceEventId: string;
  }): MemoryAcceptedCommit[];
  abortTurn(botSlug: string, sessionId: string): void;
  snapshot(botSlug: string): MemoryAcceptedSnapshot;
  readAccepted(
    botSlug: string,
    path: string,
  ): { path: string; body: string; head: string } | undefined;
  history(botSlug: string, limit?: number): MemoryAcceptedCommit[];
  diff(botSlug: string, sha: string): { sha: string; diff: string };
  repairHuman(input: {
    botSlug: string;
    expectedHead: string;
    repairId: string;
  }): MemoryRepairEvent;
  saveHuman(input: {
    botSlug: string;
    path: string;
    body: string;
    expectedHead: string;
    editId: string;
  }): MemoryAcceptedCommit;
}

interface RepairRow {
  id: string;
  bot_slug: string;
  accepted_head_sha: string;
  provisional_head_sha: string;
  backup_path: string;
  actor_kind: 'human';
  actor_id: string;
  cause_kind: 'human-repair';
  status: 'started' | 'completed';
  requested_at: string;
  completed_at: string | null;
}

interface AcceptedRow {
  bot_slug: string;
  sha: string;
  parent_sha: string | null;
  actor_kind: MemoryAcceptedCommit['actorKind'];
  actor_id: string;
  cause_kind: MemoryAcceptedCommit['causeKind'];
  cause_id: string;
  validation_result: string;
  accepted_at: string;
}

const MAX_FILE_BYTES = 1024 * 1024;
const MAX_DIFF_BYTES = 4 * 1024 * 1024;

function run(root: string, args: string[], maxBuffer = MAX_DIFF_BYTES): Buffer {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.startsWith('GIT_')) delete env[key];
  }
  env.GIT_CONFIG_GLOBAL = '/dev/null';
  env.GIT_CONFIG_NOSYSTEM = '1';
  try {
    return execFileSync(
      'git',
      [
        `--git-dir=${join(root, '.git')}`,
        `--work-tree=${root}`,
        '-c',
        `core.worktree=${root}`,
        '-c',
        'core.hooksPath=/dev/null',
        '-c',
        'core.fsmonitor=false',
        '-c',
        'core.attributesFile=/dev/null',
        '-c',
        'commit.gpgsign=false',
        ...args,
      ],
      {
        cwd: root,
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
        maxBuffer,
      },
    );
  } catch {
    throw new MemoryAcceptError(
      'memory-invalid',
      `Memory Git operation failed: ${args[0] ?? 'unknown'}`,
    );
  }
}

function output(root: string, args: string[]): string {
  return run(root, args).toString('utf8').trim();
}

function assertSafeGitMetadata(root: string): void {
  const infoAttributes = join(root, '.git', 'info', 'attributes');
  if (existsSync(infoAttributes)) {
    if (lstatSync(infoAttributes).isSymbolicLink() || readFileSync(infoAttributes).length > 0) {
      throw new MemoryAcceptError(
        'memory-invalid',
        'Memory Git attributes override is not allowed',
      );
    }
  }
  const localKeys = run(root, ['config', '--local', '--list', '--name-only', '-z'])
    .toString('utf8')
    .split('\0');
  if (localKeys.some((key) => key.startsWith('filter.'))) {
    throw new MemoryAcceptError('memory-invalid', 'Memory Git filter configuration is not allowed');
  }
}

function verifiedRepository(root: string, botSlug: string): string {
  if (
    !existsSync(join(root, '.git')) ||
    !lstatSync(join(root, '.git')).isDirectory() ||
    lstatSync(join(root, '.git')).isSymbolicLink()
  ) {
    throw new MemoryAcceptError('memory-unavailable', `Memory Repository unavailable: ${botSlug}`);
  }
  assertSafeGitMetadata(root);
  if (output(root, ['symbolic-ref', '--quiet', '--short', 'HEAD']) !== 'main') {
    throw new MemoryAcceptError('memory-invalid', 'Memory Repository must be on main');
  }
  return root;
}

function repository(registry: PersonaBotRegistry, botSlug: string): string {
  const root = registry.memoryDirFor(botSlug);
  if (root === undefined) {
    throw new MemoryAcceptError('memory-unavailable', `Memory Repository unavailable: ${botSlug}`);
  }
  return verifiedRepository(root, botSlug);
}

function head(root: string): string {
  const sha = output(root, ['rev-parse', '--verify', 'HEAD']);
  if (!/^[0-9a-f]{40}$/u.test(sha)) {
    throw new MemoryAcceptError('memory-invalid', 'Memory Repository HEAD is invalid');
  }
  return sha;
}

function dirty(root: string): boolean {
  assertSafeGitMetadata(root);
  return run(root, ['status', '--porcelain', '-z', '--untracked-files=all']).length > 0;
}

function assertPath(path: string): string {
  if (path === '.gitattributes') return path;
  const relative = toMemoryRelativePath(path);
  if (relative !== path || !relative.endsWith('.md')) {
    throw new MemoryAcceptError('memory-invalid', `Unsupported Memory path: ${path}`);
  }
  return relative;
}

function validateBytes(bytes: Buffer, path: string): void {
  if (bytes.length > MAX_FILE_BYTES || bytes.includes(0)) {
    throw new MemoryAcceptError(
      'memory-invalid',
      `Memory file is too large or contains NUL: ${path}`,
    );
  }
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new MemoryAcceptError('memory-invalid', `Memory file is not UTF-8: ${path}`);
  }
}

function validateCommit(root: string, sha: string): string {
  const entries = run(root, ['ls-tree', '-r', '-z', sha])
    .toString('utf8')
    .split('\0')
    .filter(Boolean);
  const paths: string[] = [];
  for (const entry of entries) {
    const tab = entry.indexOf('\t');
    if (tab < 0) throw new MemoryAcceptError('memory-invalid', 'Invalid Git tree entry');
    const header = entry.slice(0, tab).split(' ');
    const path = assertPath(entry.slice(tab + 1));
    if (header[0] !== '100644' && header[0] !== '100755') {
      throw new MemoryAcceptError('memory-invalid', `Memory file is not regular: ${path}`);
    }
    if (header[1] !== 'blob' || !/^[0-9a-f]{40}$/u.test(header[2] ?? '')) {
      throw new MemoryAcceptError('memory-invalid', `Memory object is invalid: ${path}`);
    }
    const bytes = run(root, ['cat-file', 'blob', header[2]!], MAX_FILE_BYTES + 1);
    validateBytes(bytes, path);
    if (path === '.gitattributes' && bytes.toString('utf8') !== '* text=auto eol=lf\n') {
      throw new MemoryAcceptError('memory-invalid', 'Memory attributes changed');
    }
    paths.push(path);
  }
  return JSON.stringify({ paths });
}

function validateWorktree(root: string): void {
  assertSafeGitMetadata(root);
  const walk = (relativeDir: string): void => {
    for (const entry of readdirSync(join(root, relativeDir), { withFileTypes: true })) {
      if (relativeDir === '' && entry.name === '.git') continue;
      const path = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;
      const absolute = join(root, path);
      if (lstatSync(absolute).isSymbolicLink()) {
        throw new MemoryAcceptError('memory-invalid', `Memory symlink refused: ${path}`);
      }
      if (entry.isDirectory()) {
        toMemoryRelativePath(path);
        walk(path);
      } else if (entry.isFile()) {
        assertPath(path);
        const size = lstatSync(absolute).size;
        if (size > MAX_FILE_BYTES) {
          throw new MemoryAcceptError('memory-invalid', `Memory file is too large: ${path}`);
        }
        const bytes = readFileSync(absolute);
        validateBytes(bytes, path);
        if (path === '.gitattributes' && bytes.toString('utf8') !== '* text=auto eol=lf\n') {
          throw new MemoryAcceptError('memory-invalid', 'Memory attributes changed');
        }
      } else {
        throw new MemoryAcceptError('memory-invalid', `Unsupported Memory entry: ${path}`);
      }
    }
  };
  walk('');
}

function rowToCommit(row: AcceptedRow): MemoryAcceptedCommit {
  return {
    botSlug: row.bot_slug,
    sha: row.sha,
    parentSha: row.parent_sha,
    actorKind: row.actor_kind,
    actorId: row.actor_id,
    causeKind: row.cause_kind,
    causeId: row.cause_id,
    validationResult: row.validation_result,
    acceptedAt: row.accepted_at,
  };
}

function rowToRepair(row: RepairRow): MemoryRepairEvent {
  return {
    id: row.id,
    botSlug: row.bot_slug,
    acceptedHeadSha: row.accepted_head_sha,
    provisionalHeadSha: row.provisional_head_sha,
    backupPath: row.backup_path,
    actorKind: row.actor_kind,
    actorId: row.actor_id,
    causeKind: row.cause_kind,
    status: row.status,
    requestedAt: row.requested_at,
    completedAt: row.completed_at,
  };
}

function parentOf(root: string, sha: string): string | null {
  const parents = output(root, ['rev-list', '--parents', '-n', '1', sha]).split(' ');
  if (parents.length > 2)
    throw new MemoryAcceptError('memory-invalid', 'Merge commits are not accepted as Memory');
  return parents[1] ?? null;
}

export function createMemoryAcceptance(options: {
  registry: PersonaBotRegistry;
  ownership: SessionOwnership;
  database: OperationalDatabaseModulePort;
  now?: () => Date;
}): MemoryAcceptance {
  const { registry, ownership, database } = options;
  const now = options.now ?? (() => new Date());
  const inFlight = new Map<string, string>();

  const pendingRepair = (botSlug: string): RepairRow | undefined =>
    database.read(
      (db) =>
        db
          .prepare(
            "SELECT * FROM memory_repair_events WHERE bot_slug = ? AND status = 'started' ORDER BY requested_at ASC LIMIT 1",
          )
          .get(botSlug) as RepairRow | undefined,
    );

  const readRepository = (botSlug: string): { root: string; repairing: boolean } => {
    const pending = pendingRepair(botSlug);
    if (pending === undefined) return { root: repository(registry, botSlug), repairing: false };
    const canonical = registry.memoryDirFor(botSlug);
    const archive = join(pending.backup_path, 'repository');
    const root =
      canonical !== undefined && existsSync(join(canonical, '.git')) ? canonical : archive;
    return { root: verifiedRepository(root, botSlug), repairing: true };
  };

  const acceptedHead = (botSlug: string): string | null =>
    database.read((db) => {
      const row = db
        .prepare('SELECT head_sha FROM memory_accepted_heads WHERE bot_slug = ?')
        .get(botSlug) as { head_sha: string } | undefined;
      return row?.head_sha ?? null;
    });

  const accept = (
    botSlug: string,
    commits: Array<{
      sha: string;
      parentSha: string | null;
      actorKind: MemoryAcceptedCommit['actorKind'];
      actorId: string;
      causeKind: MemoryAcceptedCommit['causeKind'];
      causeId: string;
      validationResult: string;
    }>,
    expectedHead: string | null,
  ): MemoryAcceptedCommit[] => {
    if (commits.length === 0) return [];
    const at = now().toISOString();
    return database.transaction(
      (db) => {
        const current = db
          .prepare('SELECT head_sha FROM memory_accepted_heads WHERE bot_slug = ?')
          .get(botSlug) as { head_sha: string } | undefined;
        if ((current?.head_sha ?? null) !== expectedHead) {
          throw new MemoryAcceptError(
            'memory-conflict',
            'Accepted Memory head changed during validation',
          );
        }
        const result: MemoryAcceptedCommit[] = [];
        let previous = expectedHead;
        for (const commit of commits) {
          if (commit.parentSha !== previous) {
            throw new MemoryAcceptError(
              'memory-conflict',
              'Memory commit is not a fast-forward descendant',
            );
          }
          db.prepare(`INSERT INTO memory_accepted_commits (
          bot_slug, sha, parent_sha, actor_kind, actor_id, cause_kind, cause_id,
          validation_result, accepted_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
            botSlug,
            commit.sha,
            commit.parentSha,
            commit.actorKind,
            commit.actorId,
            commit.causeKind,
            commit.causeId,
            commit.validationResult,
            at,
          );
          result.push({
            botSlug,
            sha: commit.sha,
            parentSha: commit.parentSha,
            actorKind: commit.actorKind,
            actorId: commit.actorId,
            causeKind: commit.causeKind,
            causeId: commit.causeId,
            validationResult: commit.validationResult,
            acceptedAt: at,
          });
          previous = commit.sha;
        }
        db.prepare(`INSERT INTO memory_accepted_heads (bot_slug, head_sha, updated_at)
        VALUES (?, ?, ?) ON CONFLICT(bot_slug) DO UPDATE SET
          head_sha = excluded.head_sha, updated_at = excluded.updated_at`).run(
          botSlug,
          previous,
          at,
        );
        return result;
      },
      ['memory-accepted'],
    );
  };

  const bootstrap = (botSlug: string, root: string): string => {
    const existing = acceptedHead(botSlug);
    if (existing !== null) return existing;
    if (dirty(root)) {
      throw new MemoryAcceptError(
        'memory-conflict',
        'Provisional Memory changes need repair before bootstrap',
      );
    }
    const sha = head(root);
    if (
      parentOf(root, sha) !== null ||
      output(root, ['show', '-s', '--format=%s', sha]) !== 'Initialize memory repository' ||
      output(root, ['show', '-s', '--format=%an <%ae>%n%cn <%ce>', sha]) !==
        'BotHarness <bot@botharness.local>\nBotHarness <bot@botharness.local>'
    ) {
      throw new MemoryAcceptError(
        'memory-conflict',
        'Existing raw Memory history requires an explicit legacy import',
      );
    }
    const seedPaths = run(root, ['ls-tree', '-r', '--name-only', '-z', sha])
      .toString('utf8')
      .split('\0')
      .filter(Boolean)
      .sort();
    if (
      seedPaths.join(',') !== '.gitattributes' &&
      seedPaths.join(',') !== '.gitattributes,PERSONA.md'
    ) {
      throw new MemoryAcceptError('memory-conflict', 'Memory seed contains unexpected files');
    }
    if (run(root, ['show', `${sha}:.gitattributes`]).toString('utf8') !== '* text=auto eol=lf\n') {
      throw new MemoryAcceptError(
        'memory-conflict',
        'Memory seed attributes do not match BotHarness',
      );
    }
    const commit = {
      sha,
      parentSha: null,
      actorKind: 'system' as const,
      actorId: 'botharness-bootstrap',
      causeKind: 'repository-init' as const,
      causeId: `bootstrap:${sha}`,
      validationResult: validateCommit(root, sha),
    };
    accept(botSlug, [commit], null);
    return acceptedHead(botSlug) ?? head(root);
  };

  const requireOwned = (botSlug: string, sessionId: string): void => {
    const owner = ownership.resolve(sessionId);
    if (owner?.botSlug !== botSlug || owner.rootRole !== 'orchestrator') {
      throw new MemoryAcceptError('memory-conflict', 'Session does not own this Memory Repository');
    }
  };

  const prepareTurn = (botSlug: string, sessionId: string): void => {
    requireOwned(botSlug, sessionId);
    if (pendingRepair(botSlug) !== undefined) {
      throw new MemoryAcceptError('memory-conflict', 'Memory repair must finish before turn');
    }
    const root = repository(registry, botSlug);
    const baseline = bootstrap(botSlug, root);
    if (head(root) !== baseline || dirty(root)) {
      throw new MemoryAcceptError(
        'memory-conflict',
        'Memory Repository has provisional changes before turn',
      );
    }
    if (inFlight.has(botSlug)) {
      throw new MemoryAcceptError('memory-conflict', 'Another Memory turn is active');
    }
    inFlight.set(botSlug, sessionId);
  };

  const reconcileTurn = (input: {
    botSlug: string;
    sessionId: string;
    sourceEventId: string;
  }): MemoryAcceptedCommit[] => {
    requireOwned(input.botSlug, input.sessionId);
    if (inFlight.get(input.botSlug) !== input.sessionId) {
      throw new MemoryAcceptError('memory-conflict', 'Memory turn was not prepared');
    }
    const source = database.read(
      (db) =>
        db
          .prepare('SELECT bot_slug, source_kind FROM source_events WHERE source_event_id = ?')
          .get(input.sourceEventId) as { bot_slug: string; source_kind: string } | undefined,
    );
    if (
      source?.bot_slug !== input.botSlug ||
      !['human-message', 'assignment-report'].includes(source.source_kind)
    ) {
      throw new MemoryAcceptError(
        'memory-conflict',
        'Source Event does not authorize Memory acceptance',
      );
    }
    const root = repository(registry, input.botSlug);
    const priorCause = database.read(
      (db) =>
        db
          .prepare(`SELECT * FROM memory_accepted_commits
        WHERE bot_slug = ? AND cause_kind = 'source-event' AND cause_id = ?
        ORDER BY rowid ASC`)
          .all(input.botSlug, input.sourceEventId) as unknown as AcceptedRow[],
    );
    if (priorCause.length > 0) {
      if (dirty(root) || head(root) !== acceptedHead(input.botSlug)) {
        throw new MemoryAcceptError(
          'memory-conflict',
          'Source Event already accepted a different Memory change',
        );
      }
      inFlight.delete(input.botSlug);
      return priorCause.map(rowToCommit);
    }
    const baseline = acceptedHead(input.botSlug);
    if (baseline === null)
      throw new MemoryAcceptError('memory-conflict', 'Memory baseline is missing');
    const current = head(root);
    const fastForward = output(root, ['merge-base', baseline, current]) === baseline;
    if (!fastForward) {
      throw new MemoryAcceptError('memory-conflict', 'Memory HEAD diverged from accepted head');
    }
    const shas =
      current === baseline
        ? []
        : output(root, ['rev-list', '--reverse', `${baseline}..${current}`])
            .split('\n')
            .filter(Boolean);
    const commits: Parameters<typeof accept>[1] = [];
    let previous = baseline;
    for (const sha of shas) {
      const parentSha = parentOf(root, sha);
      if (parentSha !== previous)
        throw new MemoryAcceptError('memory-invalid', 'Memory history is not linear');
      commits.push({
        sha,
        parentSha,
        actorKind: 'agent',
        actorId: input.sessionId,
        causeKind: 'source-event',
        causeId: input.sourceEventId,
        validationResult: validateCommit(root, sha),
      });
      previous = sha;
    }
    if (dirty(root)) {
      validateWorktree(root);
      run(root, ['add', '-A']);
      const staged = run(root, ['diff', '--cached', '--name-only', '-z']);
      if (staged.length > 0) {
        run(root, ['commit', '--no-gpg-sign', '-m', `Memory update for ${input.sourceEventId}`]);
        const sha = head(root);
        if (parentOf(root, sha) !== previous) {
          throw new MemoryAcceptError(
            'memory-conflict',
            'Memory commit parent changed during reconciliation',
          );
        }
        commits.push({
          sha,
          parentSha: previous,
          actorKind: 'agent',
          actorId: input.sessionId,
          causeKind: 'source-event',
          causeId: input.sourceEventId,
          validationResult: validateCommit(root, sha),
        });
      }
    }
    const result = accept(input.botSlug, commits, baseline);
    inFlight.delete(input.botSlug);
    return result;
  };

  return {
    prepareTurn,
    reconcileTurn,
    abortTurn(botSlug, sessionId) {
      if (inFlight.get(botSlug) === sessionId) inFlight.delete(botSlug);
    },
    snapshot(botSlug) {
      const { root, repairing } = readRepository(botSlug);
      const accepted = bootstrap(botSlug, root);
      const files = run(root, ['ls-tree', '-r', '--name-only', '-z', accepted])
        .toString('utf8')
        .split('\0')
        .filter((path) => path.endsWith('.md'));
      return {
        head: accepted,
        files,
        provisional: repairing || dirty(root) || head(root) !== accepted,
      };
    },
    readAccepted(botSlug, path) {
      const { root } = readRepository(botSlug);
      const accepted = bootstrap(botSlug, root);
      const relative = toMemoryWritePath(path);
      const files = run(root, ['ls-tree', '-r', '--name-only', '-z', accepted])
        .toString('utf8')
        .split('\0');
      if (!files.includes(relative)) return undefined;
      const bytes = run(root, ['show', `${accepted}:${relative}`], MAX_FILE_BYTES + 1);
      validateBytes(bytes, relative);
      return { path: relative, body: bytes.toString('utf8'), head: accepted };
    },
    history(botSlug, limit = 20) {
      const { root } = readRepository(botSlug);
      bootstrap(botSlug, root);
      const bounded = Math.max(1, Math.min(limit, 100));
      const rows = database.read(
        (db) =>
          db
            .prepare(`SELECT * FROM memory_accepted_commits WHERE bot_slug = ?
          ORDER BY rowid DESC LIMIT ?`)
            .all(botSlug, bounded) as unknown as AcceptedRow[],
      );
      return rows.map(rowToCommit);
    },
    diff(botSlug, sha) {
      const { root } = readRepository(botSlug);
      const exists = database.read(
        (db) =>
          db
            .prepare(
              'SELECT 1 AS found FROM memory_accepted_commits WHERE bot_slug = ? AND sha = ?',
            )
            .get(botSlug, sha) as { found: number } | undefined,
      );
      if (exists === undefined) {
        throw new MemoryAcceptError('memory-unknown-commit', 'Memory Commit is not accepted');
      }
      const patch = run(root, ['show', '--format=', '--no-ext-diff', sha], MAX_DIFF_BYTES);
      return { sha, diff: patch.toString('utf8') };
    },
    repairHuman(input) {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u.test(input.repairId)) {
        throw new MemoryAcceptError('memory-invalid', 'Valid Memory repair identity is required');
      }
      const root = registry.memoryDirFor(input.botSlug);
      const baseline = acceptedHead(input.botSlug);
      if (
        root === undefined ||
        baseline === null ||
        baseline !== input.expectedHead ||
        inFlight.has(input.botSlug)
      ) {
        throw new MemoryAcceptError(
          'memory-conflict',
          'Accepted Memory changed or a turn is active',
        );
      }
      const existing = database.read(
        (db) =>
          db.prepare('SELECT * FROM memory_repair_events WHERE id = ?').get(input.repairId) as
            | RepairRow
            | undefined,
      );
      if (existing !== undefined) {
        if (existing.bot_slug !== input.botSlug || existing.accepted_head_sha !== baseline) {
          throw new MemoryAcceptError('memory-conflict', 'Memory repair identity was already used');
        }
        if (existing.status === 'completed') return rowToRepair(existing);
      }
      let event = existing ?? pendingRepair(input.botSlug);
      if (event === undefined) {
        verifiedRepository(root, input.botSlug);
        const provisionalHead = head(root);
        if (provisionalHead === baseline && !dirty(root)) {
          throw new MemoryAcceptError('memory-conflict', 'Memory has no provisional changes');
        }
        const parent = join(dirname(root), 'memory-repairs');
        mkdirSync(parent, { recursive: true, mode: 0o700 });
        const backupPath = join(parent, input.repairId);
        if (existsSync(backupPath)) {
          throw new MemoryAcceptError('memory-conflict', 'Memory repair archive already exists');
        }
        mkdirSync(backupPath, { mode: 0o700 });
        const at = now().toISOString();
        event = database.transaction(
          (db) => {
            db.prepare(`INSERT INTO memory_repair_events (
            id, bot_slug, accepted_head_sha, provisional_head_sha, backup_path,
            actor_kind, actor_id, cause_kind, status, requested_at
          ) VALUES (?, ?, ?, ?, ?, 'human', 'authenticated-dsh-human', 'human-repair', 'started', ?)`).run(
              input.repairId,
              input.botSlug,
              baseline,
              provisionalHead,
              backupPath,
              at,
            );
            return db
              .prepare('SELECT * FROM memory_repair_events WHERE id = ?')
              .get(input.repairId) as unknown as RepairRow;
          },
          ['memory-repair'],
        );
      }
      const archive = join(event.backup_path, 'repository');
      if (!existsSync(archive)) {
        if (!existsSync(root)) {
          throw new MemoryAcceptError(
            'memory-invalid',
            'Memory repair source and archive are missing',
          );
        }
        verifiedRepository(root, input.botSlug);
        if (head(root) !== event.provisional_head_sha) {
          throw new MemoryAcceptError('memory-conflict', 'Memory HEAD changed before archive');
        }
        renameSync(root, archive);
      }
      verifiedRepository(archive, input.botSlug);
      if (existsSync(root)) {
        verifiedRepository(root, input.botSlug);
        if (head(root) !== baseline || dirty(root)) {
          throw new MemoryAcceptError('memory-conflict', 'Memory root changed during repair');
        }
      } else {
        const staging = mkdtempSync(join(dirname(root), '.memory-restore-'));
        try {
          const restored = join(staging, 'repository');
          cpSync(archive, restored, { recursive: true, dereference: false });
          verifiedRepository(restored, input.botSlug);
          run(restored, ['reset', '--hard', baseline]);
          run(restored, ['clean', '-ffdx']);
          if (head(restored) !== baseline || dirty(restored)) {
            throw new MemoryAcceptError(
              'memory-conflict',
              'Memory repair did not restore accepted head',
            );
          }
          if (existsSync(root)) {
            throw new MemoryAcceptError('memory-conflict', 'Memory root reappeared during repair');
          }
          renameSync(restored, root);
        } finally {
          rmSync(staging, { recursive: true, force: true });
        }
      }
      const at = now().toISOString();
      return rowToRepair(
        database.transaction(
          (db) => {
            db.prepare(
              "UPDATE memory_repair_events SET status = 'completed', completed_at = ? WHERE id = ?",
            ).run(at, event.id);
            return db
              .prepare('SELECT * FROM memory_repair_events WHERE id = ?')
              .get(event.id) as unknown as RepairRow;
          },
          ['memory-repair'],
        ),
      );
    },
    saveHuman(input) {
      if (pendingRepair(input.botSlug) !== undefined) {
        throw new MemoryAcceptError(
          'memory-conflict',
          'Memory repair must finish before Human save',
        );
      }
      const root = repository(registry, input.botSlug);
      const priorEdit = database.read(
        (db) =>
          db
            .prepare(`SELECT * FROM memory_accepted_commits
          WHERE bot_slug = ? AND cause_kind = 'human-edit' AND cause_id = ?`)
            .get(input.botSlug, input.editId) as AcceptedRow | undefined,
      );
      if (priorEdit !== undefined) {
        const current = acceptedHead(input.botSlug);
        const path = toMemoryWritePath(input.path);
        const previousBody = run(
          root,
          ['show', `${priorEdit.sha}:${path}`],
          MAX_FILE_BYTES + 1,
        ).toString('utf8');
        if (current !== priorEdit.sha || previousBody !== input.body) {
          throw new MemoryAcceptError('memory-conflict', 'Human edit identity was already used');
        }
        return rowToCommit(priorEdit);
      }
      const baseline = bootstrap(input.botSlug, root);
      if (
        inFlight.has(input.botSlug) ||
        baseline !== input.expectedHead ||
        head(root) !== baseline ||
        dirty(root)
      ) {
        throw new MemoryAcceptError('memory-conflict', 'Memory changed since the Human opened it');
      }
      const path = toMemoryWritePath(input.path);
      if (Buffer.byteLength(input.body, 'utf8') > MAX_FILE_BYTES || input.body.includes('\0')) {
        throw new MemoryAcceptError('memory-invalid', 'Memory edit is too large or contains NUL');
      }
      const target = resolveMemoryPath(root, path);
      mkdirSync(dirname(target), { recursive: true });
      atomicWriteFile(target, input.body);
      validateWorktree(root);
      run(root, ['add', '--', path]);
      if (run(root, ['diff', '--cached', '--name-only', '--', path]).length === 0) {
        throw new MemoryAcceptError('memory-conflict', 'Memory edit did not change the file');
      }
      if (head(root) !== baseline) {
        throw new MemoryAcceptError('memory-conflict', 'Memory head changed before Human commit');
      }
      run(root, ['commit', '--no-gpg-sign', '-m', `Human Memory edit: ${path}`]);
      const sha = head(root);
      if (parentOf(root, sha) !== baseline) {
        throw new MemoryAcceptError(
          'memory-conflict',
          'Human Memory commit has an unaccepted parent',
        );
      }
      const [accepted] = accept(
        input.botSlug,
        [
          {
            sha,
            parentSha: baseline,
            actorKind: 'human',
            actorId: 'authenticated-dsh-human',
            causeKind: 'human-edit',
            causeId: input.editId,
            validationResult: validateCommit(root, sha),
          },
        ],
        baseline,
      );
      if (accepted === undefined)
        throw new MemoryAcceptError('memory-invalid', 'Memory edit was not accepted');
      return accepted;
    },
  };
}
