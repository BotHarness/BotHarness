export interface ComputerRuntimeResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface ComputerRuntimeRunner {
  run(argv: readonly string[]): Promise<ComputerRuntimeResult>;
  runStreaming?(
    argv: readonly string[],
    onChunk: (chunk: string) => void,
  ): Promise<ComputerRuntimeResult>;
}

export interface ComputerRuntimeProbe {
  readonly available: boolean;
  readonly detail?: string;
}

export type ComputerState = 'absent' | 'stopped' | 'running' | 'failed';

export type ComputerPhase =
  | 'idle'
  | 'pulling'
  | 'starting'
  | 'running'
  | 'stopping'
  | 'exporting'
  | 'importing'
  | 'failed';

export interface ComputerProgress {
  readonly percent?: number;
  readonly text?: string;
  readonly updatedAt?: number;
}

export interface ComputerStatus {
  readonly state: ComputerState;
  readonly phase?: ComputerPhase;
  readonly detail?: string;
  readonly progress?: ComputerProgress;
  readonly storage?: ComputerStorage;
}

export interface ComputerStorage {
  readonly kind: 'volume' | 'bind';
  readonly target: string;
  readonly ignoredReason?: string;
  readonly migrationHint?: string;
}

export interface ComputerProvider {
  readonly name: string;
  probe(): Promise<ComputerRuntimeProbe>;
  status(): Promise<ComputerStatus>;
  start(): Promise<void>;
  stop(): Promise<void>;
  upstream(): URL | undefined;
  exportTo?(destDir: string): Promise<string>;
  importFrom?(archive: string): Promise<void>;
}
