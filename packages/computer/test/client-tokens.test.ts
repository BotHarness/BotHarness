import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { parse } from '@babel/parser';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  fileURLToPath(new URL('../src/client/index.tsx', import.meta.url)),
  'utf8',
);

const syntax = parse(source, { sourceType: 'module', plugins: ['typescript', 'jsx'] });
const LITERAL_COLOUR = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/;

function colourBlock(name: string): { start: number; end: number } {
  const declarations = syntax.program.body.filter(
    (node) =>
      node.type === 'VariableDeclaration' &&
      node.declarations.some(
        (declaration) => declaration.id.type === 'Identifier' && declaration.id.name === name,
      ),
  );
  if (declarations.length !== 1) throw new Error(`index.tsx must declare ${name} exactly once`);
  const declaration = declarations[0]!;
  if (declaration.start == null || declaration.end == null) {
    throw new Error(`index.tsx has no source span for ${name}`);
  }
  return { start: declaration.start, end: declaration.end };
}

function themedChrome(): string {
  return [colourBlock('BH'), colourBlock('VIDEO_SURFACE')]
    .sort((left, right) => right.start - left.start)
    .reduce((text, block) => text.slice(0, block.start) + text.slice(block.end), source);
}

describe('computer client entry colours', () => {
  it('declares each colour block exactly once', () => {
    expect(colourBlock('BH').end).toBeGreaterThan(colourBlock('BH').start);
    expect(colourBlock('VIDEO_SURFACE').end).toBeGreaterThan(colourBlock('VIDEO_SURFACE').start);
  });

  it('reads every themed colour through the alias table, never inline', () => {
    expect(themedChrome()).not.toContain('--dsw-');
  });

  it('keeps literal colours inside the two colour blocks', () => {
    expect(themedChrome()).not.toMatch(LITERAL_COLOUR);
  });

  it('keeps the legacy --dsh-* colour vars out of the entry card', () => {
    expect(themedChrome()).not.toMatch(/var\(\s*--dsh-/);
  });
});
