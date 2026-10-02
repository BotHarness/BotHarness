import { Context } from '@deepseek-ai/cordis';
import { describe, expect, it } from 'vitest';
import { createTestOwnership } from './helpers.js';
import { createBotStateTracker } from '../src/state/bot-state.js';
import { createDshActivityProjection } from '../src/state/dsh-activity.js';
import {
  ActivityToolDetails,
  createToolDetailIndex,
  TOOL_DETAIL_MAX_BYTES,
  TOOL_DETAIL_MAX_REFS,
  TOOL_DETAIL_TTL_MS,
  type ToolDetailAudit,
  type ToolDetailRead,
} from '../src/state/tool-details.js';
import type { DshSessionEvent } from '../src/sessions/source.js';

const call = (seq = 1): DshSessionEvent => ({
  type: 'tool/call',
  seq,
  time: 1,
  data: { callId: `call-${seq}`, name: 'bash', arguments: '{"command":"private-command"}' },
});
const result: DshSessionEvent = {
  type: 'tool/result',
  seq: 2,
  time: 2,
  data: {
    message: {
      role: 'tool',
      toolCallId: 'call-1',
      content: [{ type: 'text', text: 'private-result' }],
    },
    meta: { private: 'native-meta' },
  },
};
function fixture() {
  const ownership = createTestOwnership({
    'private-session': { botSlug: 'ada', rootRole: 'orchestrator' },
  });
  const events: DshSessionEvent[] = [call()];
  let time = 1;
  let live = true;
  const index = createToolDetailIndex({
    owner: (id) => ownership.resolve(id),
    repairRevision: (id) => ownership.repairRevision(id),
    events: () => (live ? events : undefined),
    now: () => time,
  });
  const reference = index.observe('private-session', events[0]!)!;
  return {
    index,
    reference,
    events,
    ownership,
    advance: () => {
      time += TOOL_DETAIL_TTL_MS;
    },
    remove: () => {
      live = false;
    },
  };
}

