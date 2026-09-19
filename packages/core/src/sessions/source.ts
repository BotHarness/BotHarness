/**
 * Structural view of the DSH session store (`ctx.sessions`) as consumed by the
 * client bridge. The shape is intentionally minimal: `@deepseek-ai/dsh-session`
 * types are not a dependency of this package.
 */
export interface DshSessionEvent {
  type: string;
  time: number;
  data: unknown;
}

export interface DshSession {
  id: string;
  header: { cwd?: string; createdAt: number };
  snapshotEvents(): readonly DshSessionEvent[];
}

export interface DshSessionStore {
  list(): readonly DshSession[];
}

export interface SessionSummary {
  id: string;
  title: string;
  cwd: string;
  updatedAt: string;
}

export interface BotSessionSource {
  list(): readonly SessionSummary[];
}

export const SESSION_TITLE_MAX_CHARS = 60;

function userMessageText(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const content = (value as { content?: unknown }).content;
  if (!Array.isArray(content)) return undefined;
  for (const block of content) {
    if (typeof block !== 'object' || block === null) continue;
    const record = block as { type?: unknown; text?: unknown };
    if (
      record.type === 'text' &&
      typeof record.text === 'string' &&
      record.text.trim().length > 0
    ) {
      return record.text;
    }
  }
  return undefined;
}

export function sessionTitle(events: readonly DshSessionEvent[]): string {
  for (const event of events) {
    if (event.type !== 'user/message') continue;
    const text = userMessageText(event.data);
    if (text === undefined) continue;
    const line = text.trim().replace(/\s+/gu, ' ');
    return line.length > SESSION_TITLE_MAX_CHARS
      ? `${line.slice(0, SESSION_TITLE_MAX_CHARS)}…`
      : line;
  }
  return '';
}

export function isInsideWorkspace(cwd: string, workspace: string): boolean {
  const target = cwd.trim().replace(/[\\/]+$/u, '');
  const root = workspace.trim().replace(/[\\/]+$/u, '');
  if (target.length === 0 || root.length === 0) return false;
  if (target === root) return true;
  return target.startsWith(`${root}/`) || target.startsWith(`${root}\\`);
}

export function summarizeSession(session: DshSession): SessionSummary | undefined {
  const cwd = session.header.cwd?.trim();
  if (cwd === undefined || cwd.length === 0) return undefined;
  const events = session.snapshotEvents();
  const last = events[events.length - 1];
  return {
    id: session.id,
    title: sessionTitle(events),
    cwd,
    updatedAt: new Date(last?.time ?? session.header.createdAt).toISOString(),
  };
}

export function createDshSessionSource(store: DshSessionStore): BotSessionSource {
  return {
    list: () => store.list().flatMap((session) => summarizeSession(session) ?? []),
  };
}
