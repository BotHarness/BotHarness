import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { parse } from '@babel/parser';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  fileURLToPath(new URL('../../client/src/client/remote-viewer/tokens.ts', import.meta.url)),
  'utf8',
);

const syntax = parse(source, { sourceType: 'module', plugins: ['typescript', 'jsx'] });
const LITERAL_COLOUR = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/;

function colourBlock(name: string): { start: number; end: number } {
  const declarations = syntax.program.body.filter(
    (node) =>
      node.type === 'ExportNamedDeclaration' &&
      node.declaration?.type === 'VariableDeclaration' &&
      node.declaration.declarations.some(
        (declaration) => declaration.id.type === 'Identifier' && declaration.id.name === name,
      ),
  );
  if (declarations.length !== 1) throw new Error(`shared tokens must declare ${name} exactly once`);
  const declaration = declarations[0]!;
  if (declaration.start == null || declaration.end == null) {
    throw new Error(`shared tokens has no source span for ${name}`);
  }
  return { start: declaration.start, end: declaration.end };
}

function themedChrome(): string {
  return [colourBlock('BH'), colourBlock('VIDEO_SURFACE')]
    .sort((left, right) => right.start - left.start)
    .reduce((text, block) => text.slice(0, block.start) + text.slice(block.end), source);
}

describe('shared viewer colours', () => {
  it('keeps both viewer consumers on the shared alias owner', () => {
    for (const file of [
      '../src/client/index.tsx',
      '../../client/src/client/remote-viewer/index.tsx',
    ]) {
      const consumer = readFileSync(fileURLToPath(new URL(file, import.meta.url)), 'utf8');
      expect(consumer).not.toContain('--dsw-');
      expect(consumer).not.toMatch(LITERAL_COLOUR);
    }
  });
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
