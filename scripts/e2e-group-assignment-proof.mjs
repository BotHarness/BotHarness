import assert from 'node:assert/strict';

export function assertGroupAssignmentCompletion(proof) {
  const results = proof.nativeTimers.filter((timer) => timer.role === 'assignment');
  assert.equal(results.length, 1, 'exactly one native Assignment result');
  const result = results[0];
  assert.equal(result.completed, true);
  assert.equal(result.isError, false);
  assert.ok(Number.isFinite(result.resultAt), 'known Assignment result time');
  assert.ok(proof.completion.length > 0, 'actual Group completion reply');
  for (const message of proof.completion) {
    const at = Date.parse(message.at);
    assert.ok(Number.isFinite(at), 'known Group completion time');
    assert.ok(at >= result.resultAt, 'Group completion must follow native Assignment success');
  }
}

export function assertSingleAssignment(sessions) {
  assert.equal(
    sessions.filter((session) => session.role === 'assignment').length,
    1,
    'exactly one owned Assignment',
  );
}

export function nativeTimerCall(records, requestedAt, expectedCommand) {
  const calls = records.filter(
    ({ event }) =>
      event.type === 'tool/call' &&
      event.time >= requestedAt &&
      typeof JSON.parse(event.data.arguments).command === 'string',
  );
  assert.equal(calls.length, 1, 'exactly one native command call');
  const call = calls[0].event;
  assert.equal(JSON.parse(call.data.arguments).command, expectedCommand, 'expected native timer');
  return call;
}
