import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const source = readFileSync(
  fileURLToPath(new URL('../src/client/index.tsx', import.meta.url)),
  'utf8',
);

const VIDEO_START = '/* @bh-video-surface:start';
const VIDEO_END = '/* @bh-video-surface:end */';
const LITERAL_COLOUR = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/;

function stripDelimitedVideoBlock(text: string): string {
  const start = text.indexOf(VIDEO_START);
  const end = text.indexOf(VIDEO_END);
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('index.tsx must delimit its intentional video-surface colours');
  }
  return text.slice(0, start) + text.slice(end + VIDEO_END.length);
}

describe('computer client entry colours', () => {
  it('declares the video-surface block exactly once', () => {
    const starts = source.split(VIDEO_START).length - 1;
    const ends = source.split(VIDEO_END).length - 1;
    expect(starts).toBe(1);
    expect(ends).toBe(1);
  });

  it('uses only --dsw tokens outside the intentional video-surface block', () => {
    // Every themed colour must read a --dsw token (a var() may carry a
    // fallback); once those are removed, no literal colour may remain.
    const withoutVideo = stripDelimitedVideoBlock(source);
    const withoutTokens = withoutVideo.replace(/var\(\s*--dsw-[^)]*\)/g, '');
    expect(withoutTokens).not.toMatch(LITERAL_COLOUR);
  });

  it('keeps the legacy --dsh-* colour vars out of the entry card', () => {
    const withoutVideo = stripDelimitedVideoBlock(source);
    expect(withoutVideo).not.toMatch(/var\(\s*--dsh-/);
  });
});
