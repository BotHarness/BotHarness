import { describe, expect, it } from 'vitest';

import { createCore } from '../src/plugin.js';
import type { BotAgentAdapter } from '../src/runtime/bot-runtime.js';
import { createTempRoot } from './helpers.js';

describe('Human DM steering', () => {
  it('steers a Human DM message into an active Orchestrator turn at its next safe step', async () => {
    const home = createTempRoot('botharness-dm-steer-');
    let markStarted = (): void => undefined;
    let releaseTurn = (): void => undefined;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const released = new Promise<void>((resolve) => {
      releaseTurn = resolve;
    });
    const steered: string[] = [];
    const runs: string[] = [];
    const agents: BotAgentAdapter = {
      async runOrchestrator(run) {
        runs.push(run.inboundChannelId);
        markStarted();
        await released;
      },
      steerOrchestrator(botSlug, text) {
        expect(botSlug).toBe('ada');
        steered.push(text);
        return true;
      },
      async runAssignment() {},
      requestAssignment() {
        throw new Error('No Assignment expected');
      },
      async close() {},
    };
    const core = createCore({ dshHome: home, agents });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      const dm = core.channels.getOrCreateDm('ada', 'Ada')!;
      await core.channels.appendMessage(dm.id, {
        id: 'dm-1',
        at: '2026-09-25T00:00:00.000Z',
        author: { kind: 'human' },
        body: 'Start the report',
      });
      const first = core.runtime.admitDmMessage({
        channelId: dm.id,
        messageId: 'dm-1',
        body: 'Start the report',
      });
      expect(first.admitted).toBe(true);
      await started;

      await core.channels.appendMessage(dm.id, {
        id: 'dm-2',
        at: '2026-09-25T00:00:01.000Z',
        author: { kind: 'human' },
        body: 'STEER-42 use the second file',
      });
      const second = core.runtime.admitDmMessage({
        channelId: dm.id,
        messageId: 'dm-2',
        body: 'STEER-42 use the second file',
      });
      expect(second.admitted).toBe(true);

      expect(steered).toHaveLength(1);
      expect(steered[0]).toContain('STEER-42 use the second file');
      expect(core.channels.message(dm.id, 'dm-2')?.deliveries).toEqual([
        { botSlug: 'ada', state: 'running' },
      ]);

      releaseTurn();
      if (first.admitted) await first.settled;
      await core.runtime.whenIdle();
      expect(runs).toEqual([dm.id]);
      expect(core.channels.message(dm.id, 'dm-2')?.deliveries).toEqual([
        { botSlug: 'ada', state: 'handled' },
      ]);
    } finally {
      releaseTurn();
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });

  it('claims pending Human DM messages into the next steer', async () => {
    const home = createTempRoot('botharness-dm-harvest-');
    let markStarted = (): void => undefined;
    let releaseTurn = (): void => undefined;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const released = new Promise<void>((resolve) => {
      releaseTurn = resolve;
    });
    const steered: string[] = [];
    let allowSteer = false;
    const agents: BotAgentAdapter = {
      async runOrchestrator() {
        markStarted();
        await released;
      },
      steerOrchestrator(_botSlug, text) {
        if (!allowSteer) return false;
        steered.push(text);
        return true;
      },
      async runAssignment() {},
      requestAssignment() {
        throw new Error('No Assignment expected');
      },
      async close() {},
    };
    const core = createCore({ dshHome: home, agents });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      const dm = core.channels.getOrCreateDm('ada', 'Ada')!;
      for (const [id, body] of [
        ['dm-1', 'Start the report'],
        ['dm-2', 'QUEUED-ONE'],
        ['dm-3', 'STEER-TWO'],
      ] as const) {
        await core.channels.appendMessage(dm.id, {
          id,
          at: `2026-09-25T00:00:0${id.slice(-1)}.000Z`,
          author: { kind: 'human' },
          body,
        });
      }
      const first = core.runtime.admitDmMessage({
        channelId: dm.id,
        messageId: 'dm-1',
        body: 'Start the report',
      });
      expect(first.admitted).toBe(true);
      await started;

      const second = core.runtime.admitDmMessage({
        channelId: dm.id,
        messageId: 'dm-2',
        body: 'QUEUED-ONE',
      });
      expect(second.admitted).toBe(true);
      allowSteer = true;
      const third = core.runtime.admitDmMessage({
        channelId: dm.id,
        messageId: 'dm-3',
        body: 'STEER-TWO',
      });
      expect(third.admitted).toBe(true);

      expect(steered).toHaveLength(1);
      expect(steered[0]).toContain('STEER-TWO');
      expect(steered[0]).toContain('QUEUED-ONE');
      expect(steered[0]).toContain('pending DM context');

      releaseTurn();
      await core.runtime.whenIdle();
    } finally {
      releaseTurn();
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });
});
