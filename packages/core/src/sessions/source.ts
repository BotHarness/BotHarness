/**
 * Structural view of the DSH session store (`ctx.sessions`) as consumed by the
 * BotHarness Host activity tracker. The shape is intentionally minimal: `@deepseek-ai/dsh-session`
 * types are not a dependency of this package.
 */
export interface DshSessionEvent {
  type: string;
  time: number;
  data: unknown;
}

export interface DshSessionHeader {
  cwd?: string;
  createdAt: number;
  /** The Session this one was forked from, when DSH recorded seed lineage. */
  parentSession?: string;
  /** DSH's coarse classification for a subagent child Session. */
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
