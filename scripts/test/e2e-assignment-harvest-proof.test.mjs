import { describe, expect, it } from 'vitest';
import { assertAssignmentHarvest } from '../e2e-assignment-harvest-proof.mjs';
const events = [
  { type: 'turn/start' },
  { type: 'turn/end' },
  { type: 'turn/start' },
  {
    type: 'user/message',
    data: { text: '[Bot Inbox] Assignment session-a (repeats 3) reported: REPORT_BATCH_DONE' },
  },
  { type: 'turn/end' },
];
const reports = ['progress', 'progress', 'completed'].map((state, index) => ({
  id: 'source-' + index,
  assignmentReportState: state,
  assignmentSessionId: 'session-a',
  state: 'handled',
  sourceAvailable: true,
  observedAt: '2026-10-04T18:13:26.844Z',
  handledAt: '2026-10-04T18:13:31.396Z',
}));
const check = (e = events, r = reports) =>
  assertAssignmentHarvest(e, r, 'session-a', ['source-0', 'source-1']);
describe('Assignment Report harvest evidence', () => {
  it('accepts one model-visible batch and retained independently observed sources', () =>
    expect(check().coalescedSourceCount).toBe(3));
  it('rejects an extra Turn or duplicate model-visible delivery', () => {
    expect(() => check([...events, { type: 'turn/start' }])).toThrow('one initial Turn');
    expect(() => check([...events, events[3]])).toThrow('exactly one model-visible Inbox');
  });
  it('rejects dropped or replaced progress identity', () => {
    expect(() => check(events, reports.slice(1))).toThrow('three independent');
    expect(() =>
      check(events, [{ ...reports[0], id: 'replacement' }, ...reports.slice(1)]),
    ).toThrow('original progress');
  });
  it('rejects unresolved, unavailable or another Session source', () => {
    for (const change of [
      { state: 'pending' },
      { sourceAvailable: false },
      { assignmentSessionId: 'session-b' },
    ])
      expect(() => check(events, [{ ...reports[0], ...change }, ...reports.slice(1)])).toThrow(
        'owned Session',
      );
  });
  it('rejects different observations or handling batches', () => {
    expect(() =>
      check(events, [
        { ...reports[0], observedAt: '2026-10-04T18:14:26.844Z' },
        ...reports.slice(1),
      ]),
    ).toThrow('one batch observation');
    expect(() =>
      check(events, [
        { ...reports[0], handledAt: '2026-10-04T18:14:31.396Z' },
        ...reports.slice(1),
      ]),
    ).toThrow('one batch handling');
  });
});
