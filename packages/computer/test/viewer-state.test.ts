import { describe, expect, it } from 'vitest';

import {
  EMPTY_AFTER_MISSES,
  dotStateFor,
  framePhase,
  isExitReport,
  nextExpanded,
  statusKeyFor,
  stopKey,
} from '../src/client/viewer-state.js';

describe('viewer open/collapse state machine', () => {
  it('open targets the fullscreen overlay', () => {
    expect(nextExpanded('open')).toBe(true);
  });

  it('collapse targets the resting entry', () => {
    expect(nextExpanded('collapse')).toBe(false);
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

describe('stop control label', () => {
  it('shows stop at rest and stopping while a stop is underway', () => {
    expect(stopKey(false, false)).toBe('entry.stop');
    expect(stopKey(true, false)).toBe('entry.stopping');
    expect(stopKey(false, true)).toBe('entry.stopping');
    expect(stopKey(true, true)).toBe('entry.stopping');
  });
});

describe('start view note', () => {
  it('treats bare exit-code reports as machine noise', () => {
    expect(isExitReport('exited code=137')).toBe(true);
    expect(isExitReport('exited code=0')).toBe(true);
    expect(isExitReport(undefined)).toBe(false);
    expect(isExitReport('')).toBe(false);
    expect(isExitReport('pull failed: network unreachable')).toBe(false);
    expect(isExitReport('exited code=137 (oom)')).toBe(false);
  });
});
