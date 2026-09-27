import { describe, expect, it } from 'vitest';

import {
  dotStateFor,
  isExitReport,
  nextExpanded,
  smoothPhase,
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

describe('display phase hysteresis', () => {
  it('holds live through a single non-live tick', () => {
    expect(smoothPhase('live', 'connecting', 0)).toEqual({ phase: 'live', streak: 1 });
  });

  it('leaves live on the second consecutive non-live tick', () => {
    expect(smoothPhase('live', 'connecting', 1)).toEqual({ phase: 'connecting', streak: 2 });
    expect(smoothPhase('live', 'empty', 1)).toEqual({ phase: 'empty', streak: 2 });
  });

  it('resets on live and passes non-live states straight through', () => {
    expect(smoothPhase('live', 'live', 7)).toEqual({ phase: 'live', streak: 0 });
    expect(smoothPhase('connecting', 'connecting', 0)).toEqual({
      phase: 'connecting',
      streak: 0,
    });
    expect(smoothPhase('connecting', 'empty', 0)).toEqual({ phase: 'empty', streak: 0 });
    expect(smoothPhase('empty', 'connecting', 0)).toEqual({ phase: 'connecting', streak: 0 });
  });
});
