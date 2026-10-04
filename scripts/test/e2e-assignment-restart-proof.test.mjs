import { describe, it, expect } from 'vitest';
import {
  assertPendingReportRestart,
  assertRestartHarvest,
} from '../e2e-assignment-restart-proof.mjs';
const pending = () => ({
  reports: [1, 2].map((n) => ({
    id: 'source-' + n,
    assignmentSessionId: 'assignment',
    createdAt: '2026-10-04T18:00:00Z',
    summary: 'RESTART_PROGRESS_' + (n === 1 ? 'ONE' : 'TWO'),
    assignmentReportState: 'progress',
    state: 'pending',
    sourceAvailable: true,
  })),
  sessionId: 'assignment',
  events: [{ type: 'turn/start' }, { type: 'turn/end' }],
  orchestratorSessionId: 'orchestrator',
  expectedOrchestratorSessionId: 'orchestrator',
});
const scene = () => {
  const value = pending();
  return { ...value, before: structuredClone(value.reports) };
};
const handled = () => {
  const value = scene();
  value.reports = value.reports.map((r) => ({
    ...r,
    state: 'handled',
    observedAt: '2026-10-04T18:01:00Z',
    handledAt: '2026-10-04T18:01:10Z',
  }));
  value.events.push(
    { type: 'turn/start' },
    { type: 'user/message', data: { body: '[Bot Inbox] RESTART_PROGRESS_TWO repeats 2' } },
    { type: 'turn/end' },
  );
  return value;
};
describe('pending Assignment Report restart proof', () => {
  it('accepts unchanged pending sources then one later harvest', () => {
    expect(assertPendingReportRestart(scene()).replayDeliveries).toBe(0);
    expect(assertRestartHarvest(handled()).harvestDeliveries).toBe(1);
  });
  it('rejects replaced, dropped or changed original sources', () => {
    for (const alter of [
      (s) => s.reports.pop(),
      (s) => (s.reports[0].id = 'replacement'),
      (s) => (s.reports[0].summary = 'different'),
      (s) => (s.reports[0].assignmentSessionId = 'other'),
    ]) {
      const s = scene();
      alter(s);
      expect(() => assertPendingReportRestart(s)).toThrow();
    }
  });
  it('rejects replay wake or delivery and a replaced Orchestrator', () => {
    for (const alter of [
      (s) => s.events.push({ type: 'turn/start' }),
      (s) => s.events.push({ type: 'user/message', data: '[Bot Inbox] replay' }),
      (s) => (s.orchestratorSessionId = 'replacement'),
    ]) {
      const s = scene();
      alter(s);
      expect(() => assertPendingReportRestart(s)).toThrow();
    }
  });
  it('rejects observation, unavailable source or false handled state after restart', () => {
    for (const alter of [
      (s) => (s.reports[0].observedAt = '2026-10-04T18:00:01Z'),
      (s) => (s.reports[0].sourceAvailable = false),
      (s) => (s.reports[0].state = 'handled'),
    ]) {
      const s = scene();
      alter(s);
      expect(() => assertPendingReportRestart(s)).toThrow();
    }
  });
  it('rejects duplicate harvest or lost source during handling', () => {
    const duplicate = handled();
    duplicate.events.push({ type: 'user/message', data: '[Bot Inbox] duplicate' });
    expect(() => assertRestartHarvest(duplicate)).toThrow();
    const lost = handled();
    lost.reports[0].id = 'replacement';
    expect(() => assertRestartHarvest(lost)).toThrow();
  });
  it('rejects incomplete or split observation after harvest', () => {
    const unresolved = handled();
    unresolved.reports[0].state = 'pending';
    expect(() => assertRestartHarvest(unresolved)).toThrow();
    const split = handled();
    split.reports[0].observedAt = '2026-10-04T18:01:01Z';
    expect(() => assertRestartHarvest(split)).toThrow();
  });
});
