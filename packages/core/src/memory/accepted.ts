import { execFileSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  statSync,
  renameSync,
  rmSync,
} from 'node:fs';
import { dirname, join } from 'node:path';

import type { PersonaBotRegistry } from '../bots/registry.js';
import { atomicWriteFile } from '../fs/atomic-write.js';
import type { OperationalDatabaseModulePort } from '../database/owner.js';
import type { SessionOwnership } from '../sessions/ownership.js';
import { toMemoryRelativePath, resolveMemoryPath } from './jail.js';

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

/** Git history view. The checked-out working tree is current Memory. */
export interface MemoryGitCommit {
  sha: string;
  parents: string[];
  subject: string;
  authoredAt: string;
  branches: string[];
  status: 'accepted' | 'pending' | 'needs-repair';
}

export interface MemoryGitGraph {
  head: string;
  currentBranch: string | null;
  branches: string[];
  dirty: boolean;
  commits: MemoryGitCommit[];
  hasMore: boolean;
}

export interface MemoryGitCommitDiff {
  sha: string;
  files: { path: string; status: string }[];
  diff: string;
}

export interface MemoryAcceptance {
  continueFromCommit(input: { botSlug: string; sessionId: string; sha: string; branch: string }): {
    from: string;
    to: string;
    head: string;
  };
  switchBranch(input: { botSlug: string; sessionId: string; branch: string }): {
    from: string;
    to: string;
    head: string;
  };
  prepareTurn(
    botSlug: string,
    sessionId: string,
    options?: { coordinateBranchSwitch?: boolean },
  ): void;
  reconcileTurn(input: {
    botSlug: string;
    sessionId: string;
    sourceEventId: string;
  }): MemoryAcceptedCommit[];
  abortTurn(botSlug: string, sessionId: string): void;
  takeTurnAnnotation(input: { botSlug: string; sessionId: string }): string | undefined;
  snapshot(botSlug: string): MemoryAcceptedSnapshot;
  readAccepted(
    botSlug: string,
    path: string,
  ): { path: string; body: string; head: string; binary?: boolean } | undefined;
  history(botSlug: string, limit?: number): MemoryAcceptedCommit[];
  diff(botSlug: string, sha: string): { sha: string; diff: string };
  gitGraph(botSlug: string, offset?: number): MemoryGitGraph;
  gitCommitDiff(botSlug: string, sha: string): MemoryGitCommitDiff;
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

function branchOf(root: string): string {
  try {
    return output(root, ['symbolic-ref', '--quiet', '--short', 'HEAD']);
  } catch {
    throw new MemoryAcceptError('memory-invalid', 'Memory Repository must be on a local branch');
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
  branchOf(root);
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
  return run(root, ['status', '--porcelain', '-z', '--untracked-files=all']).length > 0;
}

interface TurnWorktreeObservation {
  sessionId: string;
  branch: string;
  head: string;
  porcelain: string[];
}

const MAX_ANNOTATION_PATHS = 30;
const MAX_ANNOTATION_BYTES = 4096;

function porcelainPaths(root: string): string[] {
  const raw = run(root, ['status', '--porcelain', '-z', '--untracked-files=all']).toString('utf8');
  if (raw.length === 0) return [];
  const paths: string[] = [];
  for (const entry of raw.split('\0')) {
    if (entry.length < 4) continue;
    const rest = entry.slice(3);
    const arrow = rest.indexOf(' -> ');
    paths.push(arrow < 0 ? rest : rest.slice(arrow + 4));
  }
  return paths;
}

function observeWorktree(root: string): { branch: string; head: string; porcelain: string[] } {
  return { branch: branchOf(root), head: head(root), porcelain: porcelainPaths(root) };
}

function safeGit(root: string, args: string[]): string {
  try {
    return output(root, args);
  } catch {
    return '';
  }
}

function buildTurnAnnotation(
  root: string,
  previous: TurnWorktreeObservation,
  current: { branch: string; head: string; porcelain: string[] },
): string | undefined {
  // Webhook shape, deliberately: paths only, never bodies. The agent reads
  // details itself with ordinary git and file tools (including untracked
  // files, which porcelain already lists). Stat and full-diff blocks were
  // cut: the turn pays for what it names, nothing more.
  const details: string[] = [];
  if (current.branch !== previous.branch) {
    details.push(`Memory branch is now '${current.branch}' (was '${previous.branch}').`);
  }
  const committedNames: string[] = [];
  if (current.head !== previous.head) {
    for (const name of safeGit(root, ['diff', '--name-only', '-z', previous.head, current.head]).split(
      '\0',
    )) {
      if (name.length > 0) committedNames.push(name);
    }
    const shown = committedNames.slice(0, MAX_ANNOTATION_PATHS);
    if (shown.length > 0) {
      details.push(
        `Committed Memory changes since your last turn: ${shown.join(', ')}${committedNames.length > shown.length ? ` (+${committedNames.length - shown.length} more)` : ''}`,
      );
    } else {
      details.push('Memory commits changed since your last turn; inspect them with git commands.');
    }
  }
  const added = current.porcelain.filter((path) => !previous.porcelain.includes(path));
  if (added.length > 0) {
    const shown = added.slice(0, MAX_ANNOTATION_PATHS);
    details.push(
      `Uncommitted Memory changes since your last turn: ${shown.join(', ')}${added.length > shown.length ? ` (+${added.length - shown.length} more)` : ''}`,
    );
  }
  if (details.length === 0) return undefined;
  if (committedNames.includes('PERSONA.md') || added.includes('PERSONA.md')) {
    details.push(
      'PERSONA.md changed on disk; your frozen session copy still applies — the file version reaches new Sessions.',
    );
  }
  const text = `Memory changed since your last turn:\n${details.join('\n')}`;
  return text.length <= MAX_ANNOTATION_BYTES ? text : `${text.slice(0, MAX_ANNOTATION_BYTES)}\n…(truncated)`;
}

function validateCommit(root: string, sha: string): string {
  const tree = output(root, ['rev-parse', '--verify', `${sha}^{tree}`]);
  return JSON.stringify({ gitTree: tree });
}

function listCurrentFiles(root: string): string[] {
  const files: string[] = [];
  const walk = (relativeDir: string): void => {
    for (const entry of readdirSync(join(root, relativeDir), { withFileTypes: true })) {
      if (relativeDir === '' && entry.name === '.git') continue;
      const path = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile() || entry.isSymbolicLink()) files.push(path);
    }
  };
  walk('');
  return files.sort();
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
  const inFlight = new Map<
    string,
    { sessionId: string; branch: string; preservePending?: boolean }
  >();
  // Last worktree state observed at a turn boundary (reconcile/abort end).
  // Everything the agent wrote during its own turn is in history by then, so
  // the next prepare only reports out-of-band changes. In-memory only: after a
  // Host restart the first prepare re-baselines silently.
  const observed = new Map<string, TurnWorktreeObservation>();
  // Take-once annotation staged by prepareTurn for the current turn message.
  const pendingAnnotation = new Map<string, { sessionId: string; text: string }>();

  const refreshObservation = (botSlug: string, sessionId: string): boolean => {
    try {
      observed.set(botSlug, { ...observeWorktree(repository(registry, botSlug)), sessionId });
      return true;
    } catch {
      // A broken repository keeps the previous baseline; the turn error path reports it.
      return false;
    }
  };

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

  const graphRepository = (botSlug: string): string => {
    const root = registry.memoryDirFor(botSlug);
    if (
      root === undefined ||
      !existsSync(join(root, '.git')) ||
      !lstatSync(join(root, '.git')).isDirectory() ||
      lstatSync(join(root, '.git')).isSymbolicLink()
    ) {
      throw new MemoryAcceptError(
        'memory-unavailable',
        `Memory Repository unavailable: ${botSlug}`,
      );
    }
    return root;
  };

  const acceptedHead = (botSlug: string, branch: string): string | null =>
    database.read((db) => {
      const row = db
        .prepare(
          'SELECT head_sha FROM memory_accepted_heads WHERE bot_slug = ? AND branch_name = ?',
        )
        .get(botSlug, branch) as { head_sha: string } | undefined;
      return row?.head_sha ?? null;
    });

  const accept = (
    botSlug: string,
    branch: string,
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
          .prepare(
            'SELECT head_sha FROM memory_accepted_heads WHERE bot_slug = ? AND branch_name = ?',
          )
          .get(botSlug, branch) as { head_sha: string } | undefined;
        if ((current?.head_sha ?? null) !== expectedHead) {
          throw new MemoryAcceptError(
            'memory-conflict',
            'Accepted Memory head changed during validation',
          );
        }
        const result: MemoryAcceptedCommit[] = [];
        let previous = expectedHead;
        for (const commit of commits) {
          const inserted = db
            .prepare(`INSERT OR IGNORE INTO memory_accepted_commits (
          bot_slug, sha, parent_sha, actor_kind, actor_id, cause_kind, cause_id,
          validation_result, accepted_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
            .run(
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
          if (inserted.changes > 0) {
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
          }
          previous = commit.sha;
        }
        db.prepare(`INSERT INTO memory_accepted_heads (bot_slug, branch_name, head_sha, updated_at)
        VALUES (?, ?, ?, ?) ON CONFLICT(bot_slug, branch_name) DO UPDATE SET
          head_sha = excluded.head_sha, updated_at = excluded.updated_at`).run(
          botSlug,
          branch,
          previous,
          at,
        );
        return result;
      },
      ['memory-accepted'],
    );
  };

  const bootstrap = (botSlug: string, root: string): string => {
    const branch = branchOf(root);
    const sha = head(root);
    if (acceptedHead(botSlug, branch) !== null) return sha;
    if (
      branch !== 'main' ||
      output(root, ['rev-list', '--parents', '-n', '1', sha]).split(' ').length !== 1 ||
      output(root, ['show', '-s', '--format=%s', sha]) !== 'Initialize memory repository'
    )
      return sha;
    accept(
      botSlug,
      branch,
      [
        {
          sha,
          parentSha: null,
          actorKind: 'system',
          actorId: 'botharness-bootstrap',
          causeKind: 'repository-init',
          causeId: `bootstrap:${sha}`,
          validationResult: validateCommit(root, sha),
        },
      ],
      null,
    );
    return sha;
  };

  const requireOwned = (botSlug: string, sessionId: string): void => {
    const owner = ownership.resolve(sessionId);
    if (owner?.botSlug !== botSlug || owner.rootRole !== 'orchestrator') {
      throw new MemoryAcceptError('memory-conflict', 'Session does not own this Memory Repository');
    }
  };

  const prepareTurn = (
    botSlug: string,
    sessionId: string,
    options?: { coordinateBranchSwitch?: boolean },
  ): void => {
    requireOwned(botSlug, sessionId);
    if (pendingRepair(botSlug) !== undefined) {
      throw new MemoryAcceptError('memory-conflict', 'Memory repair must finish before turn');
    }
    const root = repository(registry, botSlug);
    bootstrap(botSlug, root);
    if (inFlight.has(botSlug)) {
      throw new MemoryAcceptError('memory-conflict', 'Another Memory turn is active');
    }
    void options;
    inFlight.set(botSlug, { sessionId, branch: branchOf(root) });
    const current = observeWorktree(root);
    const previous = observed.get(botSlug);
    if (previous === undefined) {
      observed.set(botSlug, { ...current, sessionId });
    } else {
      const text = buildTurnAnnotation(root, previous, current);
      if (text !== undefined) pendingAnnotation.set(botSlug, { sessionId, text });
    }
  };

  const reconcileTurn = (input: {
    botSlug: string;
    sessionId: string;
    sourceEventId: string;
  }): MemoryAcceptedCommit[] => {
    requireOwned(input.botSlug, input.sessionId);
    const flight = inFlight.get(input.botSlug);
    if (flight?.sessionId !== input.sessionId) {
      throw new MemoryAcceptError('memory-conflict', 'Memory turn was not prepared');
    }
    const source = database.read(
      (db) =>
        db
          .prepare('SELECT bot_slug, source_kind FROM source_events WHERE source_event_id = ?')
          .get(input.sourceEventId) as { bot_slug: string; source_kind: string } | undefined,
    );
    if (
      (source?.bot_slug !== input.botSlug &&
        !database.read((db) =>
          db
            .prepare('SELECT 1 FROM inbox_admissions WHERE source_event_id = ? AND bot_slug = ?')
            .get(input.sourceEventId, input.botSlug),
        )) ||
      (!['human-message', 'assignment-report'].includes(source?.source_kind ?? '') &&
        !(
          (source?.source_kind === 'bot-message' || source?.source_kind === 'system-message') &&
          database.read((db) =>
            db
              .prepare(
                `SELECT 1 FROM inbox_admissions WHERE source_event_id = ? AND bot_slug = ? AND reason IN ('bot-dm', 'group-mention', 'group-invite')`,
              )
              .get(input.sourceEventId, input.botSlug),
          )
        ))
    ) {
      throw new MemoryAcceptError(
        'memory-conflict',
        'Source Event does not authorize Memory observation',
      );
    }
    const root = repository(registry, input.botSlug);
    const branch = branchOf(root);
    const current = head(root);
    const checkpoint = acceptedHead(input.botSlug, branch);
    const result =
      current === checkpoint
        ? []
        : accept(
            input.botSlug,
            branch,
            [
              {
                sha: current,
                parentSha:
                  output(root, ['rev-list', '--parents', '-n', '1', current]).split(' ')[1] ?? null,
                actorKind: 'agent',
                actorId: input.sessionId,
                causeKind: 'source-event',
                causeId: input.sourceEventId,
                validationResult: validateCommit(root, current),
              },
            ],
            checkpoint,
          );
    refreshObservation(input.botSlug, input.sessionId);
    inFlight.delete(input.botSlug);
    return result;
  };

  return {
    continueFromCommit(input) {
      requireOwned(input.botSlug, input.sessionId);
      const flight = inFlight.get(input.botSlug);
      if (flight?.sessionId !== input.sessionId) {
        throw new MemoryAcceptError('memory-conflict', 'Memory turn was not prepared');
      }
      const root = repository(registry, input.botSlug);
      const from = branchOf(root);
      if (from !== flight.branch) {
        throw new MemoryAcceptError('memory-conflict', 'Memory branch changed during turn');
      }
      const branch = input.branch.trim();
      if (branch.length === 0 || branch.length > 255 || branch !== input.branch) {
        throw new MemoryAcceptError('memory-invalid', 'Invalid Memory branch name');
      }
      try {
        run(root, ['check-ref-format', '--branch', branch]);
      } catch {
        throw new MemoryAcceptError('memory-invalid', 'Invalid Memory branch name');
      }
      let exists = false;
      try {
        run(root, ['show-ref', '--verify', '--quiet', 'refs/heads/' + branch]);
        exists = true;
      } catch {
        // Git exits nonzero when the branch does not exist.
      }
      if (exists) throw new MemoryAcceptError('memory-conflict', 'Memory branch already exists');
      if (!/^[0-9a-f]{40}$/u.test(input.sha)) {
        throw new MemoryAcceptError('memory-unknown-commit', 'Unknown Memory Git commit');
      }
      // The diff query verifies both the object type and reachability from a
      // visible local branch. A dangling object must not become a branch point.
      this.gitCommitDiff(input.botSlug, input.sha);
      // Native Git decides whether the working tree permits this branch.
      try {
        run(root, ['switch', '-c', branch, input.sha]);
      } catch {
        throw new MemoryAcceptError(
          'memory-conflict',
          'Git could not create and switch Memory branch',
        );
      }
      inFlight.set(input.botSlug, { sessionId: input.sessionId, branch });
      return { from, to: branch, head: input.sha };
    },
    switchBranch(input) {
      requireOwned(input.botSlug, input.sessionId);
      const flight = inFlight.get(input.botSlug);
      if (flight?.sessionId !== input.sessionId) {
        throw new MemoryAcceptError('memory-conflict', 'Memory turn was not prepared');
      }
      const branch = input.branch.trim();
      if (branch.length === 0 || branch.length > 255 || branch !== input.branch) {
        throw new MemoryAcceptError('memory-invalid', 'Invalid Memory branch name');
      }
      const root = repository(registry, input.botSlug);
      const from = branchOf(root);
      if (from !== flight.branch) {
        throw new MemoryAcceptError('memory-conflict', 'Memory branch changed during turn');
      }
      try {
        run(root, ['check-ref-format', '--branch', branch]);
        run(root, ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`]);
      } catch {
        throw new MemoryAcceptError('memory-invalid', 'Memory branch does not exist');
      }
      // Native Git handles staged and working-tree conflicts.
      const targetHead = output(root, ['rev-parse', '--verify', `refs/heads/${branch}`]);
      if (from !== branch) {
        try {
          run(root, ['switch', branch]);
        } catch {
          throw new MemoryAcceptError('memory-conflict', 'Git could not switch Memory branch');
        }
      }
      inFlight.set(input.botSlug, { sessionId: input.sessionId, branch });
      return { from, to: branch, head: targetHead };
    },
    prepareTurn,
    reconcileTurn,
    abortTurn(botSlug, sessionId) {
      if (inFlight.get(botSlug)?.sessionId !== sessionId) return;
      inFlight.delete(botSlug);
      // The failed turn's tool calls stay in history, so they need no annotation.
      refreshObservation(botSlug, sessionId);
    },
    takeTurnAnnotation(input: { botSlug: string; sessionId: string }): string | undefined {
      if (inFlight.get(input.botSlug)?.sessionId !== input.sessionId) return undefined;
      const pending = pendingAnnotation.get(input.botSlug);
      if (pending === undefined || pending.sessionId !== input.sessionId) return undefined;
      pendingAnnotation.delete(input.botSlug);
      return pending.text;
    },
    snapshot(botSlug) {
      const { root, repairing } = readRepository(botSlug);
      bootstrap(botSlug, root);
      return {
        head: head(root),
        files: listCurrentFiles(root),
        provisional: repairing,
      };
    },
    readAccepted(botSlug, path) {
      const { root } = readRepository(botSlug);
      const relative = toMemoryRelativePath(path);
      const target = resolveMemoryPath(root, relative);
      if (!existsSync(target) || !statSync(target).isFile()) return undefined;
      const fileSize = statSync(target).size;
      if (fileSize > MAX_DIFF_BYTES) {
        return { path: relative, body: '', head: head(root), binary: true };
      }
      const bytes = readFileSync(target);
      let body: string;
      let binary = bytes.includes(0);
      try {
        body = binary ? '' : new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      } catch {
        body = '';
        binary = true;
      }
      return {
        path: relative,
        body,
        head: head(root),
        ...(binary ? { binary: true } : {}),
      };
    },

