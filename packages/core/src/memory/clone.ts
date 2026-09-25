import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const MAX_GIT_URL_LENGTH = 2_048;
export const MEMORY_CLONE_TIMEOUT_MS = 120_000;

export type MemoryCloneFailureCode =
  | 'invalid-git-url'
  | 'git-not-found'
  | 'git-clone-failed'
  | 'git-clone-timeout';

export type MemoryCloneResult = { ok: true } | { ok: false; code: MemoryCloneFailureCode };

export function parseMemoryGitUrl(raw: string): string | undefined {
  if (/[\u0000-\u001f\u007f]/u.test(raw)) return undefined;
  const value = raw.trim();
  if (
    value.length === 0 ||
    value.length > MAX_GIT_URL_LENGTH ||
    /[\u0000-\u0020\u007f]/u.test(value)
  ) {
    return undefined;
  }

  if (value.startsWith('https://') || value.startsWith('ssh://')) {
    try {
      const url = new URL(value);
      if (!url.hostname || !url.pathname || url.pathname === '/' || url.search || url.hash) {
        return undefined;
      }
      if (url.password || (url.protocol === 'https:' && url.username)) return undefined;
      return value;
    } catch {
      return undefined;
    }
  }

  // Git's scp-style SSH spelling, e.g. git@github.com:owner/repo.git.
  return /^[A-Za-z_][A-Za-z0-9_.-]*@[A-Za-z0-9.-]+:[A-Za-z0-9._~/-]+$/u.test(value)
    ? value
    : undefined;
}

/** Clone into a new, empty staging directory. The Registry owns adoption and cleanup. */
export async function cloneMemoryRepository(input: {
  url: string;
  destination: string;
  timeoutMs?: number;
}): Promise<MemoryCloneResult> {
  const url = parseMemoryGitUrl(input.url);
  if (url === undefined) return { ok: false, code: 'invalid-git-url' };

  try {
    await execFileAsync('git', ['--version'], { timeout: 5_000, windowsHide: true });
  } catch (error) {
    return {
      ok: false,
      code:
        (error as NodeJS.ErrnoException).code === 'ENOENT' ? 'git-not-found' : 'git-clone-failed',
    };
  }

  try {
    await execFileAsync('git', ['clone', '--quiet', '--', url, input.destination], {
      timeout: input.timeoutMs ?? MEMORY_CLONE_TIMEOUT_MS,
      maxBuffer: 512 * 1_024,
      windowsHide: true,
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: '0',
        GIT_SSH_COMMAND: process.env['GIT_SSH_COMMAND'] ?? 'ssh -oBatchMode=yes',
      },
    });
    return { ok: true };
  } catch (error) {
    const failure = error as NodeJS.ErrnoException & { killed?: boolean };
    return {
      ok: false,
      code:
        failure.code === 'ENOENT'
          ? 'git-not-found'
          : failure.killed || failure.code === 'ETIMEDOUT'
            ? 'git-clone-timeout'
            : 'git-clone-failed',
    };
  }
}
