import { describe, expect, it, vi } from 'vitest';
import {
  createClientDiagnostics,
  injectClientObserver,
} from '../src/diagnostics/client-diagnostics.js';

const attempt = '00000000-0000-4000-8000-000000000001';
const post = (body: unknown) =>
  new Request('http://localhost/api/botharness/client-diagnostics', {
    method: 'POST',
    body: JSON.stringify(body),
  });
const get = () => new Request('http://localhost/api/botharness/client-diagnostics');
const event = (seq: number, code: string, source = 'lifecycle') => ({
  seq,
  code,
  source,
  elapsedMs: seq,
});
const report = (events: unknown[], extra = {}) => ({
  version: 1,
  attempt,
  startedAt: 1000,
  events,
  dropped: 0,
  ...extra,
});

describe('Client diagnostic authenticated route consumer', () => {
  it('never infers UI readiness from an empty collector or claimed state', async () => {
    let now = 1000;
    const diagnostics = createClientDiagnostics({ now: () => now });
    expect(await (await diagnostics.fetch(get())).json()).toMatchObject({
      readiness: 'unobserved',
      attempts: [],
    });
    await diagnostics.fetch(
      post(report([event(1, 'observer-installed')], { state: 'shell-ready' })),
    );
    expect(await (await diagnostics.fetch(get())).json()).toMatchObject({
      attempts: [{ state: 'starting' }],
    });
    await diagnostics.fetch(
      post(report([event(1, 'observer-installed'), event(2, 'shell-mounted')])),
    );
    expect(await (await diagnostics.fetch(get())).json()).toMatchObject({
      attempts: [{ state: 'shell-ready' }],
    });
    now += 36000;
    expect(await (await diagnostics.fetch(get())).json()).toMatchObject({
      attempts: [{ state: 'stale' }],
    });
  });

  it('preserves failure ordering over retries, refuses stale reports and writes only allowlisted fields', async () => {
    const write = vi.fn();
    const diagnostics = createClientDiagnostics({ write });
    const events = [
      event(1, 'observer-installed'),
      event(2, 'root-registration-missing', 'console-error'),
      event(3, 'conversation-session-missing', 'error'),
    ];
    expect(
      (
        await diagnostics.fetch(
          post(
            report(events, {
              secret: 'private',
              firstFailure: { ...events[1], stack: 'token=private' },
            }),
          ),
        )
      ).status,
    ).toBe(200);
    await diagnostics.fetch(post(report(events)));
    expect(write).toHaveBeenCalledTimes(3);
    expect(JSON.stringify(write.mock.calls)).not.toContain('private');
    expect((await diagnostics.fetch(post(report(events.slice(0, 1))))).status).toBe(409);
    const second = '00000000-0000-4000-8000-000000000002';
    await diagnostics.fetch(
      post(
        report([event(1, 'observer-installed'), event(2, 'shell-mounted')], { attempt: second }),
      ),
    );
    expect(await (await diagnostics.fetch(get())).json()).toMatchObject({
      attempts: [
        { state: 'failed', firstFailure: { seq: 2, code: 'root-registration-missing' } },
        { state: 'shell-ready' },
      ],
    });
  });

  it('caps attempts and rejects arbitrary messages, oversized and malformed reports', async () => {
    const diagnostics = createClientDiagnostics();
    expect((await diagnostics.fetch(post(report([event(1, 'token=private')])))).status).toBe(400);
    expect(
      (
        await diagnostics.fetch(
          post(report([event(1, 'observer-installed')], { secret: 'x'.repeat(17000) })),
        )
      ).status,
    ).toBe(413);
    expect(
      (
        await diagnostics.fetch(
          post(report([event(2, 'observer-installed'), event(1, 'shell-mounted')])),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await diagnostics.fetch(
          post(
            report([event(1, 'observer-installed')], {
              firstFailure: event(2, 'root-registration-missing', 'error'),
            }),
          ),
        )
      ).status,
    ).toBe(400);
    for (let n = 0; n < 25; n++)
      await diagnostics.fetch(
        post(
          report([event(1, 'observer-installed')], {
            attempt: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
          }),
        ),
      );
    const result = await (await diagnostics.fetch(get())).json();
    expect(result.attempts).toHaveLength(20);
    expect(result.evictedAttempts).toBe(5);
  });

  it('keeps log failures explicit without breaking observation', async () => {
    const diagnostics = createClientDiagnostics({
      write: () => {
        throw new Error('private disk path');
      },
    });
    await diagnostics.fetch(post(report([event(1, 'observer-installed')])));
    expect(await (await diagnostics.fetch(get())).json()).toMatchObject({
      persistence: 'unavailable',
    });
  });

  it('inserts the observer ahead of all native bootstrap scripts', () => {
    const html = injectClientObserver(
      '<!doctype html><html><head><script>nativeBoot()</script></head></html>',
    );
    expect(html.indexOf('data-botharness-client-diagnostics')).toBeLessThan(
      html.indexOf('nativeBoot()'),
    );
  });
});
