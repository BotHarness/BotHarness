import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const source = readFileSync(
  fileURLToPath(new URL('../src/client/styles.ts', import.meta.url)),
  'utf8',
);

const ALIAS_START = '/* @bh-brand-aliases:start';
const ALIAS_END = '/* @bh-brand-aliases:end */';
const LITERAL_COLOUR = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/;

function aliasBounds(): { start: number; end: number } {
  const start = source.indexOf(ALIAS_START);
  const end = source.indexOf(ALIAS_END);
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('styles.ts must delimit its brand alias block');
  }
  return { start, end };
}

describe('client styles', () => {
  it('contains no literal colours outside the brand alias block', () => {
    const { start, end } = aliasBounds();
    const outside = `${source.slice(0, start)}${source.slice(end)}`;
    expect(outside).not.toMatch(LITERAL_COLOUR);
  });

  it('keeps the brand alias block to at most three token entries', () => {
    const { start, end } = aliasBounds();
    const block = source.slice(start, end);
    const entries = block.match(/--bh-[a-z-]+\s*:/g) ?? [];
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.length).toBeLessThanOrEqual(3);
  });
});