    gitGraph(botSlug, offset = 0) {
      if (!Number.isInteger(offset) || offset < 0 || offset > 10_000) {
        throw new MemoryAcceptError('memory-invalid', 'Invalid Memory graph offset');
      }
      const root = graphRepository(botSlug);
      const branchMap = new Map<string, string[]>();
      for (const line of output(root, [
        'for-each-ref',
        '--format=%(objectname) %(refname:short)',
        'refs/heads',
      ]).split('\n')) {
        if (line.length === 0) continue;
        const separator = line.indexOf(' ');
        if (separator < 0) continue;
        const sha = line.slice(0, separator);
        branchMap.set(sha, [...(branchMap.get(sha) ?? []), line.slice(separator + 1)]);
      }
      const currentHead = head(root);
      let currentBranch: string | null;
      try {
        currentBranch = output(root, ['symbolic-ref', '--quiet', '--short', 'HEAD']);
      } catch {
        currentBranch = null;
      }
      const repairing = pendingRepair(botSlug)?.provisional_head_sha;
      const lines = output(root, [
        'log',
        '--branches',
        'HEAD',
        '--topo-order',
        `--skip=${offset}`,
        '--max-count=61',
        '--format=%H%x1f%P%x1f%s%x1f%aI',
      ])
        .split('\n')
        .filter(Boolean);
      const displayedShas = lines.slice(0, 60).map((line) => line.slice(0, 40));
      const accepted = database.read((db) => {
        const lookup = db.prepare(
          'SELECT 1 AS found FROM memory_accepted_commits WHERE bot_slug = ? AND sha = ?',
        );
        return new Set(
          displayedShas.filter((sha) => {
            if (!/^[0-9a-f]{40}$/u.test(sha)) return false;
            return lookup.get(botSlug, sha) !== undefined;
          }),
        );
      });
      const commits = lines.slice(0, 60).map((line): MemoryGitCommit => {
        const [sha = '', parents = '', subject = '', authoredAt = ''] = line.split('\x1f');
        if (!/^[0-9a-f]{40}$/u.test(sha))
          throw new MemoryAcceptError('memory-invalid', 'Invalid Memory Git commit');
        return {
          sha,
          parents: parents === '' ? [] : parents.split(' '),
          subject,
          authoredAt,
          branches: branchMap.get(sha) ?? [],
          status: sha === repairing ? 'needs-repair' : accepted.has(sha) ? 'accepted' : 'pending',
        };
      });
      return {
        head: currentHead,
        currentBranch,
        branches: [...branchMap.values()].flat().sort(),
        dirty: dirty(root),
        commits,
        hasMore: lines.length > 60,
      };
    },
    gitCommitDiff(botSlug, sha) {
      if (!/^[0-9a-f]{40}$/u.test(sha)) {
        throw new MemoryAcceptError('memory-unknown-commit', 'Unknown Memory Git commit');
      }
      const root = graphRepository(botSlug);
      let objectType: string;
      try {
        objectType = output(root, ['cat-file', '-t', sha]);
      } catch {
        throw new MemoryAcceptError('memory-unknown-commit', 'Unknown Memory Git commit');
      }
      if (objectType !== 'commit') {
        throw new MemoryAcceptError('memory-unknown-commit', 'Unknown Memory Git commit');
      }
      const containing = output(root, ['branch', '--contains', sha, '--format=%(refname:short)']);
      let reachableFromHead = false;
      try {
        run(root, ['merge-base', '--is-ancestor', sha, 'HEAD']);
        reachableFromHead = true;
      } catch {
        // A side branch can be selected while HEAD remains elsewhere.
      }
      if (containing.length === 0 && !reachableFromHead) {
        throw new MemoryAcceptError('memory-unknown-commit', 'Unknown Memory Git commit');
      }
      const parents = output(root, ['rev-list', '--parents', '-n', '1', sha]).split(' ').slice(1);
      const firstParent = parents[0];
      const range = firstParent === undefined ? [sha] : [firstParent, sha];
      const nameStatus = run(
        root,
        firstParent === undefined
          ? [
              'diff-tree',
              '--root',
              '--no-renames',
              '--no-commit-id',
              '--name-status',
              '-r',
              '-z',
              sha,
            ]
          : ['diff', '--no-renames', '--name-status', '-z', ...range],
      )
        .toString('utf8')
        .split('\0')
        .filter(Boolean);
      const files: MemoryGitCommitDiff['files'] = [];
      for (let index = 0; index < nameStatus.length; index += 2) {
        files.push({ status: nameStatus[index] ?? '', path: nameStatus[index + 1] ?? '' });
      }
      return {
        sha,
        files,
        diff: output(
          root,
          firstParent === undefined
            ? ['show', '--format=', '--no-ext-diff', '--no-textconv', '--no-renames', '--root', sha]
            : ['diff', '--no-ext-diff', '--no-textconv', '--no-renames', ...range],
        ),
      };
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
      const existing = database.read(
        (db) =>
          db.prepare('SELECT * FROM memory_repair_events WHERE id = ?').get(input.repairId) as
            | RepairRow
            | undefined,
      );
      const pending = existing ?? pendingRepair(input.botSlug);
      const archived = pending === undefined ? undefined : join(pending.backup_path, 'repository');
      // After an interrupted archive move, the canonical path is absent. The
      // archived Git HEAD retains the exact branch that Human Repair started on.
      const branchSource =
        archived !== undefined && existsSync(join(archived, '.git')) ? archived : root;
      const branch =
        branchSource === undefined || !existsSync(join(branchSource, '.git'))
          ? 'main'
          : branchOf(verifiedRepository(branchSource, input.botSlug));
      const baseline = acceptedHead(input.botSlug, branch);
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
      if (existing !== undefined) {
        if (existing.bot_slug !== input.botSlug || existing.accepted_head_sha !== baseline) {
          throw new MemoryAcceptError('memory-conflict', 'Memory repair identity was already used');
        }
        if (existing.status === 'completed') return rowToRepair(existing);
      }
      let event = pending;
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
        if (branchOf(root) !== branch || head(root) !== event.provisional_head_sha) {
          throw new MemoryAcceptError('memory-conflict', 'Memory HEAD changed before archive');
        }
        renameSync(root, archive);
      }
      verifiedRepository(archive, input.botSlug);
      if (existsSync(root)) {
        verifiedRepository(root, input.botSlug);
        if (branchOf(root) !== branch || head(root) !== baseline || dirty(root)) {
          throw new MemoryAcceptError('memory-conflict', 'Memory root changed during repair');
        }
      } else {
        const staging = mkdtempSync(join(dirname(root), '.memory-restore-'));
        try {
          const restored = join(staging, 'repository');
          cpSync(archive, restored, { recursive: true, dereference: false });
          verifiedRepository(restored, input.botSlug);
          if (branchOf(restored) !== branch) {
            throw new MemoryAcceptError('memory-conflict', 'Memory repair branch changed');
          }
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
        const current = head(root);
        const path = toMemoryRelativePath(input.path);
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
      const baseline = head(root);
      if (inFlight.has(input.botSlug) || baseline !== input.expectedHead || dirty(root)) {
        throw new MemoryAcceptError('memory-conflict', 'Memory changed since the Human opened it');
      }
      const path = toMemoryRelativePath(input.path);
      if (Buffer.byteLength(input.body, 'utf8') > MAX_FILE_BYTES || input.body.includes('\0')) {
        throw new MemoryAcceptError('memory-invalid', 'Memory edit is too large or contains NUL');
      }
      const target = resolveMemoryPath(root, path);
      mkdirSync(dirname(target), { recursive: true });
      atomicWriteFile(target, input.body);
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
        branchOf(root),
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
        acceptedHead(input.botSlug, branchOf(root)),
      );
      if (accepted === undefined)
        throw new MemoryAcceptError('memory-invalid', 'Memory edit was not accepted');
      return accepted;
    },
  };
}
