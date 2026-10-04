import { describe, expect, it } from 'vitest';
import {
  PIXEL_SYMBOLS,
  pixelFaceCells,
  pixelSymbolCells,
  pixelSymbolFor,
  DEFAULT_ILLUSTRATED_RECIPE,
} from '../src/bots/avatar-appearance.js';

describe('pixel Avatar symbols', () => {
  it('binds DSH tools, kinds and states to symbols', () => {
    const tool = (toolName: string) =>
      pixelSymbolFor('working', { toolName, toolKind: 'other' }, 0);
    expect(tool('read')).toBe('read');
    expect(tool('write')).toBe('write');
    expect(tool('str_replace_editor')).toBe('edit');
    expect(tool('bash')).toBe('bash');
    expect(tool('grep')).toBe('search');
    expect(tool('web_search')).toBe('web');
    expect(tool('web_fetch')).toBe('fetch');
    expect(tool('ask_user_question')).toBe('ask');
    expect(tool('todo_write')).toBe('todo');
    expect(tool('some_mcp_tool')).toBe('other');
    expect(pixelSymbolFor('working', { toolKind: 'execute' }, 0)).toBe('bash');
    expect(pixelSymbolFor('thinking', undefined, 0)).toBe('thinking');
    expect(pixelSymbolFor('working', { toolName: 'bash', toolKind: 'execute' }, 2)).toBe(
      'approval',
    );
    expect(pixelSymbolFor('idle', undefined, 0)).toBeUndefined();
    expect(pixelSymbolFor('waiting', undefined, 0)).toBeUndefined();
  });

  it('draws every symbol inside the 32 grid in the given colour with an ink outline', () => {
    for (const symbol of PIXEL_SYMBOLS) {
      const cells = pixelSymbolCells(symbol, '#3fc1b8');
      expect(cells.length, symbol).toBeGreaterThan(80);
      expect(cells.every((c) => c.x >= 0 && c.x < 32 && c.y >= 0 && c.y < 32)).toBe(true);
      expect(
        cells.some((c) => c.c === '#3fc1b8'),
        symbol,
      ).toBe(true);
      expect(
        cells.some((c) => c.c === '#2a2230'),
        symbol,
      ).toBe(true);
      expect(new Set(cells.map((c) => `${c.x},${c.y}`)).size).toBe(cells.length);
    }
    expect(pixelFaceCells(DEFAULT_ILLUSTRATED_RECIPE).length).toBeGreaterThan(400);
  });
});
