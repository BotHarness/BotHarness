import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  MEMORY_TREE_LIMIT,
  createMemoryStore,
  formatMemoryTree,
  memoryTreeDay,
  memoryTreeSignature,
} from '../src/index.js';
import { FIXED_NOW, createTempRoot } from './helpers.js';

describe('memory tree', () => {
  it('renders dates only and signs only what changes the rendered tree', () => {
    const entry = (summary: string, updatedAt: string) => ({
      kind: 'file' as const,
      path: 'facts/acme.md',
      summary,
      updatedAt,
    });

    expect(memoryTreeDay('2026-09-17T00:00:00.000Z')).toBe('2026-09-17');
    expect(memoryTreeDay('not-a-date')).toBe('not-a-date');
    expect(formatMemoryTree([entry('Acme', '2026-09-17T08:00:00.000Z')])).toBe(
      'facts/acme.md — Acme (updated 2026-09-17)',
    );
    expect(memoryTreeSignature([entry('Acme', '2026-09-17T08:00:00.000Z')])).toBe(
      memoryTreeSignature([entry('Acme', '2026-09-17T23:59:59.000Z')]),
    );
    expect(memoryTreeSignature([entry('Acme', '2026-09-18T00:00:00.000Z')])).not.toBe(
      memoryTreeSignature([entry('Acme', '2026-09-17T00:00:00.000Z')]),
    );
    expect(memoryTreeSignature([entry('Other', '2026-09-17T00:00:00.000Z')])).not.toBe(
      memoryTreeSignature([entry('Acme', '2026-09-17T00:00:00.000Z')]),
    );
  });

  it('lists sorted file entries with front-matter summaries and degrades raw files', async () => {
    const root = createTempRoot();
    const store = createMemoryStore({ memoryDir: root, now: FIXED_NOW });
    await store.write({ path: 'zeta.md', body: 'z\n', summary: 'Zeta note' });
    await store.write({ path: 'customers/acme.md', body: 'a\n', summary: 'Acme profile' });
    writeFileSync(join(root, 'alpha.md'), 'Handwritten alpha\n\nmore\n');
    writeFileSync(join(root, 'PERSONA.md'), '# Persona\n');
    writeFileSync(join(root, 'MEMORY.md'), '# ignored\n');

    const entries = store.tree();

    expect(entries.map((entry) => (entry.kind === 'overflow' ? '' : entry.path))).toEqual([
      'alpha.md',
      'customers/acme.md',
      'zeta.md',
    ]);
    expect(entries[0]).toMatchObject({ kind: 'file', summary: 'Handwritten alpha' });
    expect(entries[1]).toMatchObject({
      kind: 'file',
      summary: 'Acme profile',
      updatedAt: '2026-09-17T00:00:00.000Z',
    });
  });

  it('folds oversized directories into one counted entry instead of failing', async () => {
    const root = createTempRoot();
    mkdirSync(join(root, 'bulk'), { recursive: true });
    for (let index = 0; index < MEMORY_TREE_LIMIT + 5; index += 1) {
      writeFileSync(
        join(root, 'bulk', `file-${String(index).padStart(4, '0')}.md`),
        `Fact ${index}\n`,
      );
    }
    const store = createMemoryStore({ memoryDir: root, now: FIXED_NOW });
    await store.write({ path: 'root.md', body: 'root\n', summary: 'Root note' });

    const entries = store.tree();

    expect(entries.length).toBeLessThanOrEqual(MEMORY_TREE_LIMIT);
    expect(entries).toContainEqual({ kind: 'folder', path: 'bulk/', count: MEMORY_TREE_LIMIT + 5 });
    expect(entries.some((entry) => entry.kind === 'file' && entry.path.startsWith('bulk/'))).toBe(
      false,
    );
    expect(entries.some((entry) => entry.kind === 'overflow')).toBe(false);
    expect(entries).toContainEqual(
      expect.objectContaining({ kind: 'file', path: 'root.md', summary: 'Root note' }),
    );
    expect(formatMemoryTree(entries)).toContain(`bulk/ (${MEMORY_TREE_LIMIT + 5} files)`);
  });

  it('marks overflow when root files alone exceed the limit instead of silently truncating', () => {
    const root = createTempRoot();
    for (let index = 0; index < MEMORY_TREE_LIMIT + 5; index += 1) {
      writeFileSync(join(root, `file-${String(index).padStart(4, '0')}.md`), `Fact ${index}\n`);
    }
    const store = createMemoryStore({ memoryDir: root, now: FIXED_NOW });

    const entries = store.tree();

    expect(entries.length).toBe(MEMORY_TREE_LIMIT);
    expect(entries.at(-1)).toEqual({ kind: 'overflow', count: 6 });
    expect(entries.slice(0, -1).every((entry) => entry.kind === 'file')).toBe(true);
    expect(formatMemoryTree(entries)).toContain('6 more files not shown');
  });
});

describe('memory search', () => {
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
