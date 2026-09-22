import { readFileSync, readdirSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { createMemoryStore } from '../src/index.js';
import { FIXED_NOW, createTempRoot } from './helpers.js';

describe('memory store write', () => {
  it('writes a topic file with front-matter', async () => {
    const root = createTempRoot();
    const store = createMemoryStore({ memoryDir: root, now: FIXED_NOW });

    const result = await store.write({
      path: 'customers/acme.md',
      body: '# Acme\n\nRenewal due.',
      summary: 'Acme renewal',
      sources: ['feishu:group-42'],
    });

    expect(result).toMatchObject({
      ok: true,
      path: 'customers/acme.md',
      summary: 'Acme renewal',
      updatedAt: '2026-09-17T00:00:00.000Z',
    });
    const raw = readFileSync(join(root, 'customers/acme.md'), 'utf8');
    expect(raw.startsWith('---\n')).toBe(true);
    expect(raw).toContain('summary: Acme renewal');
    expect(raw).toContain('sources:');
    expect(raw.endsWith('---\n# Acme\n\nRenewal due.\n')).toBe(true);
  });

  it('round-trips reads and reports degraded files with warnings', async () => {
    const root = createTempRoot();
    const store = createMemoryStore({ memoryDir: root, now: FIXED_NOW });
    await store.write({ path: 'topics/a.md', body: 'Fact one.\n', summary: 'First fact' });

    const entry = store.read('topics/a.md');
    expect(entry).toMatchObject({
      path: 'topics/a.md',
      summary: 'First fact',
      updatedAt: '2026-09-17T00:00:00.000Z',
      sources: [],
    });
    expect(entry?.body).toBe('Fact one.\n');
    expect(entry?.warnings).toEqual([]);
    expect(store.read('topics/missing.md')).toBeUndefined();

    writeFileSync(join(root, 'topics/raw.md'), '# Raw notes\n\nhandwritten\n');
    const raw = store.read('topics/raw.md');
    expect(raw?.summary).toBe('# Raw notes');
    expect(raw?.updatedAt).toBe(statSync(join(root, 'topics/raw.md')).mtime.toISOString());
    expect(raw?.warnings).toContain('missing front-matter');
  });

  it('rejects writes without a summary', async () => {
    const store = createMemoryStore({ memoryDir: createTempRoot(), now: FIXED_NOW });
    await expect(store.write({ path: 'topics/a.md', body: 'x', summary: '   ' })).rejects.toThrow(
      /summary/,
    );
  });

  it('ignores legacy visibility front-matter and keeps every file visible', async () => {
    const root = createTempRoot();
    writeFileSync(
      join(root, 'legacy.md'),
      [
        '---',
        'summary: Legacy note',
        'updated_at: 2026-09-01T00:00:00.000Z',
        'sources: []',
        'visibility: private',
        'owner: alice',
        '---',
        'legacy fact',
        '',
      ].join('\n'),
    );
    const store = createMemoryStore({ memoryDir: root, now: FIXED_NOW });

    const entry = store.read('legacy.md');
    expect(entry?.summary).toBe('Legacy note');
    expect(entry?.warnings).toEqual([]);
    expect(await store.search('legacy')).toEqual([
      { path: 'legacy.md', line: 8, excerpt: 'legacy fact' },
    ]);

    await store.write({ path: 'topics/new.md', body: 'new\n', summary: 'New note' });
    expect(store.read('topics/new.md')?.summary).toBe('New note');
  });

  it('refuses to write MEMORY.md and PERSONA.md', async () => {
    const root = createTempRoot();
    const store = createMemoryStore({ memoryDir: root, now: FIXED_NOW });

    await expect(store.write({ path: 'MEMORY.md', body: 'x', summary: 'hack' })).rejects.toThrow(
      /MEMORY\.md/,
    );
    await expect(store.write({ path: 'PERSONA.md', body: 'x', summary: 'hack' })).rejects.toThrow(
      /PERSONA\.md/,
    );
    await expect(store.write({ path: 'memory.MD', body: 'x', summary: 'hack' })).rejects.toThrow(
      /MEMORY\.md/i,
    );
    expect(readdirSync(join(root, '.git')).length).toBeGreaterThan(0);
  });
});

describe('memory store jail', () => {
  it('rejects absolute paths, dot-dot segments and .git paths', async () => {
    const root = createTempRoot();
    const store = createMemoryStore({ memoryDir: root, now: FIXED_NOW });
    const input = { body: 'x', summary: 's' };

    await expect(store.write({ ...input, path: '/etc/passwd' })).rejects.toThrow();
    await expect(store.write({ ...input, path: '../escape.md' })).rejects.toThrow();
    await expect(store.write({ ...input, path: 'a/../../escape.md' })).rejects.toThrow();
    await expect(store.write({ ...input, path: '.git/hooks/pre-commit' })).rejects.toThrow();
    await expect(store.write({ ...input, path: '.gitattributes' })).rejects.toThrow(/reserved/);
    await expect(store.write({ ...input, path: '.git/config' })).rejects.toThrow(/reserved/);
    expect(() => store.read('../outside.md')).toThrow();
    expect(() => store.read('.git/config')).toThrow();
  });

  it('restricts writes to .md files outside dot-directories', async () => {
    const root = createTempRoot();
    const store = createMemoryStore({ memoryDir: root, now: FIXED_NOW });
    const input = { body: 'x', summary: 's' };

    await expect(store.write({ ...input, path: 'notes.txt' })).rejects.toThrow(/\.md/);
    await expect(store.write({ ...input, path: 'archive/notes.txt' })).rejects.toThrow(/\.md/);
    await expect(store.write({ ...input, path: 'archive/.hidden/notes.md' })).rejects.toThrow(
      /dot-director/i,
    );

    await expect(store.write({ ...input, path: 'topics/nested.md' })).resolves.toMatchObject({
      ok: true,
      path: 'topics/nested.md',
    });
    expect(store.read('topics/nested.md')?.body).toBe('x\n');
  });

  it('rejects paths that escape through a symlinked directory', async () => {
    const root = createTempRoot();
    const outside = createTempRoot('botharness-outside-');
    symlinkSync(outside, join(root, 'portal'), 'dir');
    const store = createMemoryStore({ memoryDir: root, now: FIXED_NOW });

    await expect(store.write({ path: 'portal/evil.md', body: 'x', summary: 's' })).rejects.toThrow(
      /escape|outside|path/i,
    );
  });
});

describe('memory store persona', () => {
  it('returns the persona body and refuses writes', async () => {
    const root = createTempRoot();
    const store = createMemoryStore({ memoryDir: root, now: FIXED_NOW });
    expect(store.persona()).toBeUndefined();

    writeFileSync(join(root, 'PERSONA.md'), '# Persona\n\nBe kind.\n');
    expect(store.persona()).toBe('# Persona\n\nBe kind.\n');

    await expect(
      store.write({ path: 'PERSONA.md', body: 'evil', summary: 'takeover' }),
    ).rejects.toThrow(/PERSONA\.md/);
  });
});

describe('memory store serialization and atomicity', () => {
  it('serializes concurrent writes and leaves no temp files behind', async () => {
    const root = createTempRoot();
    const store = createMemoryStore({ memoryDir: root, now: FIXED_NOW });

    const [first, second] = await Promise.all([
      store.write({ path: 'first.md', body: 'first body\n', summary: 'First write' }),
      store.write({ path: 'second.md', body: 'second body\n', summary: 'Second write' }),
    ]);

    expect(first).toMatchObject({ ok: true, path: 'first.md' });
    expect(second).toMatchObject({ ok: true, path: 'second.md' });
    const leftovers = readdirSync(root).filter((name) => name.includes('.tmp'));
    expect(leftovers).toEqual([]);
    expect(store.read('first.md')?.body).toBe('first body\n');
    expect(store.read('second.md')?.body).toBe('second body\n');
    const history = store.history();
    expect(history.map((commit) => commit.message.split('\n')[0]).slice(0, 2)).toEqual([
      'Second write',
      'First write',
    ]);
  });

  it('keeps the queue alive after a rejected write', async () => {
    const root = createTempRoot();
    const store = createMemoryStore({ memoryDir: root, now: FIXED_NOW });

    await expect(store.write({ path: 'bad.md', body: 'x', summary: '' })).rejects.toThrow();
    await store.write({ path: 'good.md', body: 'ok\n', summary: 'Recovered' });

    expect(store.read('good.md')?.body).toBe('ok\n');
    expect(store.history()[0]?.message.split('\n')[0]).toBe('Recovered');
  });
});

describe('memory store search', () => {
  it('finds case-insensitive substrings with path, line and trimmed excerpt', async () => {
    const root = createTempRoot();
    const store = createMemoryStore({ memoryDir: root, now: FIXED_NOW });
    await store.write({
      path: 'topics/a.md',
      body: 'First line\nACME renewal in Q4\n',
      summary: 'A',
    });
    await store.write({
      path: 'customers/acme.md',
      body: 'No match here\nacme again\n',
      summary: 'B',
    });

    const hits = await store.search('acme');

    expect(hits).toEqual([
      { path: 'customers/acme.md', line: 7, excerpt: 'acme again' },
      { path: 'topics/a.md', line: 7, excerpt: 'ACME renewal in Q4' },
    ]);
  });

  it('searches bodies only, ignoring front-matter and the reserved files', async () => {
    const root = createTempRoot();
    const store = createMemoryStore({ memoryDir: root, now: FIXED_NOW });
    await store.write({ path: 'a.md', body: 'plain body\n', summary: 'Zebra summary' });
    writeFileSync(join(root, 'PERSONA.md'), 'zebra persona\n');
    writeFileSync(join(root, 'MEMORY.md'), 'zebra index\n');

    expect(await store.search('zebra')).toEqual([]);
    expect(await store.search('plain')).toEqual([{ path: 'a.md', line: 6, excerpt: 'plain body' }]);
  });

  it('returns nothing for blank queries and truncates long excerpts', async () => {
    const root = createTempRoot();
    const store = createMemoryStore({ memoryDir: root, now: FIXED_NOW });
    const longLine = `${'x'.repeat(400)} needle`;
    await store.write({ path: 'long.md', body: `${longLine}\n`, summary: 'Long' });

    expect(await store.search('   ')).toEqual([]);
    const hits = await store.search('needle');
    expect(hits).toHaveLength(1);
    expect(hits[0]?.excerpt.endsWith('...')).toBe(true);
    expect(hits[0]?.excerpt.length).toBe(243);
  });
});
