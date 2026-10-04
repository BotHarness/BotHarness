import { describe, expect, it } from 'vitest';
import { assertAssignmentReportReply } from '../e2e-assignment-report-proof.mjs';

const marker = 'RESTART_REUSE_DONE';
const records = [
  {
    event: {
      type: 'tool/call',
      time: 100,
      data: {
        name: 'report_to_orchestrator',
        callId: 'report-1',
        arguments: JSON.stringify({ state: 'completed', summary: marker }),
      },
    },
  },
  {
    event: {
      type: 'tool/result',
      time: 200,
      data: { message: { toolCallId: 'report-1', isError: false } },
    },
  },
];
const reply = (at) => ({
  id: 'dm-1',
  author: { kind: 'bot' },
  body: marker,
  at: new Date(at).toISOString(),
});

describe('Assignment Report completion evidence', () => {
  it('accepts a successful Report followed by an actual DM reply', () => {
    expect(assertAssignmentReportReply(records, [reply(201)], marker).resultAt).toBe(200);
  });
  it('rejects an early reply even when a later reply follows success', () => {
    expect(() => assertAssignmentReportReply(records, [reply(199), reply(201)], marker)).toThrow(
      'every DM completion must follow successful Report',
    );
  });
  it('rejects failed or missing Report results', () => {
    const failed = structuredClone(records);
    failed[1].event.data.message.isError = true;
    expect(() => assertAssignmentReportReply(failed, [reply(201)], marker)).toThrow(
      'successful completed Report result',
    );
    expect(() => assertAssignmentReportReply(records.slice(0, 1), [reply(201)], marker)).toThrow(
      'successful completed Report result',
    );
  });
  it('rejects unknown times and a missing completion', () => {
    const unknown = structuredClone(records);
    delete unknown[1].event.time;
    expect(() => assertAssignmentReportReply(unknown, [reply(201)], marker)).toThrow(
      'known Report result time',
    );
    expect(() =>
      assertAssignmentReportReply(records, [{ ...reply(201), at: 'unknown' }], marker),
    ).toThrow('known DM completion time');
    expect(() => assertAssignmentReportReply(records, [], marker)).toThrow(
      'actual DM completion reply',
    );
  });
});
