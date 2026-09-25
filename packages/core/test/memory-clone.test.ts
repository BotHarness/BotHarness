import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { cloneMemoryRepository, parseMemoryGitUrl } from '../src/memory/clone.js';

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
