/**
 * Stops an idle Computer without stopping a busy one. Activity is reported by
 * lifecycle calls and viewer traffic; the watcher owns no timers of its own —
 * the plugin ticks it from a single interval so disposal is trivial.
 * @module @botharness/computer/idle
 */

export interface IdleWatcherOptions {
  readonly idleMs: number;
  readonly onIdle: () => void | Promise<void>;
  readonly now?: () => number;
}

export interface IdleWatcher {
  /** Reports activity; a stopped Computer stays stopped until started again. */
  touch(): void;
  /** Reports whether the Computer has been idle longer than `idleMs`. */
  isIdle(): boolean;
  /** Ticks the watcher; calls `onIdle` at most once per idle period. */
  tick(): void;
}

export function createIdleWatcher(options: IdleWatcherOptions): IdleWatcher {
  const now = options.now ?? (() => Date.now());
  let lastActivity = now();
  let fired = false;

  return {
    touch(): void {
      lastActivity = now();
      fired = false;
    },
    isIdle(): boolean {
      return now() - lastActivity >= options.idleMs;
    },
    tick(): void {
      if (fired || !this.isIdle()) return;
      fired = true;
      void options.onIdle();
    },
  };
}
