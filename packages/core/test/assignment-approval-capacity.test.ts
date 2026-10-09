import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AssignmentApprovalCapacity,
  ASSIGNMENT_APPROVAL_WAIT_LIMIT,
} from '../src/runtime/assignment-approval-capacity.js';

function gate() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

function fixture() {
  let limit = 1;
  const active = new Set<string>();
  const revoked = new Set<string>();
  const descendants = new Set<string>();
  const changes = vi.fn();
  const count = () => [...active].filter((id) => !pool.released(id)).length;
  const pool = new AssignmentApprovalCapacity({
    valid: (id) => active.has(id) && !revoked.has(id),
    available: () => count() < limit,
    releaseAllowed: (id) => !descendants.has(id),
    changed: changes,
  });
  const signal = new AbortController().signal;
  const start = (id: string) => active.add(id);
  const stop = (id: string) => {
    active.delete(id);
    pool.forget(id);
  };
  return {
    pool,
    active,
    revoked,
    descendants,
    changes,
    count,
    start,
    stop,
    signal,
    limit: (value: number) => {
      limit = value;
    },
  };
}

afterEach(() => vi.useRealTimers());

describe('Assignment native approval capacity', () => {
  it('keeps the running permit when descendant quiescence is not established', async () => {
    const f = fixture();
    f.start('original');
    f.descendants.add('original');
    const wait = f.pool.begin('original', 'call', f.signal);
    expect(f.count()).toBe(1);
    expect(f.pool.state('original')).toBeUndefined();
    await wait.resume();
    wait.release();
    f.pool.close();
  });

  it('releases a quiescent original wait and reserves capacity before returning its decision', async () => {
    const f = fixture();
    f.start('original');
    const wait = f.pool.begin('original', 'call-original', f.signal);
    expect(f.count()).toBe(0);
    expect(f.pool.state('original')).toBe('waiting-human');
    expect(f.pool.stateForCall('original', 'call-original')).toBe('waiting-human');
    expect(f.pool.stateForCall('original', 'already-finished')).toBeUndefined();
    await wait.resume();
    wait.release();
    expect(f.count()).toBe(1);
    expect(f.pool.state('original')).toBeUndefined();
    f.stop('original');
    f.pool.close();
  });

  it('retains the running permit until another tool body in that Assignment finishes', async () => {
    const f = fixture();
    f.start('original');
    const body = gate();
    const entered = gate();
    const tool = f.pool.execute('original', 'other-call', Symbol(), f.signal, async () => {
      entered.release();
      await body.promise;
    });
    await entered.promise;
    const wait = f.pool.begin('original', 'approval-call', f.signal);
    expect(f.count()).toBe(1);
    expect(f.pool.state('original')).toBeUndefined();
    body.release();
    await tool;
    expect(f.count()).toBe(0);
    expect(f.pool.state('original')).toBe('waiting-human');
    wait.release();
    f.stop('original');
    f.pool.close();
  });

  it('keeps a prepared approved call reserved while a sibling waits, then releases after its body', async () => {
    const f = fixture();
    f.start('original');
    const first = f.pool.begin('original', 'first', f.signal);
    await first.resume();
    first.release();
    const second = f.pool.begin('original', 'second', f.signal);
    expect(f.count()).toBe(1);
    await f.pool.execute('original', 'first', Symbol(), f.signal, async () => {});
    expect(f.count()).toBe(0);
    second.release();
    f.stop('original');
    f.pool.close();
  });

  it('holds an accepted decision until a competing Assignment releases its permit', async () => {
    const f = fixture();
    f.start('original');
    const wait = f.pool.begin('original', 'original-call', f.signal);
    f.start('competitor');
    const resumed = vi.fn();
    const result = wait.resume().then(resumed);
    await Promise.resolve();
    expect(resumed).not.toHaveBeenCalled();
    expect(f.count()).toBe(1);
    expect(f.pool.state('original')).toBe('waiting-capacity');
    f.stop('competitor');
    await result;
    expect(resumed).toHaveBeenCalledTimes(1);
    expect(f.count()).toBe(1);
    wait.release();
    f.stop('original');
    f.pool.close();
  });

  it('serializes several accepted original waits without exceeding the running limit', async () => {
    const f = fixture();
    f.start('first');
    const first = f.pool.begin('first', 'one', f.signal);
    f.start('second');
    const second = f.pool.begin('second', 'two', f.signal);
    f.start('competitor');
    const firstResume = first.resume();
    const secondReady = vi.fn();
    const secondResume = second.resume().then(secondReady);
    f.stop('competitor');
    await firstResume;
    expect(f.count()).toBe(1);
    expect(secondReady).not.toHaveBeenCalled();
    first.release();
    f.stop('first');
    await secondResume;
    expect(f.count()).toBe(1);
    second.release();
    f.stop('second');
    f.pool.close();
  });

  it('observes a Human limit change while an original native wait needs capacity', async () => {
    vi.useFakeTimers();
    const f = fixture();
    f.start('original');
    const wait = f.pool.begin('original', 'call', f.signal);
    f.start('competitor');
    const result = wait.resume();
    f.limit(2);
    await vi.advanceTimersByTimeAsync(100);
    await result;
    expect(f.count()).toBe(2);
    wait.release();
    f.pool.close();
  });

  it('refuses revoked authority and abort while waiting for a permit', async () => {
    const f = fixture();
    f.start('original');
    const wait = f.pool.begin('original', 'call', f.signal);
    f.start('competitor');
    const result = wait.resume();
    const refused = expect(result).rejects.toThrow('authority');
    f.revoked.add('original');
    f.pool.changed();
    await refused;
    expect(f.pool.released('original')).toBe(true);
    wait.release();
    f.stop('original');
    f.start('abort');
    const controller = new AbortController();
    const abortWait = f.pool.begin('abort', 'call', controller.signal);
    const abortResult = abortWait.resume();
    const aborted = expect(abortResult).rejects.toThrow('cancelled');
    controller.abort(new Error('cancelled'));
    await aborted;
    abortWait.release();
    f.pool.close();
  });

  it('bounds waiting Sessions separately from running capacity and releases expired holders', () => {
    const f = fixture();
    const waits = [];
    for (let i = 0; i < ASSIGNMENT_APPROVAL_WAIT_LIMIT; i++) {
      f.start(String(i));
      waits.push(f.pool.begin(String(i), 'call', f.signal));
    }
    f.start('overflow');
    expect(() => f.pool.begin('overflow', 'call', f.signal)).toThrow('waiting capacity');
    expect(f.count()).toBe(1);
    waits[0]!.release();
    f.stop('0');
    const accepted = f.pool.begin('overflow', 'call', f.signal);
    expect(f.count()).toBe(0);
    accepted.release();
    f.pool.close();
  });

  it('reacquires before model continuation after a call is denied or aborted', async () => {
    const f = fixture();
    f.start('original');
    const wait = f.pool.begin('original', 'denied', f.signal);
    wait.release();
    f.start('competitor');
    const model = vi.fn();
    const nextStep = f.pool.ensure('original', f.signal).then(model);
    await Promise.resolve();
    expect(model).not.toHaveBeenCalled();
    f.stop('competitor');
    await nextStep;
    expect(f.count()).toBe(1);
    f.pool.close();
  });

  it('does not execute across a release during the acquisition microtask', async () => {
    const f = fixture();
    f.start('original');
    const body = vi.fn(async () => {});
    const tool = f.pool.execute('original', 'body', Symbol(), f.signal, body);
    const wait = f.pool.begin('original', 'ask', f.signal);
    f.start('competitor');
    await Promise.resolve();
    expect(body).not.toHaveBeenCalled();
    f.stop('competitor');
    await tool;
    expect(body).toHaveBeenCalledTimes(1);
    expect(f.count()).toBe(0);
    wait.release();
    f.pool.close();
  });

  it('ends capacity waits on disposal and never resurrects the old call', async () => {
    const f = fixture();
    f.start('original');
    const wait = f.pool.begin('original', 'call', f.signal);
    f.start('competitor');
    const refused = expect(wait.resume()).rejects.toThrow('ended');
    f.pool.close();
    await refused;
    await expect(wait.resume()).rejects.toThrow();
    expect(() => f.pool.begin('original', 'call', f.signal)).toThrow('authority');
  });

  it('does not reuse an old lease when the same Session starts another live execution', async () => {
    const f = fixture();
    f.start('original');
    const old = f.pool.begin('original', 'call', f.signal);
    f.pool.forget('original');
    const current = f.pool.begin('original', 'call', f.signal);
    await expect(old.resume()).rejects.toThrow('ended');
    await current.resume();
    expect(f.count()).toBe(1);
    old.release();
    current.release();
    f.pool.close();
  });
});
