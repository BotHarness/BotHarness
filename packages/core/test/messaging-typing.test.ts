import { setImmediate as tick } from 'node:timers/promises';
import { afterEach, expect, it, vi } from 'vitest';
import { createMessagingTyping, type TypingCandidate } from '../src/messaging/typing.js';
import type { MessagingProvider, MessagingTypingLease } from '../src/messaging/provider.js';

type TypingInput = Parameters<NonNullable<MessagingProvider['beginTyping']>>[0];
afterEach(() => vi.useRealTimers());

function fixture() {
  const inputs: TypingInput[] = [];
  const stops: ReturnType<typeof vi.fn<() => Promise<void>>>[] = [];
  const provider: MessagingProvider = {
    id: 'test/weixin',
    accounts: async () => [],
    targets: async () => [],
    inspect: async () => {
      throw new Error('unused');
    },
    send: async () => ({ accepted: true }),
    async beginTyping(input) {
      inputs.push(input);
      expect(input.beforeSend()).toBe(true);
      input.onState({ phase: 'accepted' });
      const stop = vi.fn(async () => input.onState({ phase: 'idle', reason: 'completed' }));
      stops.push(stop);
      return { accepted: true, stop };
    },
  };
  const authority = new AbortController();
  let valid = true;
  const candidate: TypingCandidate = {
    bindingId: 'own-wechat',
    grantId: 'own-grant',
    providerId: provider.id,
    token: {},
    provider,
    accountRef: 'paired',
    fingerprint: 'a'.repeat(64),
    route: { messageId: 'native-message', actorId: 'owner', conversationId: 'owner' },
    signal: authority.signal,
    validate: () => valid,
  };
  const typing = createMessagingTyping({
    candidate: (_bot, id) => (id === 'external-source' ? candidate : undefined),
    timeoutMs: 100,
  });
  return {
    typing,
    candidate,
    provider,
    inputs,
    stops,
    authority,
    invalidate: () => {
      valid = false;
    },
  };
}

it('shares same-DM work until the last actual processing owner finishes', async () => {
  const f = fixture();
  const orchestrator = f.typing.begin('ada', ['external-source']);
  const assignment = f.typing.begin('ada', ['external-source']);
  await tick();
  expect(f.inputs).toHaveLength(1);
  await orchestrator.stop();
  expect(f.inputs[0]!.signal.aborted).toBe(false);
  expect(f.inputs[0]!.beforeSend()).toBe(true);
  f.inputs[0]!.onState({ phase: 'accepted' });
  expect(f.typing.state('own-wechat').phase).toBe('accepted');
  expect(f.stops[0]).not.toHaveBeenCalled();
  await assignment.stop();
  await assignment.stop();
  expect(f.stops[0]).toHaveBeenCalledTimes(1);
  expect(f.typing.state('own-wechat').phase).toBe('idle');
});

it('does not infer an external indicator from unrelated local Channel work', async () => {
  const f = fixture();
  const work = f.typing.begin('ada', ['human-local', 'assignment-local']);
  await tick();
  expect(f.inputs).toEqual([]);
  work.add(['external-source']);
  await tick();
  expect(f.inputs).toHaveLength(1);
  await work.stop();
  work.add(['external-source']);
  await tick();
  expect(f.inputs).toHaveLength(1);
});

it('checks current authority on renewal and cancels all shared owners on invalidation', async () => {
  const f = fixture();
  const first = f.typing.begin('ada', ['external-source']);
  const second = f.typing.begin('ada', ['external-source']);
  await tick();
  f.invalidate();
  expect(f.inputs[0]!.beforeSend()).toBe(false);
  f.typing.invalidate((candidate) => candidate.grantId === 'own-grant');
  expect(f.inputs[0]!.signal.aborted).toBe(true);
  await tick();
  await Promise.all([first.stop(), second.stop()]);
  expect(f.stops[0]).toHaveBeenCalledTimes(1);
});

it('cancels an uncertain late startup exactly once without publishing a late accepted state', async () => {
  const f = fixture();
  let resolve!: (lease: MessagingTypingLease) => void;
  const pending = new Promise<MessagingTypingLease>((done) => {
    resolve = done;
  });
  const stopped = vi.fn(async () => {});
  f.provider.beginTyping = async (input) => {
    f.inputs.push(input);
    return pending;
  };
  const work = f.typing.begin('ada', ['external-source']);
  await tick();
  const finished = work.stop();
  expect(f.inputs[0]!.signal.aborted).toBe(true);
  f.inputs[0]!.onState({ phase: 'accepted' });
  resolve({ accepted: true, stop: stopped });
  await finished;
  expect(stopped).toHaveBeenCalledTimes(1);
  expect(f.typing.state('own-wechat').phase).not.toBe('accepted');
});

it('prevents a replaced Provider callback from overwriting the current identity state', async () => {
  const f = fixture();
  const first = f.typing.begin('ada', ['external-source']);
  await tick();
  f.typing.invalidate(() => true);
  f.candidate.token = {};
  const second = f.typing.begin('ada', ['external-source']);
  await tick();
  f.inputs[0]!.onState({ phase: 'cleanup-unconfirmed', reason: 'disposed' });
  expect(f.typing.state('own-wechat').phase).toBe('accepted');
  await Promise.all([first.stop(), second.stop()]);
});

it('keeps native API refusal separate from successful model processing', async () => {
  const f = fixture();
  f.provider.beginTyping = async () => {
    throw new Error('private native ticket');
  };
  const work = f.typing.begin('ada', ['external-source']);
  await tick();
  expect(f.typing.state('own-wechat')).toEqual({
    phase: 'unavailable',
    reason: 'typing-unavailable',
  });
  await expect(work.stop()).resolves.toBeUndefined();
  expect(JSON.stringify(f.typing.state('own-wechat'))).not.toContain('private');
});

it('reports unconfirmed cleanup and rejects further starts after disposal', async () => {
  const f = fixture();
  f.provider.beginTyping = async (input) => {
    f.inputs.push(input);
    return {
      accepted: true,
      stop: async () => {
        throw new Error('private native failure');
      },
    };
  };
  const work = f.typing.begin('ada', ['external-source']);
  await tick();
  f.typing.close();
  await work.stop();
  expect(f.typing.state('own-wechat')).toEqual({
    phase: 'cleanup-unconfirmed',
    reason: 'cancelled',
  });
  await f.typing.begin('ada', ['external-source']).stop();
  expect(f.inputs).toHaveLength(1);
});
