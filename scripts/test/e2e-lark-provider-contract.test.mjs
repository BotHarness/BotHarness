import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apply } from '../e2e-lark-provider-contract.mjs';

const temporaryDirectories = [];
const disposers = [];
const fingerprint = 'a'.repeat(64);

function fixture({ existing, failure } = {}) {
  vi.useFakeTimers();
  const directory = mkdtempSync(join(tmpdir(), 'bh78-contract-'));
  temporaryDirectories.push(directory);
  const settings = {
    providerBotId: 'fixture-bot',
    groupId: 'fixture-group',
    allowedActorId: 'fixture-human',
    reportPath: join(directory, 'private.json'),
    publicReportPath: join(directory, 'public.json'),
  };
  const configPath = join(directory, 'config.json');
  writeFileSync(configPath, JSON.stringify(settings));
  if (existing) writeFileSync(settings.reportPath, existing);
  const calls = [];
  let receive;
  let disposed = false;
  const service = {
    inboundVersion: 1,
    describeBot: async () => ({
      connected: true,
      account: { fingerprint },
      capabilities: ['exclusive-text-consumer'],
    }),
    consumeInbound: async (_botId, options) => {
      receive = options.onEvent;
      return () => {
        disposed = true;
      };
    },
    replyChecked: async (_botId, route, text, options) => {
      options.signal.throwIfAborted();
      if (route.conversationId === 'unauthorized-group' || route.threadId === 'unauthorized-topic')
        throw Object.assign(new Error('Refused'), { code: 'stale-route' });
      calls.push({ route, text });
      if (failure) throw Object.assign(new Error('Unknown'), { code: 'reply-result-unknown' });
      return { sent: true, messageId: `fixture-reply-${calls.length}` };
    },
  };
  const ctx = {
    dshIm: service,
    effect: (effect) => {
      disposers.push(effect());
    },
  };
  return {
    start: () => apply(ctx, { testConfigPath: configPath }),
    calls,
    service,
    settings,
    receive: (event, options) => receive(event, options),
    privateReport: () => JSON.parse(readFileSync(settings.reportPath, 'utf8')),
    publicReport: () => JSON.parse(readFileSync(settings.publicReportPath, 'utf8')),
    disposed: () => disposed,
  };
}

function evidence(overrides = {}) {
  return {
    version: 1,
    channel: 'feishu',
    botId: 'fixture-bot',
    fingerprint,
    eventId: 'fixture-delivery',
    messageId: 'fixture-message',
    actor: { kind: 'user', id: 'fixture-human' },
    conversation: { kind: 'group', id: 'fixture-group' },
    mentions: [{ id: 'fixture-account', key: '@_user_1' }],
    mentionedAccount: true,
    text: '[BH78 ROOT] fixture',
    reply: {
      messageId: 'fixture-message',
      conversationId: 'fixture-group',
      actorId: 'fixture-human',
    },
    replay: { kind: 'provider-redelivery', resumeCursor: false, gapPossible: true },
    ...overrides,
  };
}

async function ready(f) {
  f.start();
  await vi.advanceTimersByTimeAsync(0);
}

afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose();
  vi.useRealTimers();
  for (const directory of temporaryDirectories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe('task-owned public provider qualification probe', () => {
  it('persists source evidence before accepting and sends only after acceptance', async () => {
    const f = fixture();
    await ready(f);
    expect(await f.receive(evidence())).toEqual({ accepted: true });
    expect(f.privateReport().sources[0].messageId).toBe('fixture-message');
    expect(f.calls).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(f.calls).toHaveLength(1);
    expect(f.publicReport().checks.staleGroupRefused).toBe(true);
    expect(JSON.stringify(f.publicReport())).not.toContain('fixture-human');
    expect(JSON.stringify(f.publicReport())).not.toContain('fixture-message');
  });

  it('deduplicates account-scoped message identity despite a different delivery event ID', async () => {
    const f = fixture();
    await ready(f);
    await f.receive(evidence());
    await f.receive(evidence({ eventId: 'second-delivery' }));
    await vi.advanceTimersByTimeAsync(1);
    expect(f.calls).toHaveLength(1);
    expect(f.publicReport().sources[0].deliveryCount).toBe(2);
  });

  it('rejects another group, actor or account before committing any test source', async () => {
    const f = fixture();
    await ready(f);
    for (const change of [
      { conversation: { kind: 'group', id: 'other-group' } },
      { actor: { kind: 'user', id: 'other-user' } },
      { fingerprint: 'b'.repeat(64) },
      { mentionedAccount: false },
    ])
      await expect(f.receive(evidence(change))).rejects.toMatchObject({
        code: 'qa-scope-mismatch',
      });
    expect(f.privateReport().sources).toHaveLength(0);
    expect(f.calls).toHaveLength(0);
  });

  it('preserves a topic route and rejects a substituted topic', async () => {
    const f = fixture();
    await ready(f);
    const event = evidence({
      text: '[BH78 TOPIC] fixture',
      reply: {
        messageId: 'fixture-message',
        conversationId: 'fixture-group',
        actorId: 'fixture-human',
        threadId: 'fixture-topic',
        rootId: 'fixture-root',
        parentId: 'fixture-parent',
      },
    });
    await f.receive(event);
    await vi.advanceTimersByTimeAsync(1);
    expect(f.calls[0].route).toEqual(event.reply);
    expect(f.publicReport().checks.staleTopicRefused).toBe(true);
    expect(f.publicReport().checks.existingTopicCheckedReply).toBe(true);
  });

  it('disposes the lease and cancels a deferred reply when the Plugin stops', async () => {
    const f = fixture();
    await ready(f);
    await f.receive(evidence());
    disposers.pop()();
    await vi.advanceTimersByTimeAsync(1);
    expect(f.disposed()).toBe(true);
    expect(f.calls).toHaveLength(0);
  });

  it('does not acquire after a pending account lookup finishes following disposal', async () => {
    const f = fixture();
    const pending = Promise.withResolvers();
    const account = await f.service.describeBot();
    f.service.describeBot = () => pending.promise;
    const acquire = vi.spyOn(f.service, 'consumeInbound');
    f.start();
    disposers.pop()();
    pending.resolve(account);
    await vi.advanceTimersByTimeAsync(0);
    expect(acquire).not.toHaveBeenCalled();
    expect(f.publicReport().checks.consumerDisposed).toBe(true);
    expect(f.publicReport().checks.publicExclusiveConsumer).toBe(false);
  });

  it('releases a lease that arrives after disposal instead of retaining ownership', async () => {
    const f = fixture();
    const pending = Promise.withResolvers();
    const release = vi.fn();
    f.service.consumeInbound = vi.fn(() => pending.promise);
    await ready(f);
    expect(f.service.consumeInbound).toHaveBeenCalledTimes(1);
    disposers.pop()();
    pending.resolve(release);
    await vi.advanceTimersByTimeAsync(0);
    expect(release).toHaveBeenCalledTimes(1);
    expect(f.publicReport().checks.consumerDisposed).toBe(true);
    expect(f.publicReport().checks.publicExclusiveConsumer).toBe(false);
    await vi.advanceTimersByTimeAsync(5000);
    expect(f.service.consumeInbound).toHaveBeenCalledTimes(1);
  });

  it('records an unknown reply and never automatically retries it', async () => {
    const f = fixture({ failure: true });
    await ready(f);
    await f.receive(evidence());
    await vi.advanceTimersByTimeAsync(1);
    await f.receive(evidence({ eventId: 'retry-delivery' }));
    await vi.advanceTimersByTimeAsync(5000);
    expect(f.calls).toHaveLength(1);
    expect(f.publicReport().sources[0]).toMatchObject({
      outcome: 'unknown-or-refused',
      providerReceipt: false,
    });
  });

  it('never resends a persisted accepted or in-flight reply after restart', async () => {
    for (const outcome of ['provider-accepted', 'attempt-started']) {
      const previous = {
        version: 1,
        sources: [{ ...evidence(), marker: '[BH78 ROOT]', deliveryCount: 1, outcome }],
        checks: {},
        errors: [],
        layer: 'fixture',
      };
      const f = fixture({ existing: JSON.stringify(previous) });
      await ready(f);
      await f.receive(evidence());
      await vi.advanceTimersByTimeAsync(1);
      expect(f.calls).toHaveLength(0);
      expect(f.privateReport().sources[0].outcome).toBe(
        outcome === 'attempt-started' ? 'unknown-or-refused' : outcome,
      );
    }
  });

  it('fails closed on a corrupt saved report instead of forgetting earlier effects', () => {
    const f = fixture({ existing: '{corrupt' });
    expect(f.start).toThrow(SyntaxError);
  });
});
