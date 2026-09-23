import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const source = readFileSync(
  fileURLToPath(new URL('../src/client/index.tsx', import.meta.url)),
  'utf8',
);

const VIDEO_START = '/* @bh-video-surface:start';
const VIDEO_END = '/* @bh-video-surface:end */';
const ALIAS_START = '/* @bh-computer-aliases:start';
const ALIAS_END = '/* @bh-computer-aliases:end */';
const LITERAL_COLOUR = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/;

function stripDelimitedBlock(text: string, start: string, end: string, name: string): string {
  const startAt = text.indexOf(start);
  const endAt = text.indexOf(end);
  if (startAt === -1 || endAt === -1 || endAt <= startAt) {
    throw new Error(`index.tsx must delimit its ${name}`);
  }
  return text.slice(0, startAt) + text.slice(endAt + end.length);
}

function themedChrome(text: string): string {
  return stripDelimitedBlock(
    stripDelimitedVideoBlock(text),
    ALIAS_START,
    ALIAS_END,
    'computer alias table',
  );
}

function stripDelimitedVideoBlock(text: string): string {
  return stripDelimitedBlock(text, VIDEO_START, VIDEO_END, 'intentional video-surface colours');
}

function countOccurrences(text: string, marker: string): number {
  return text.split(marker).length - 1;
}

describe('computer client entry colours', () => {
  it('declares each delimited colour block exactly once', () => {
    expect(countOccurrences(source, VIDEO_START)).toBe(1);
    expect(countOccurrences(source, VIDEO_END)).toBe(1);
    expect(countOccurrences(source, ALIAS_START)).toBe(1);
    expect(countOccurrences(source, ALIAS_END)).toBe(1);
  });

  it('reads every themed colour through the alias table, never inline', () => {
    // Components must use BH.* names; the alias table is the only place a
    // --dsw token (or a fallback) may appear in component code.
    expect(themedChrome(source)).not.toContain('--dsw-');
  });

  it('keeps literal colours inside the two delimited blocks', () => {
    expect(themedChrome(source)).not.toMatch(LITERAL_COLOUR);
  });

  it('keeps the legacy --dsh-* colour vars out of the entry card', () => {
    expect(themedChrome(source)).not.toMatch(/var\(\s*--dsh-/);
  });
});