describe('authorized Activity Tool detail capability', () => {
  it('reads canonical arguments and completed result on demand, without copying transcript or mutating native facts', () => {
    const { index, reference, events } = fixture();
    expect(reference).not.toContain('private-session');
    expect(index.read(reference)).toMatchObject({
      ok: true,
      detail: { arguments: '{"command":"private-command"}' },
    });
    events.push(
      { type: 'assistant/message', seq: 9, time: 1, data: { message: 'private-reasoning' } },
      result,
    );
    const read = index.read(reference);
    expect(read).toMatchObject({ ok: true, detail: { result: result.data } });
    expect(JSON.stringify(read)).not.toContain('private-reasoning');
    if (!read.ok) throw new Error('expected read');
    (read.detail.result as { meta: { private: string } }).meta.private = 'mutated';
    expect(index.read(reference)).toMatchObject({
      ok: true,
      detail: { result: { meta: { private: 'native-meta' } } },
    });
  });

  it('rejects unknown, expired, disposed and reset references', () => {
    const unknown = fixture();
    expect(unknown.index.read('private-session')).toEqual({ ok: false, reason: 'unavailable' });
    unknown.advance();
    expect(unknown.index.read(unknown.reference)).toEqual({ ok: false, reason: 'unavailable' });
    for (const revoke of ['session', 'turn/end', 'turn/start', 'clear', 'removed'] as const) {
      const f = fixture();
      if (revoke === 'session') f.index.revokeSession('private-session');
      else if (revoke === 'clear') f.index.clear();
      else if (revoke === 'removed') f.remove();
      else f.index.observe('private-session', { type: revoke, time: 2, data: {} });
      expect(f.index.read(f.reference)).toEqual({ ok: false, reason: 'unavailable' });
    }
  });

  it('refuses changed ownership, missing canonical calls and oversized complete payloads', () => {
    const f = fixture();
    f.ownership.repair({
      sessionId: 'private-session',
      botSlug: 'other',
      rootRole: 'assignment',
      at: '2026-10-03T00:00:00Z',
    });
    expect(f.index.read(f.reference)).toEqual({ ok: false, reason: 'unavailable' });
    const absent = fixture();
    absent.events.length = 0;
    expect(absent.index.read(absent.reference)).toEqual({ ok: false, reason: 'unavailable' });
    const large = fixture();
    large.events.push({
      ...result,
      data: { message: { toolCallId: 'call-1', content: 'X'.repeat(TOOL_DETAIL_MAX_BYTES) } },
    });
    expect(large.index.read(large.reference)).toEqual({ ok: false, reason: 'too-large' });
  });

  it('permanently revokes references across ownership repair round trips, even without an intermediate read', () => {
    for (const readBetween of [true, false]) {
      const f = fixture();
      f.ownership.repair({
        sessionId: 'private-session',
        botSlug: 'ada',
        rootRole: 'orchestrator',
        at: '2026-10-03T00:00:00Z',
      });
      const ref = f.index.observe('private-session', call())!;
      f.ownership.repair({
        sessionId: 'private-session',
        botSlug: 'other',
        rootRole: 'assignment',
        at: '2026-10-03T00:00:01Z',
      });
      if (readBetween) expect(f.index.read(ref)).toEqual({ ok: false, reason: 'unavailable' });
      f.ownership.repair({
        sessionId: 'private-session',
        botSlug: 'ada',
        rootRole: 'orchestrator',
        at: '2026-10-03T00:00:02Z',
      });
      expect(f.index.read(ref)).toEqual({ ok: false, reason: 'unavailable' });
    }
  });

  it('bounds locator retention, deduplicates live events and does not grant unowned calls', () => {
    const f = fixture();
    expect(f.index.observe('unowned', call())).toBeUndefined();
    expect(f.index.observe('private-session', call())).toBe(f.reference);
    for (let seq = 2; seq <= TOOL_DETAIL_MAX_REFS + 1; seq++)
      f.index.observe('private-session', call(seq));
    expect(f.index.read(f.reference)).toEqual({ ok: false, reason: 'unavailable' });
  });

  it('uses real Cordis caller Fiber identity, denies unnamed/unlisted/disposed consumers and audits no payload', async () => {
    const ctx = new Context();
    const f = fixture();
    const audit: ToolDetailAudit[] = [];
    const provider = ctx.plugin({
      name: 'provider',
      apply(c: Context) {
        new ActivityToolDetails(c, f.index, ['permitted-consumer'], (entry) => audit.push(entry));
      },
    });
    await provider.await();
    let permitted!: () => ToolDetailRead;
    let denied!: () => ToolDetailRead;
    const consumer = ctx.plugin({
      name: 'permitted-consumer',
      inject: ['botharnessActivityDetails'],
      apply(c: Context) {
        const service = c.botharnessActivityDetails;
        permitted = () => service.read(f.reference);
      },
    });
    const other = ctx.plugin({
      name: 'other-consumer',
      inject: ['botharnessActivityDetails'],
      apply(c: Context) {
        const service = c.botharnessActivityDetails;
        denied = () => service.read(f.reference);
      },
    });
    await consumer.await();
    await other.await();
    try {
      expect(permitted()).toMatchObject({ ok: true });
      expect(denied()).toEqual({ ok: false, reason: 'unauthorized' });
      expect(ctx.botharnessActivityDetails.read(f.reference)).toEqual({
        ok: false,
        reason: 'unauthorized',
      });
      await consumer.dispose();
      expect(permitted()).toEqual({ ok: false, reason: 'unauthorized' });
      expect(audit.map((e) => e.outcome)).toEqual([
        'allowed',
        'unauthorized',
        'unauthorized',
        'unauthorized',
      ]);
      expect(JSON.stringify(audit)).not.toMatch(
        /private-command|private-result|private-session|tool-detail-/,
      );
    } finally {
      await ctx.fiber.dispose();
    }
  });

  it('publishes references once through safe Activity, revokes on Turn end, and rebuilds only live references', () => {
    const f = fixture();
    const states = createBotStateTracker();
    const projection = createDshActivityProjection({
      ownership: f.ownership,
      states,
      details: f.index,
    });
    const emitted: unknown[] = [];
    states.onActivity((e) => emitted.push(e));
    projection.handleSessionEvent('private-session', call());
    projection.handleSessionEvent('private-session', call());
    expect(emitted).toHaveLength(1);
    expect(states.activity('ada')?.detailRefs).toEqual([f.reference]);
    expect(JSON.stringify(emitted)).not.toMatch(/private-command|private-session|private-result/);
    projection.rebuild([{ id: 'private-session', header: {}, snapshotEvents: () => f.events }]);
    const rebuilt = states.activity('ada')?.detailRefs?.[0];
    expect(rebuilt).toBeDefined();
    expect(rebuilt).not.toBe(f.reference);
    expect(f.index.read(f.reference)).toEqual({ ok: false, reason: 'unavailable' });
    projection.handleSessionEvent('private-session', { type: 'turn/end', time: 3, data: {} });
    expect(f.index.read(rebuilt!)).toEqual({ ok: false, reason: 'unavailable' });
    expect(states.snapshot('ada').state).toBe('idle');
  });
});
