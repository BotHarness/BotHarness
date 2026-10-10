import { describe, expect, it, vi } from 'vitest';

import { TAKEOVER_TTL_MS, createTakeoverService, takeoverUrl } from '../src/takeover.js';

describe('browser takeover handoff', () => {
  it('builds a viewer link that carries the single-use token', () => {
    expect(takeoverUrl('/botharness-browser/viewer/local/?slug=qa', 'tok')).toBe(
      '/botharness-browser/viewer/local/?slug=qa&takeover=tok',
    );
    expect(TAKEOVER_TTL_MS).toBeLessThanOrEqual(10 * 60_000);
  });

  it('runs mint, accept, input, complete with an append-only trail', async () => {
    let at = 1_000;
    const service = createTakeoverService(() => at);
    const record = service.mint('qa', 'Log in to Example');
    expect(record.state).toBe('pending');
    expect(record.expiresAt - record.createdAt).toBeLessThanOrEqual(10 * 60_000);
    at += 1_000;
    expect(service.accept(record.token)?.state).toBe('accepted');
    at += 1_000;
    service.recordInput('qa', 'click x=10 y=20');
    const waited = service.wait(record.token);
    at += 1_000;
    expect(service.complete(record.token, 'done')?.state).toBe('completed');
    await expect(waited).resolves.toMatchObject({ state: 'completed', reason: 'done' });
    expect(service.complete(record.token, 'done')).toBeUndefined();
    const kinds = service.audit('qa').map((event) => event.kind);
    expect(kinds).toEqual(['mint', 'accept', 'input', 'complete']);
    expect(service.recording(record.token)?.events).toHaveLength(4);
  });

  it('rejects expired links and wakes waiters', async () => {
    let at = 0;
    const service = createTakeoverService(() => at);
    const record = service.mint('qa', 'Verify the login');
    const waited = service.wait(record.token);
    at = record.expiresAt + 1;
    await expect(waited).resolves.toMatchObject({ state: 'expired', reason: 'expired' });
    expect(service.accept(record.token)).toBeUndefined();
    expect(service.complete(record.token, 'done')).toBeUndefined();
    expect(service.audit('qa').map((event) => event.kind)).toContain('expire');
  });

  it('supersedes a previous pending handoff for the same bot', () => {
    const service = createTakeoverService();
    const first = service.mint('qa', 'First');
    const second = service.mint('qa', 'Second');
    expect(service.describe(first.token)?.state).toBe('expired');
    expect(service.describe(second.token)?.state).toBe('pending');
  });

  it('keeps instructions and tokens out of the audit trail', () => {
    const service = createTakeoverService();
    const sentinel = 'SENTINEL-HANDOFF-SECRET-5581';
    const record = service.mint('qa', `Log in with ${sentinel}`);
    service.recordInput('qa', 'type chars=8');
    service.accept(record.token);
    service.complete(record.token, 'failed');
    const trail = JSON.stringify(service.audit('qa'));
    expect(trail).not.toContain(sentinel);
    expect(trail).not.toContain(record.token);
    expect(trail).toContain('reason=failed');
  });

  it('aborts waits on signal', async () => {
    const service = createTakeoverService();
    const record = service.mint('qa', 'Verify');
    const controller = new AbortController();
    const waited = service.wait(record.token, controller.signal);
    controller.abort(new Error('gone'));
    await expect(waited).rejects.toThrow('gone');
    expect(vi.fn()).toHaveBeenCalledTimes(0);
  });
});
