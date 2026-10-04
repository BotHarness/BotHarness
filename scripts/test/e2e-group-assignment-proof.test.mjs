import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { assertGroupAssignmentCompletion } from '../e2e-group-assignment-proof.mjs';

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
