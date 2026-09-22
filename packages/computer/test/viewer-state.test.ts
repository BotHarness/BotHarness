import { describe, expect, it } from 'vitest';

import {
  EMPTY_AFTER_MISSES,
  dotStateFor,
  framePhase,
  nextExpanded,
  statusKeyFor,
} from '../src/client/viewer-state.js';

describe('viewer open/collapse state machine', () => {
  it('open always targets the expanded overlay', () => {
    expect(nextExpanded('open')).toBe(true);
  });

  it('collapse and Escape both target the resting entry', () => {
    expect(nextExpanded('collapse')).toBe(false);
    expect(nextExpanded('esc')).toBe(false);
  });

  it('esc is an absolute return, never a toggle (pressing it twice stays home)', () => {
    // open → esc → esc: the second esc must not blink the overlay open.
    expect(nextExpanded('open')).toBe(true);
    expect(nextExpanded('esc')).toBe(false);
    expect(nextExpanded('esc')).toBe(false);
  });
});

describe('stream frame phase', () => {
  it('is live as soon as the stream surface reports pixels', () => {
    expect(framePhase(true, 0)).toBe('live');
    expect(framePhase(true, 99)).toBe('live');
  });

  it('shows connecting while the first frames have not arrived', () => {
    expect(framePhase(false, 0)).toBe('connecting');
    expect(framePhase(false, EMPTY_AFTER_MISSES - 1)).toBe('connecting');
  });

  it('falls to an explicit empty state after sustained silence', () => {
    expect(framePhase(false, EMPTY_AFTER_MISSES)).toBe('empty');
    expect(framePhase(false, EMPTY_AFTER_MISSES + 5)).toBe('empty');
  });
});

describe('status projection for the title bar', () => {
  it('maps phases onto StateDot semantics', () => {
    expect(dotStateFor('live')).toBe('done');
    expect(dotStateFor('connecting')).toBe('ongoing');
    expect(dotStateFor('empty')).toBe('error');
  });

  it('prefers the reconnecting label over the plain connecting one', () => {
    expect(statusKeyFor('connecting', false)).toBe('entry.connecting');
    expect(statusKeyFor('connecting', true)).toBe('entry.reconnecting');
  });

  it('reports live and empty with their own copy', () => {
    expect(statusKeyFor('live', false)).toBe('entry.live');
    expect(statusKeyFor('live', true)).toBe('entry.live');
    expect(statusKeyFor('empty', false)).toBe('entry.noScreen');
  });
});
