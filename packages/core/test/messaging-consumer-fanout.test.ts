import { expect, it, vi } from 'vitest';
import { fanoutMessagingConsumer } from '../src/messaging/consumer-fanout.js';
import type { MessagingProvider } from '../src/messaging/provider.js';

type Input = Parameters<NonNullable<MessagingProvider['consume']>>[0];
const event: Parameters<Input['onEvent']>[0] = {
  version: 1,
  channel: 'feishu',
  botId: 'app',
  fingerprint: 'a'.repeat(64),
  eventId: 'event',
  messageId: 'message',
  actor: { kind: 'user', id: 'human' },
  conversation: { kind: 'group', id: 'group' },
  mentions: [],
  mentionedAccount: false,
  at: '2026-10-03T00:00:00.000Z',
  text: 'test',
  reply: { messageId: 'message', conversationId: 'group', actorId: 'human' },
  replay: { kind: 'provider-redelivery', resumeCursor: false, gapPossible: true },
};
function input(controller: AbortController, onEvent: Input['onEvent']): Input {
  return { accountRef: 'app', fingerprint: event.fingerprint, signal: controller.signal, onEvent };
}
it('uses one exclusive account receiver, dispatches to both routes and retains a surviving route', async () => {
  let upstream: Input | undefined;
  const dispose = vi.fn();
  const consume = vi.fn(async (value: Input) => {
    upstream = value;
    return dispose;
  });
  const acquire = fanoutMessagingConsumer(consume);
  const a = new AbortController(),
    b = new AbortController();
  const onA = vi.fn(async () => ({ accepted: true as const })),
    onB = vi.fn(async () => ({ accepted: true as const }));
  const [offA, offB] = await Promise.all([acquire(input(a, onA)), acquire(input(b, onB))]);
  expect(consume).toHaveBeenCalledTimes(1);
  await upstream!.onEvent(event, upstream!.signal);
  expect(onA).toHaveBeenCalledTimes(1);
  expect(onB).toHaveBeenCalledTimes(1);
  offA();
  expect(upstream!.signal.aborted).toBe(false);
  await upstream!.onEvent(event, upstream!.signal);
  expect(onA).toHaveBeenCalledTimes(1);
  expect(onB).toHaveBeenCalledTimes(2);
  offB();
  await Promise.resolve();
  expect(upstream!.signal.aborted).toBe(true);
  expect(dispose).toHaveBeenCalledTimes(1);
});
it('rejects fingerprint aliasing and releases a cancelled pending registration', async () => {
  let finish!: (dispose: () => void) => void;
  const consume = vi.fn(() => new Promise<() => void>((resolve) => (finish = resolve)));
  const acquire = fanoutMessagingConsumer(consume);
  const controller = new AbortController(),
    other = new AbortController();
  const onEvent = vi.fn(async () => ({ accepted: true as const }));
  const pending = acquire(input(controller, onEvent));
  await Promise.resolve();
  await expect(
    acquire({ ...input(other, onEvent), fingerprint: 'b'.repeat(64) }),
  ).rejects.toMatchObject({ code: 'rebind-required' });
  const dispose = vi.fn();
  controller.abort();
  finish(dispose);
  await expect(pending).rejects.toThrow();
  await Promise.resolve();
  expect(dispose).toHaveBeenCalledTimes(1);
  expect(onEvent).not.toHaveBeenCalled();
});
it('waits for pending cancelled receiver cleanup before replacement registration', async () => {
  let finish!: (dispose: () => void) => void;
  let active = 0;
  const consume = vi.fn(async () => {
    expect(active).toBe(0);
    active++;
    if (consume.mock.calls.length === 1)
      return new Promise<() => void>((resolve) => (finish = resolve));
    return () => active--;
  });
  const acquire = fanoutMessagingConsumer(consume);
  const old = new AbortController(),
    next = new AbortController();
  const onEvent = vi.fn(async () => ({ accepted: true as const }));
  const pending = acquire(input(old, onEvent));
  const failed = expect(pending).rejects.toThrow();
  await Promise.resolve();
  old.abort();
  const replacement = acquire(input(next, onEvent));
  await Promise.resolve();
  expect(consume).toHaveBeenCalledTimes(1);
  finish(() => active--);
  await failed;
  const off = await replacement;
  expect(consume).toHaveBeenCalledTimes(2);
  expect(active).toBe(1);
  off();
  expect(active).toBe(0);
});
