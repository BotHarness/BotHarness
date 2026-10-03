import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { createProfileControl } from '../src/profile-control.js';
const origin = `chrome-extension://${'a'.repeat(32)}`;
const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});
async function setup() {
  const directory = await mkdtemp(join(tmpdir(), 'bh-profile-'));
  directories.push(directory);
  let access = true;
  const onChange = vi.fn();
  const options = {
    file: join(directory, 'pair.json'),
    enabled: () => true,
    allowed: () => access,
    onChange,
    note: () => undefined,
  };
  const service = createProfileControl(options);
  const code = (await service.pair()).code;
  const { token } = await service.redeem(code, origin);
  const client = randomUUID();
  const controller = new AbortController();
  const firstPoll = service.poll(token, origin, 2, client, controller.signal);
  await vi.waitFor(async () => expect((await service.view()).connected).toBe(true));
  return {
    service,
    options,
    token,
    code,
    client,
    controller,
    firstPoll,
    setAccess(value: boolean) {
      access = value;
    },
  };
}
it('persists only an origin-bound token hash and retains pairing across Host restart', async () => {
  const h = await setup();
  expect(await readFile(h.options.file, 'utf8')).not.toContain(h.token);
  await expect(h.service.redeem(h.code, origin)).rejects.toThrow('expired');
  await expect(
    h.service.poll(
      h.token,
      `chrome-extension://${'b'.repeat(32)}`,
      2,
      h.client,
      h.controller.signal,
    ),
  ).rejects.toThrow('unavailable');
  h.controller.abort();
  await expect(h.firstPoll).rejects.toThrow();
  h.service.dispose();
  const restarted = createProfileControl(h.options);
  expect(await restarted.view()).toEqual({ paired: true, connected: false, tabs: 0 });
  await restarted.forget();
  await expect(
    restarted.poll(h.token, origin, 0, h.client, new AbortController().signal),
  ).rejects.toThrow('unavailable');
  restarted.dispose();
});
it('serializes two Bots and fences queued work and late results on Access revocation', async () => {
  const h = await setup();
  const a = h.service.command('a', 'observe', {}, new AbortController().signal);
  const b = h.service.command('b', 'type', { ref: 'x', text: 'y' }, new AbortController().signal);
  const refused = expect(b).rejects.toThrow();
  const cmd = await h.firstPoll;
  if (!('id' in cmd)) throw new Error('Missing command');
  expect(cmd.slug).toBe('a');
  const cancelled = expect(a).rejects.toThrow('changed');
  h.setAccess(false);
  h.service.returnBot('a');
  await cancelled;
  await refused;
  await expect(
    h.service.result(h.token, origin, { id: cmd.id, epoch: cmd.epoch, value: 'late' }),
  ).rejects.toThrow('no longer');
  h.service.dispose();
});
it('Pause acknowledges only after an issued mutation drains and clears refs before Resume', async () => {
  const h = await setup();
  const action = h.service.command('a', 'type', {}, new AbortController().signal);
  const actionFailure = expect(action).rejects.toThrow('Pause');
  const cmd = await h.firstPoll;
  if (!('id' in cmd)) throw new Error('Missing command');
  let acknowledged = false;
  const paused = h.service.pause('a', true).then(() => {
    acknowledged = true;
  });
  await Promise.resolve();
  expect(acknowledged).toBe(false);
  await h.service.result(h.token, origin, { id: cmd.id, epoch: cmd.epoch, value: {} });
  await actionFailure;
  const barrier = await h.service.poll(h.token, origin, 2, h.client, new AbortController().signal);
  if (!('id' in barrier)) throw new Error('Missing barrier');
  expect(barrier.method).toBe('invalidate');
  await h.service.result(h.token, origin, { id: barrier.id, epoch: barrier.epoch, value: null });
  await paused;
  expect(acknowledged).toBe(true);
  await expect(h.service.command('a', 'click', {}, new AbortController().signal)).rejects.toThrow(
    'Pause',
  );
  h.service.dispose();
});
it('reconnection changes operation authority even when the old heartbeat is fresh', async () => {
  const h = await setup();
  h.controller.abort();
  await expect(h.firstPoll).rejects.toThrow();
  const before = h.service.revision;
  const controller = new AbortController();
  const reconnected = h.service.poll(h.token, origin, 3, randomUUID(), controller.signal);
  await vi.waitFor(() => expect(h.service.revision).toBeGreaterThan(before));
  controller.abort();
  await expect(reconnected).rejects.toThrow();
  expect((await h.service.view()).paired).toBe(true);
  h.service.dispose();
});
