export interface IdleWatcherOptions {
  readonly idleMs: number | (() => number);
  readonly onIdle: () => void | Promise<void>;
  readonly now?: () => number;
}

export interface IdleWatcher {
  touch(): void;
  isIdle(): boolean;
  tick(): void;
}

export function createIdleWatcher(options: IdleWatcherOptions): IdleWatcher {
  const now = options.now ?? (() => Date.now());
  const idleMs =
    typeof options.idleMs === 'function' ? options.idleMs : () => options.idleMs as number;
  let lastActivity = now();
  let fired = false;

  return {
    touch(): void {
      lastActivity = now();
      fired = false;
    },
    isIdle(): boolean {
      return now() - lastActivity >= idleMs();
    },
    tick(): void {
      if (fired || !this.isIdle()) return;
      fired = true;
      void options.onIdle();
    },
  };
}
