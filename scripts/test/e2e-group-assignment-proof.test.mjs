import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  assertGroupAssignmentCompletion,
  assertSingleAssignment,
  nativeTimerCall,
} from '../e2e-group-assignment-proof.mjs';

const recordedProof = JSON.parse(
  readFileSync(
    new URL(
      '../../docs/assets/pr/124-group-assignment-activity/runtime-proof.json',
      import.meta.url,
    ),
    'utf8',
  ),
);

describe('Group Assignment completion proof', () => {
  it('accepts the recorded real native success followed by its Group reply', () => {
    expect(() => assertGroupAssignmentCompletion(recordedProof)).not.toThrow();
  });

  it('rejects any premature reply even when a later reply follows success', () => {
    const proof = structuredClone(recordedProof);
    const result = proof.nativeTimers.find((timer) => timer.role === 'assignment');
    proof.completion.unshift({
      ...proof.completion[0],
      at: new Date(result.resultAt - 1).toISOString(),
    });
    expect(() => assertGroupAssignmentCompletion(proof)).toThrow(
      'must follow native Assignment success',
    );
  });

  it('rejects unknown result or reply times', () => {
    const unknownResult = structuredClone(recordedProof);
    delete unknownResult.nativeTimers.find((timer) => timer.role === 'assignment').resultAt;
    expect(() => assertGroupAssignmentCompletion(unknownResult)).toThrow(
      'known Assignment result time',
    );
    const unknownReply = structuredClone(recordedProof);
    unknownReply.completion[0].at = 'unknown';
    expect(() => assertGroupAssignmentCompletion(unknownReply)).toThrow(
      'known Group completion time',
    );
  });
});

describe('Group Assignment execution bounds', () => {
  it('rejects a second Assignment even without its own timer approval', () => {
    const sessions = [{ role: 'orchestrator' }, { role: 'assignment' }];
    expect(() => assertSingleAssignment(sessions)).not.toThrow();
    expect(() => assertSingleAssignment([...sessions, { role: 'assignment' }])).toThrow(
      'exactly one owned Assignment',
    );
  });

  it('rejects another command rather than filtering it out by timer text', () => {
    const call = (time, command) => ({
      event: { type: 'tool/call', time, data: { arguments: JSON.stringify({ command }) } },
    });
    const timer = 'node -e "setTimeout(() => {}, 45000)"';
    const records = [
      call(10, timer),
      call(9, 'prior request'),
      { event: { type: 'tool/call', time: 11, data: { arguments: '{}' } } },
    ];
    expect(nativeTimerCall(records, 10, timer)).toEqual(records[0].event);
    expect(() => nativeTimerCall([...records, call(12, 'different command')], 10, timer)).toThrow(
      'exactly one native command call',
    );
    expect(() => nativeTimerCall([call(10, 'different command')], 10, timer)).toThrow(
      'expected native timer',
    );
  });
});
