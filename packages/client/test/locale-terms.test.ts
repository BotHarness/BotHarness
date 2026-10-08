import { expect, it } from 'vitest';

import { en, zh } from '../src/client/locale.js';

function offending(table: Record<string, string>, pattern: RegExp): string[] {
  return Object.entries(table)
    .filter(([, value]) => pattern.test(value))
    .map(([key, value]) => `${key}: ${value}`);
}

it('keeps internal terms out of Chinese UI copy', () => {
  expect(
    offending(zh, /Human|PersonaBot|Source Event|Channel Bridge|Attention|频道连接器/u),
  ).toEqual([]);
});

it('keeps internal terms out of English UI copy', () => {
  expect(offending(en, /PersonaBot|Source Event|Channel Bridge|Attention|\bHuman\b/u)).toEqual([]);
});
