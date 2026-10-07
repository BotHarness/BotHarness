import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { cloneMemoryRepository, httpsUrlForSsh, parseMemoryGitUrl } from '../src/memory/clone.js';

describe('Memory Git URL validation', () => {
  it('accepts normal HTTPS and SSH repository forms', () => {
    expect(parseMemoryGitUrl('https://github.com/owner/repo.git')).toBe(
      'https://github.com/owner/repo.git',
    );
    expect(parseMemoryGitUrl('ssh://git@github.com/owner/repo.git')).toBe(
      'ssh://git@github.com/owner/repo.git',
    );
    expect(parseMemoryGitUrl('git@github.com:owner/repo.git')).toBe(
      'git@github.com:owner/repo.git',
    );
  });

  it('reports missing Host Git before trying to create a Bot', async () => {
    const root = mkdtempSync(join(tmpdir(), 'botharness-no-git-'));
    const originalPath = process.env['PATH'];
    try {
      process.env['PATH'] = join(root, 'absent');
      expect(
        await cloneMemoryRepository({
          url: 'https://github.com/owner/repo.git',
          destination: join(root, 'memory'),
        }),
      ).toEqual({ ok: false, code: 'git-not-found' });
    } finally {
      if (originalPath === undefined) delete process.env['PATH'];
      else process.env['PATH'] = originalPath;
      rmSync(root, { recursive: true, force: true });
    }
  });
  it('rejects local paths, credential-bearing URLs, and shell-like input', () => {
    for (const url of [
      '/tmp/private',
      'file:///tmp/private',
      'https://user:secret@github.com/owner/repo.git',
      'https://github.com/owner/repo.git?token=secret',
      'git@github.com:owner/repo.git;echo secret',
      'https://github.com/owner/repo.git\n',
    ]) {
      expect(parseMemoryGitUrl(url)).toBeUndefined();
    }
  });
});

describe('SSH import fallback to HTTPS', () => {
  it('maps standard SSH addresses to the matching HTTPS address', () => {
    expect(httpsUrlForSsh('git@github.com:owner/repo.git')).toBe(
      'https://github.com/owner/repo.git',
    );
    expect(httpsUrlForSsh('git@gitee.com:group/sub/repo')).toBe(
      'https://gitee.com/group/sub/repo.git',
    );
    expect(httpsUrlForSsh('ssh://git@github.com/owner/repo.git')).toBe(
      'https://github.com/owner/repo.git',
    );
    expect(httpsUrlForSsh('ssh://github.com/owner/repo/')).toBe(
      'https://github.com/owner/repo.git',
    );
  });

  it('leaves custom ports, other users, HTTPS and single-segment paths alone', () => {
    for (const url of [
      'ssh://git@git.example.com:2222/owner/repo.git',
      'ssh://alice@git.example.com/owner/repo.git',
      'alice@git.example.com:owner/repo.git',
      'git@github.com:repo.git',
      'https://github.com/owner/repo.git',
    ]) {
      expect(httpsUrlForSsh(url)).toBeUndefined();
    }
  });

  describe.skipIf(process.platform === 'win32')('with a Host Git that cannot use SSH', () => {
    function fakeGit(root: string, httpsWorks: boolean, sshError: string): string {
      const bin = join(root, 'bin');
      mkdirSync(bin);
      const log = join(root, 'calls.log');
      writeFileSync(
        join(bin, 'git'),
        [
          '#!/bin/sh',
          'if [ "$1" = "--version" ]; then echo "git version 2.47.1"; exit 0; fi',
          `echo "$4" >> '${log}'`,
          'case "$4" in',
          `  https://*) ${httpsWorks ? 'mkdir -p "$5/.git"; exit 0' : 'exit 128'} ;;`,
          `  *) printf '%s\\n' '${sshError}' 'fatal: Could not read from remote repository.' >&2; exit 128 ;;`,
          'esac',
          '',
        ].join('\n'),
      );
      chmodSync(join(bin, 'git'), 0o755);
      return bin;
    }

    async function cloneWith(
      httpsWorks: boolean,
      url: string,
      sshError = 'git@github.com: Permission denied (publickey).',
    ) {
      const root = mkdtempSync(join(tmpdir(), 'botharness-ssh-fallback-'));
      const originalPath = process.env['PATH'];
      try {
        process.env['PATH'] = `${fakeGit(root, httpsWorks, sshError)}:${originalPath ?? ''}`;
        const destination = join(root, 'memory');
        mkdirSync(destination);
        const result = await cloneMemoryRepository({ url, destination });
        const calls = readFileSync(join(root, 'calls.log'), 'utf8').trim().split('\n');
        return { result, calls, cloned: existsSync(join(destination, '.git')) };
      } finally {
        if (originalPath === undefined) delete process.env['PATH'];
        else process.env['PATH'] = originalPath;
        rmSync(root, { recursive: true, force: true });
      }
    }

    it('names an unreachable SSH port as the reason for the switch', async () => {
      const { result } = await cloneWith(
        true,
        'git@github.com:owner/repo.git',
        'ssh: connect to host github.com port 22: Connection timed out',
      );
      expect(result).toMatchObject({
        httpsFallback: {
          reason: 'unreachable',
          detail: 'ssh: connect to host github.com port 22: Connection timed out',
        },
      });
    });

    it('names a missing SSH client as the reason for the switch', async () => {
      const { result } = await cloneWith(
        true,
        'git@github.com:owner/repo.git',
        'ssh -oBatchMode=yes: 1: ssh: not found',
      );
      expect(result).toMatchObject({ httpsFallback: { reason: 'ssh-missing' } });
    });

    it('retries once over HTTPS and reports the switch', async () => {
      expect(await cloneWith(true, 'git@github.com:owner/repo.git')).toEqual({
        result: {
          ok: true,
          httpsFallback: {
            from: 'git@github.com:owner/repo.git',
            to: 'https://github.com/owner/repo.git',
            reason: 'auth',
            detail: 'git@github.com: Permission denied (publickey).',
          },
        },
        calls: ['git@github.com:owner/repo.git', 'https://github.com/owner/repo.git'],
        cloned: true,
      });
    });

    it('reports the original SSH failure when HTTPS fails too', async () => {
      expect(await cloneWith(false, 'git@github.com:owner/private.git')).toMatchObject({
        result: { ok: false, code: 'git-clone-failed' },
        calls: ['git@github.com:owner/private.git', 'https://github.com/owner/private.git'],
      });
    });

    it('does not retry an address it cannot map', async () => {
      expect(await cloneWith(true, 'ssh://git@git.example.com:2222/owner/repo.git')).toMatchObject({
        result: { ok: false, code: 'git-clone-failed' },
        calls: ['ssh://git@git.example.com:2222/owner/repo.git'],
      });
    });
  });
});
