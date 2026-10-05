import assert from 'node:assert/strict';

export function assertAssignmentReportReply(records, messages, marker) {
  const calls = records.filter(
    ({ event }) =>
      event.type === 'tool/call' &&
      event.data.name === 'report_to_orchestrator' &&
      JSON.parse(event.data.arguments).state === 'completed' &&
      JSON.parse(event.data.arguments).summary === marker,
  );
  assert.equal(calls.length, 1, 'exactly one native completed Report call');
  const call = calls[0].event;
  const result = records.find(
    ({ event }) =>
      event.type === 'tool/result' && event.data.message.toolCallId === call.data.callId,
  )?.event;
  assert.equal(result?.data.message.isError, false, 'successful completed Report result');
  assert.ok(Number.isFinite(result.time), 'known Report result time');
  const completion = messages.filter(
    (message) => message.author.kind === 'bot' && message.body === marker,
  );
  assert.ok(completion.length > 0, 'actual DM completion reply');
  for (const message of completion) {
    const at = Date.parse(message.at);
    assert.ok(Number.isFinite(at), 'known DM completion time');
    assert.ok(at >= result.time, 'every DM completion must follow successful Report');
  }
  return {
    tool: call.data.name,
    callAt: call.time,
    resultAt: result.time,
    successful: true,
    completion: completion.map(({ id, at }) => ({ id, at })),
  };
}
