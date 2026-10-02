import { execFile, execFileSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface MemoryCommit {
  sha: string;
  message: string;
  date: string;
}

export interface MemoryGit {
  status(): string[];

  diff(): string;
  head(): string;
  commit(message: string): string;
  log(limit?: number): MemoryCommit[];

  activitySince(sinceIso: string): Array<{ at: string }>;
  activitySnapshot(sinceIso: string): Promise<{ commits: Array<{ at: string }>; dirty: boolean }>;
}

const INIT_COMMIT_MESSAGE = 'Initialize memory repository';
const GITATTRIBUTES = '* text=auto eol=lf\n';
const FIELD_SEPARATOR = '\u001f';
const RECORD_SEPARATOR = '\u001e';

function run(root: string, args: string[]): string {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
}

function activityArgs(sinceIso: string): string[] {
  return [
    'log',
    '--exclude=refs/botharness/recovery/*',
    '--exclude=refs/stash',
    '--all',
    '--since-as-filter=' + sinceIso,
    '--pretty=format:%cI',
  ];
}

function readActivity(root: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'git',
      ['--no-optional-locks', '-c', 'core.fsmonitor=false', ...args],
      { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 2000 },
      (error, stdout) => (error === null ? resolve(stdout) : reject(error)),
    );
  });
}

function revParse(root: string): string {
  try {
    return run(root, ['rev-parse', 'HEAD']).trim();
  } catch {
    return '';
  }
}

function commitIfChanges(root: string, message: string): string {
  run(root, ['add', '-A']);
  const status = run(root, ['status', '--porcelain']);
  if (status.trim().length === 0) return revParse(root);
  run(root, ['commit', '--no-gpg-sign', '-m', message]);
  return revParse(root);
}

function ensureIdentity(root: string, key: 'user.name' | 'user.email', value: string): void {
  try {
    if (run(root, ['config', '--local', '--get', key]).trim().length > 0) return;
  } catch {}
  run(root, ['config', key, value]);
}

export function initializeMemoryGit(root: string): { created: boolean } {
  const created = !existsSync(join(root, '.git'));
  if (created) {
    run(root, ['init', '-b', 'main']);
  }
  ensureIdentity(root, 'user.name', 'BotHarness');
  ensureIdentity(root, 'user.email', 'bot@botharness.local');
  run(root, ['config', 'commit.gpgsign', 'false']);
  run(root, ['config', 'core.autocrlf', 'false']);
  const attributes = join(root, '.gitattributes');
  if (revParse(root) === '' && !existsSync(attributes)) {
    writeFileSync(attributes, GITATTRIBUTES, 'utf8');
  }
  return { created };
}

export function commitMemoryRepositorySeed(root: string): string {
  return commitIfChanges(root, INIT_COMMIT_MESSAGE);
}

export function createMemoryGit(root: string): MemoryGit {
  return {
    status() {
      return run(root, ['status', '--porcelain'])
        .split('\n')
        .map((line) => line.slice(3).trim())
        .filter((line) => line.length > 0);
    },
    diff() {
      return run(root, ['diff', 'HEAD']);
    },
    head() {
      return revParse(root);
    },
    commit(message) {
      return commitIfChanges(root, message);
    },
    log(limit = 10) {
      if (limit <= 0) return [];
      let output: string;
      try {
        output = run(root, [
          'log',
          '-n',
          String(limit),
          `--format=%H${FIELD_SEPARATOR}%cI${FIELD_SEPARATOR}%B${RECORD_SEPARATOR}`,
        ]);
      } catch {
        return [];
      }
      const commits: MemoryCommit[] = [];
      for (const record of output.split(RECORD_SEPARATOR)) {
        const trimmed = record.trim();
        if (trimmed.length === 0) continue;
        const [sha = '', date = '', ...rest] = trimmed.split(FIELD_SEPARATOR);
        commits.push({ sha, date, message: rest.join(FIELD_SEPARATOR).trim() });
      }
      return commits;
    },
    async activitySnapshot(sinceIso) {
      const commits = (await readActivity(root, activityArgs(sinceIso)))
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((at) => ({ at }));
      const dirty =
        (
          await readActivity(root, [
            'status',
            '--porcelain',
            '--untracked-files=all',
            '--ignore-submodules=none',
          ])
        ).trim().length > 0;
      return { commits, dirty };
    },
    activitySince(sinceIso) {
      try {
        return run(root, [
          '--no-optional-locks',
          '-c',
          'core.fsmonitor=false',
          ...activityArgs(sinceIso),
        ])
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line.length > 0)
          .map((at) => ({ at }));
      } catch {
        return [];
      }
    },
  };
}
