import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { parseRipgrepOutput, searchMemoryFiles } from '../src/memory/search.js';
import { createTempRoot } from './helpers.js';

describe('parseRipgrepOutput', () => {
  it('keeps hits when ripgrep prints a single-file path prefix', () => {
    const output = 'topics/a.md:3:alpha fact\ntopics/a.md:9:alpha again\n';

    expect(parseRipgrepOutput(output)).toEqual([
      { path: 'topics/a.md', line: 3, excerpt: 'alpha fact' },
      { path: 'topics/a.md', line: 9, excerpt: 'alpha again' },
    ]);
  });

  it('truncates long excerpts and skips malformed lines', () => {
    const output = [`a.md:1:${'x'.repeat(400)} needle`, 'no colon here', ''].join('\n');

    const hits = parseRipgrepOutput(output);

    expect(hits).toHaveLength(1);
    expect(hits[0]?.excerpt.endsWith('...')).toBe(true);
    expect(hits[0]?.excerpt.length).toBe(243);
  });
});

describe('searchMemoryFiles', () => {
  it('finds a hit when searching a single file', async () => {
    const root = createTempRoot();
    writeFileSync(join(root, 'only.md'), '# Only\n\nsingle file fact\n');

    const hits = await searchMemoryFiles(root, [{ path: 'only.md', skipLines: 0 }], 'fact');

    expect(hits).toEqual([{ path: 'only.md', line: 3, excerpt: 'single file fact' }]);
  });
});
