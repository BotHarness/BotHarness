export interface ActivityTracker {
  touch(): void;
  isIdle(idleMs: number): boolean;
}

export function createActivityTracker(now: () => number = Date.now): ActivityTracker {
  let last = now();
  return {
    touch: () => {
      last = now();
    },
    isIdle: (idleMs) => now() - last >= idleMs,
  };
}
