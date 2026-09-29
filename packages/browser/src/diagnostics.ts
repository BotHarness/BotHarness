import type { LogOwnerScope } from '../../core/src/logs/log-db.js';

export interface BrowserDiagnosticEvent {
  readonly at: string;
  readonly kind: 'lifecycle' | 'browser-action';
  readonly detail: string;
}

export interface BrowserDiagnostics {
  record(kind: BrowserDiagnosticEvent['kind'], detail: string): void;
  tail(limit?: number): readonly BrowserDiagnosticEvent[];
}

export interface BrowserDiagnosticsSink {
  write(event: BrowserDiagnosticEvent): void;
}

export interface BrowserLogEntry {
  readonly plugin: string;
  readonly owner: LogOwnerScope;
  readonly kind: string;
  readonly detail: string;
  readonly ts: number;
}

export function toLogEntry(
  event: BrowserDiagnosticEvent,
  plugin: string,
  owner: LogOwnerScope,
): BrowserLogEntry {
  const ts = Date.parse(event.at);
  return {
    plugin,
    owner,
    kind: event.kind,
    detail: event.detail,
    ts: Number.isNaN(ts) ? Date.now() : ts,
  };
}

export const DIAGNOSTICS_LIMIT = 200;

export function createBrowserDiagnostics(
  limit = DIAGNOSTICS_LIMIT,
  sink?: BrowserDiagnosticsSink | undefined,
): BrowserDiagnostics {
  const events: BrowserDiagnosticEvent[] = [];
  return {
    record(kind, detail) {
      const event: BrowserDiagnosticEvent = { at: new Date().toISOString(), kind, detail };
      events.push(event);
      if (events.length > limit) events.splice(0, events.length - limit);
      try {
        sink?.write(event);
      } catch {}
    },
    tail(count = limit) {
      const size = Math.max(0, Math.min(count, events.length));
      return events.slice(events.length - size);
    },
  };
}
