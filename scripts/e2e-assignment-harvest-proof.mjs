import assert from 'node:assert/strict';

export function assertAssignmentHarvest(events, reports, sessionId, progressIds) {
  assert.equal(
    events.filter((event) => event.type === 'turn/start').length,
    2,
    'one initial Turn plus one harvest Turn',
  );
  assert.equal(events.filter((event) => event.type === 'turn/end').length, 2, 'both Turns settled');
  const inbox = events.filter(
    (event) => event.type === 'user/message' && JSON.stringify(event.data).includes('[Bot Inbox]'),
  );
  assert.equal(inbox.length, 1, 'exactly one model-visible Inbox delivery');
  const body = JSON.stringify(inbox[0].data);
  assert.ok(
    body.includes('repeats 3') && body.includes('REPORT_BATCH_DONE'),
    'one coalesced latest Report with three sources',
  );
  assert.equal(reports.length, 3, 'three independent Report sources');
  assert.equal(new Set(reports.map((report) => report.id)).size, 3, 'distinct source identities');
  assert.ok(
    progressIds.every((id) => reports.some((report) => report.id === id)),
    'original progress source identities retained',
  );
  assert.deepEqual(reports.map((report) => report.assignmentReportState).sort(), [
    'completed',
    'progress',
    'progress',
  ]);
  assert.ok(
    reports.every(
      (report) =>
        report.assignmentSessionId === sessionId &&
        report.state === 'handled' &&
        report.sourceAvailable &&
        Number.isFinite(Date.parse(report.observedAt)) &&
        Number.isFinite(Date.parse(report.handledAt)),
    ),
    'handled, observed, navigable sources from the owned Session',
  );
  assert.equal(
    new Set(reports.map((report) => report.observedAt)).size,
    1,
    'one batch observation',
  );
  assert.equal(new Set(reports.map((report) => report.handledAt)).size, 1, 'one batch handling');
  return {
    orchestratorTurns: 2,
    harvestTurns: 1,
    modelVisibleInboxDeliveries: 1,
    coalescedSourceCount: 3,
    observedAt: reports[0].observedAt,
    handledAt: reports[0].handledAt,
  };
}
