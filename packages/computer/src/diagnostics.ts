/**
 * Bounded, in-memory diagnostics for the Computer plugin: lifecycle initiators,
 * container state transitions, and viewer stream events. Process evidence for
 * Humans and agents — never durable authority, never secrets.
 * @module @botharness/computer/diagnostics
 */

export interface ComputerDiagnosticEvent {
  readonly at: string;
  readonly kind: 'lifecycle' | 'container' | 'viewer';
  readonly detail: string;
}

export interface ComputerDiagnostics {
  record(kind: ComputerDiagnosticEvent['kind'], detail: string): void;
  tail(limit?: number): readonly ComputerDiagnosticEvent[];
}

/** Durable drain for recorded events; failures never break recording. */
export interface ComputerDiagnosticsSink {
  write(event: ComputerDiagnosticEvent): void;
}

/** Durable row shape for the operational log database. */
export interface ComputerLogEntry {
  readonly plugin: string;
  readonly owner: string;
  readonly kind: string;
  readonly detail: string;
  readonly ts: number;
}

/**
 * Maps a ring event onto a log row. Unparseable timestamps fall back to now
 * rather than NaN — the row must stay sortable.
 */
export function toLogEntry(
  event: ComputerDiagnosticEvent,
  plugin: string,
  owner: string,
): ComputerLogEntry {
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

export function createComputerDiagnostics(
  limit = DIAGNOSTICS_LIMIT,
  sink?: ComputerDiagnosticsSink | undefined,
): ComputerDiagnostics {
  const events: ComputerDiagnosticEvent[] = [];
  return {
    record(kind, detail) {
      const event: ComputerDiagnosticEvent = { at: new Date().toISOString(), kind, detail };
      events.push(event);
      if (events.length > limit) events.splice(0, events.length - limit);
      try {
        sink?.write(event);
      } catch {
        // Persistence is best effort by design.
      }
    },
    tail(count = limit) {
      const size = Math.max(0, Math.min(count, events.length));
      return events.slice(events.length - size);
    },
  };
}
