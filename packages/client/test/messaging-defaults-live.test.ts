import { expect, it, vi } from 'vitest';
import { subscribeMessagingDefaults } from '../src/client/messaging-defaults-live.js';
it('shares one roster transport and releases it only when the last mounted consumer leaves', () => {
  const streams: Events[] = [];
  class Events extends EventTarget {
    closed = false;
    constructor() {
      super();
      streams.push(this);
    }
    close() {
      this.closed = true;
    }
  }
  vi.stubGlobal('EventSource', Events);
  const first = vi.fn(),
    second = vi.fn();
  const stopFirst = subscribeMessagingDefaults(first),
    stopSecond = subscribeMessagingDefaults(second);
  try {
    expect(streams).toHaveLength(1);
    streams[0]!.dispatchEvent(new Event('roster/changed'));
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    stopFirst();
    expect(streams[0]!.closed).toBe(false);
    streams[0]!.dispatchEvent(new Event('open'));
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(2);
  } finally {
    stopSecond();
    vi.unstubAllGlobals();
  }
  expect(streams[0]!.closed).toBe(true);
});
