import assert from 'node:assert/strict';

export function assertPendingReportRestart({
  reports,
  before,
  sessionId,
  events,
  orchestratorSessionId,
  expectedOrchestratorSessionId,
}) {
  assert.equal(
    orchestratorSessionId,
    expectedOrchestratorSessionId,
    'same durable Orchestrator Session',
  );
  assert.equal(reports.length, 2, 'exactly two original Reports');
  assert.equal(new Set(reports.map((r) => r.id)).size, 2, 'distinct sources');
  const facts = (rows) =>
    rows
      .map(({ id, assignmentSessionId, createdAt, summary, assignmentReportState }) => ({
        id,
        assignmentSessionId,
        createdAt,
        summary,
        assignmentReportState,
      }))
      .sort((a, b) => a.id.localeCompare(b.id));
  assert.deepEqual(
    facts(reports),
    facts(before),
    'exact source identity and content survive restart',
  );
  assert.ok(
    reports.every(
      (r) =>
        r.assignmentSessionId === sessionId &&
        r.state === 'pending' &&
        r.assignmentReportState === 'progress' &&
        r.sourceAvailable &&
        r.observedAt === undefined &&
        r.handledAt === undefined,
    ),
    'unobserved, navigable pending progress',
  );
  assert.equal(events.filter((e) => e.type === 'turn/start').length, 1, 'no replay wake');
  assert.equal(
    events.filter((e) => e.type === 'turn/end').length,
    1,
    'initial Turn remains settled',
  );
  assert.equal(
    events.filter(
      (e) => e.type === 'user/message' && JSON.stringify(e.data).includes('[Bot Inbox]'),
    ).length,
    0,
    'no replay delivery',
  );
  return { sourceIds: reports.map((r) => r.id).sort(), orchestratorTurns: 1, replayDeliveries: 0 };
}

export function assertRestartHarvest({ reports, before, sessionId, events }) {
  assert.equal(reports.length, 2);
  assert.deepEqual(
    reports.map((r) => r.id).sort(),
    before.map((r) => r.id).sort(),
    'original IDs retained',
  );
  assert.ok(
    reports.every(
      (r) =>
        r.assignmentSessionId === sessionId &&
        r.state === 'handled' &&
        r.sourceAvailable &&
        Number.isFinite(Date.parse(r.observedAt)) &&
        Number.isFinite(Date.parse(r.handledAt)),
    ),
    'all original reports handled and navigable',
  );
  assert.equal(new Set(reports.map((r) => r.observedAt)).size, 1);
  assert.equal(new Set(reports.map((r) => r.handledAt)).size, 1);
  assert.equal(events.filter((e) => e.type === 'turn/start').length, 2);
  assert.equal(events.filter((e) => e.type === 'turn/end').length, 2);
  const delivered = events.filter(
    (e) => e.type === 'user/message' && JSON.stringify(e.data).includes('[Bot Inbox]'),
  );
  assert.equal(delivered.length, 1, 'one harvest delivery');
  assert.ok(
    JSON.stringify(delivered[0].data).includes('repeats 2') &&
      JSON.stringify(delivered[0].data).includes('RESTART_PROGRESS_TWO'),
    'latest summary and repeat count',
  );
  return {
    orchestratorTurns: 2,
    harvestDeliveries: 1,
    sourceIds: reports.map((r) => r.id).sort(),
    observedAt: reports[0].observedAt,
    handledAt: reports[0].handledAt,
  };
}
