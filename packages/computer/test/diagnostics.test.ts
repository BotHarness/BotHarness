import { describe, expect, it } from 'vitest';

import {
  createComputerDiagnostics,
  toLogEntry,
  type ComputerDiagnosticEvent,
} from '../src/diagnostics.js';

describe('computer diagnostics sink', () => {
  it('drains recorded events to the sink in order', () => {
    const seen: ComputerDiagnosticEvent[] = [];
    const diagnostics = createComputerDiagnostics(undefined, {
      write: (event) => {
        seen.push(event);
      },
    });
    diagnostics.record('lifecycle', 'start requested (panel)');
    diagnostics.record('viewer', 'viewer phase connecting>live');
    expect(seen.map((event) => event.detail)).toEqual([
      'start requested (panel)',
      'viewer phase connecting>live',
    ]);
    expect(seen[0]).toMatchObject({ kind: 'lifecycle' });
    expect(typeof seen[0]?.at).toBe('string');
  });

  it('keeps recording when the sink throws', () => {
    const diagnostics = createComputerDiagnostics(undefined, {
      write: () => {
        throw new Error('disk gone');
      },
    });
    expect(() => diagnostics.record('container', 'container absent → running')).not.toThrow();
    expect(diagnostics.tail()).toHaveLength(1);
  });

  it('works without a sink', () => {
    const diagnostics = createComputerDiagnostics();
    diagnostics.record('lifecycle', 'x');
    expect(diagnostics.tail()).toHaveLength(1);
  });
});

describe('toLogEntry', () => {
  it('maps ring fields onto the log row shape', () => {
    expect(
      toLogEntry(
        { at: '2026-09-24T00:00:01.000Z', kind: 'viewer', detail: 'viewer mount docked' },
        'computer',
        'profile-shared',
      ),
    ).toEqual({
      plugin: 'computer',
      owner: 'profile-shared',
      kind: 'viewer',
      detail: 'viewer mount docked',
      ts: Date.parse('2026-09-24T00:00:01.000Z'),
    });
  });

  it('falls back to now instead of NaN on garbage timestamps', () => {
    const entry = toLogEntry(
      { at: 'not-a-date', kind: 'viewer', detail: 'x' },
      'computer',
      'bot:a',
    );
    expect(typeof entry.ts).toBe('number');
    expect(Number.isNaN(entry.ts)).toBe(false);
    expect(entry.owner).toBe('bot:a');
  });
});
