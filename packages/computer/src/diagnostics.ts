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

export const DIAGNOSTICS_LIMIT = 200;

export function createComputerDiagnostics(limit = DIAGNOSTICS_LIMIT): ComputerDiagnostics {
  const events: ComputerDiagnosticEvent[] = [];
  return {
    record(kind, detail) {
      events.push({ at: new Date().toISOString(), kind, detail });
      if (events.length > limit) events.splice(0, events.length - limit);
    },
    tail(count = limit) {
      const size = Math.max(0, Math.min(count, events.length));
      return events.slice(events.length - size);
    },
  };
}
