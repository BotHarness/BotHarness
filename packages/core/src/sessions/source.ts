export interface DshSessionEvent {
  type: string;
  time: number;
  data: unknown;
}

export interface DshSessionHeader {
  cwd?: string;
  createdAt: number;

  parentSession?: string;

  origin?: 'subagent';
}

export interface DshSession {
  id: string;
  header: DshSessionHeader;
  snapshotEvents(): readonly DshSessionEvent[];
}

export interface DshSessionStore {
  list(): readonly DshSession[];
}
