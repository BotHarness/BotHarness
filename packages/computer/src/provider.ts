/**
 * The Computer Provider seam: one implementation owns the Execution World a
 * profile-scoped Computer runs in. Providers translate lifecycle calls into a
 * concrete runtime (v1: a local Docker container) and report readiness without
 * throwing for a missing runtime.
 * @module @botharness/computer/provider
 */

export interface ComputerRuntimeResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

/** Runs one argv array to completion. Injected so providers stay testable. */
export interface ComputerRuntimeRunner {
  run(argv: readonly string[]): Promise<ComputerRuntimeResult>;
  /** Optional streaming variant used to surface long-run progress (e.g. image pulls). */
  runStreaming?(
    argv: readonly string[],
    onChunk: (chunk: string) => void,
  ): Promise<ComputerRuntimeResult>;
}

export interface ComputerRuntimeProbe {
  readonly available: boolean;
  /** Human-readable reason when unavailable, e.g. "docker is not installed". */
  readonly detail?: string;
}

export type ComputerState = 'absent' | 'stopped' | 'running' | 'failed';

/** In-flight lifecycle phase for progress reporting; `idle` means nothing is running. */
export type ComputerPhase = 'idle' | 'pulling' | 'starting' | 'running' | 'stopping' | 'failed';

/** Best-effort progress for a long-running operation. */
export interface ComputerProgress {
  /** 0-100 when the provider can estimate it; absent means indeterminate. */
  readonly percent?: number;
  /** Latest raw runtime line, for users who want the terminal view. */
  readonly text?: string;
}

export interface ComputerStatus {
  readonly state: ComputerState;
  /** Present while a lifecycle operation is in flight or has failed. */
  readonly phase?: ComputerPhase;
  /** Failure or diagnostic detail for the panel; never throws for absence. */
  readonly detail?: string;
  /** Present while a long operation reports progress. */
  readonly progress?: ComputerProgress;
}

export interface ComputerProvider {
  readonly name: string;
  /** Checks whether this provider's runtime exists on the Host, without mutating it. */
  probe(): Promise<ComputerRuntimeProbe>;
  status(): Promise<ComputerStatus>;
  start(): Promise<void>;
  stop(): Promise<void>;
  /** Same-origin path the viewer proxies to, when the Computer is running. */
  upstream(): URL | undefined;
}
