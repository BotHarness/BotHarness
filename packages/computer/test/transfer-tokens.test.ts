import { describe, expect, it } from 'vitest';

import { createTransferTokens } from '../src/transfer-tokens.js';

describe('transfer tokens', () => {
  it('mints single-use download grants', () => {
    const tokens = createTransferTokens();
    const token = tokens.mint('/exports/a.tar', 'download');
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(0);
    expect(tokens.consume(token, 'download')).toBe('/exports/a.tar');
    expect(tokens.consume(token, 'download')).toBeUndefined();
  });

  it('rejects unknown tokens and burns kind mismatches closed', () => {
    const tokens = createTransferTokens();
    expect(tokens.consume('nope', 'download')).toBeUndefined();
    const token = tokens.mint('/exports/a.tar', 'download');
    expect(tokens.consume(token, 'upload')).toBeUndefined();
    expect(tokens.consume(token, 'download')).toBeUndefined();
  });

  it('expires grants', () => {
    let now = 1000;
    const tokens = createTransferTokens({ now: () => now, ttlMs: 60_000 });
    const fresh = tokens.mint('/x', 'upload');
    now += 59_000;
    expect(tokens.consume(fresh, 'upload')).toBe('/x');
    const stale = tokens.mint('/y', 'upload');
    now += 61_000;
    expect(tokens.consume(stale, 'upload')).toBeUndefined();
  });

  it('caps stored grants by evicting the oldest', () => {
    let counter = 0;
    const tokens = createTransferTokens({ max: 3, uuid: () => `t${counter++}` });
    tokens.mint('/a', 'download');
    tokens.mint('/b', 'download');
    tokens.mint('/c', 'download');
    tokens.mint('/d', 'download');
    expect(tokens.consume('t0', 'download')).toBeUndefined();
    expect(tokens.consume('t3', 'download')).toBe('/d');
  });
});
