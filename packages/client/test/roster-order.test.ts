import { describe, expect, it } from 'vitest';

import {
  commitScopeReorder,
  moveWithinOrder,
  orderScopeChannels,
  reconcileOrder,
  resolvedSortMode,
  rowDropHalf,
} from '../src/client/roster-order.js';
import type { ChannelSummary } from '../src/client/store.js';

function channel(id: string, updatedAt: string, patch?: Partial<ChannelSummary>): ChannelSummary {
  return {
    id,
    type: 'group',
    name: id,
    members: [],
    createdAt: updatedAt,
    updatedAt,
    ...patch,
  };
}

describe('scope sort mode resolution', () => {
  it('prefers a section override over the global default', () => {
    expect(resolvedSortMode('manual', 'updated')).toBe('manual');
    expect(resolvedSortMode('updated', 'manual')).toBe('updated');
  });

  it('follows the global default when the scope has no override', () => {
    expect(resolvedSortMode(undefined, 'updated')).toBe('updated');
    expect(resolvedSortMode(undefined, 'manual')).toBe('manual');
  });
});

describe('scope channel ordering', () => {
  const older = channel('b-old', '2026-09-18T10:00:00.000Z');
  const newer = channel('a-new', '2026-09-19T10:00:00.000Z');
  const middle = channel('c-mid', '2026-09-18T18:00:00.000Z');

  it('orders updated mode newest first without mutating the input', () => {
    const input = [older, newer, middle];
    const ordered = orderScopeChannels(input, 'updated');

    expect(ordered.map((entry) => entry.id)).toEqual(['a-new', 'c-mid', 'b-old']);
    expect(input.map((entry) => entry.id)).toEqual(['b-old', 'a-new', 'c-mid']);
  });

  it('breaks equal timestamps by id and sorts unparsable timestamps last', () => {
    const at = '2026-09-19T10:00:00.000Z';
    const ordered = orderScopeChannels(
      [
        channel('z', at),
        channel('a', at),
        channel('broken-z', 'not-a-date'),
        channel('broken-a', 'also-not-a-date'),
      ],
      'updated',
    );

    expect(ordered.map((entry) => entry.id)).toEqual(['a', 'z', 'broken-a', 'broken-z']);
  });

  it('uses the stored manual order before the roster order', () => {
    const ordered = orderScopeChannels([newer, older, middle], 'manual', ['b-old', 'c-mid']);

    expect(ordered.map((entry) => entry.id)).toEqual(['b-old', 'c-mid', 'a-new']);
  });

  it('drops stored ids that are no longer visible and appends new channels', () => {
    const ordered = orderScopeChannels([middle, newer], 'manual', ['gone', 'c-mid', 'c-mid']);

    expect(ordered.map((entry) => entry.id)).toEqual(['c-mid', 'a-new']);
  });

  it('keeps roster order for a manual scope without a stored order (未分组)', () => {
    expect(orderScopeChannels([older, newer], 'manual').map((entry) => entry.id)).toEqual([
      'b-old',
      'a-new',
    ]);
  });
});

describe('membership reconciliation', () => {
  it('keeps known preferred ids first and appends the omitted ones in place order', () => {
    expect(reconcileOrder(['c3', 'c1'], ['c1', 'c2', 'c3'])).toEqual(['c3', 'c1', 'c2']);
    expect(reconcileOrder(['ghost', 'c2', 'c2'], ['c1', 'c2'])).toEqual(['c2', 'c1']);
    expect(reconcileOrder([], ['c1', 'c2'])).toEqual(['c1', 'c2']);
  });

  it('never invents or drops members', () => {
    const members = ['a', 'b', 'c'];
    const reconciled = reconcileOrder(['c', 'a', 'ghost'], members);

    expect([...reconciled].sort()).toEqual([...members].sort());
  });
});

describe('in-scope drag math', () => {
  it('detects the half-row side from the pointer position', () => {
    const rect = { top: 100, height: 32 };

    expect(rowDropHalf(101, rect)).toBe('before');
    expect(rowDropHalf(115, rect)).toBe('before');
    expect(rowDropHalf(116, rect)).toBe('after');
    expect(rowDropHalf(131, rect)).toBe('after');
  });

  it('moves a row before or after the target', () => {
    expect(moveWithinOrder(['a', 'b', 'c'], 'a', 'c', 'after')).toEqual(['b', 'c', 'a']);
    expect(moveWithinOrder(['a', 'b', 'c'], 'c', 'a', 'before')).toEqual(['c', 'a', 'b']);
    expect(moveWithinOrder(['a', 'b', 'c'], 'b', 'a', 'before')).toEqual(['b', 'a', 'c']);
  });

  it('treats adjacent drops and unknown ids as no-ops', () => {
    expect(moveWithinOrder(['a', 'b', 'c'], 'a', 'b', 'before')).toBeUndefined();
    expect(moveWithinOrder(['a', 'b', 'c'], 'b', 'a', 'after')).toBeUndefined();
    expect(moveWithinOrder(['a', 'b'], 'a', 'a', 'before')).toBeUndefined();
    expect(moveWithinOrder(['a', 'b'], 'missing', 'b', 'before')).toBeUndefined();
    expect(moveWithinOrder(['a', 'b'], 'a', 'missing', 'before')).toBeUndefined();
  });
});

describe('scope drop commit', () => {
  it('freezes the order and flips the scope while it is still automatic', () => {
    expect(commitScopeReorder(['a', 'b', 'c'], 'a', 'c', 'after', false)).toEqual({
      order: ['b', 'c', 'a'],
      setManualOverride: true,
    });
  });

  it('only rewrites the order once the scope is manual', () => {
    expect(commitScopeReorder(['a', 'b', 'c'], 'c', 'a', 'before', true)).toEqual({
      order: ['c', 'a', 'b'],
      setManualOverride: false,
    });
  });

  it('reports nothing for a no-op drop', () => {
    expect(commitScopeReorder(['a', 'b'], 'a', 'b', 'before', false)).toBeUndefined();
  });
});
