import { describe, expect, it } from 'vitest';

import {
  createDshSessionSource,
  isInsideWorkspace,
  SESSION_TITLE_MAX_CHARS,
  sessionTitle,
  summarizeSession,
  type DshSession,
  type DshSessionEvent,
} from '../src/sessions/source.js';

function event(type: string, time: number, data: unknown): DshSessionEvent {
  return { type, time, data };
}

function session(overrides: Partial<DshSession> = {}): DshSession {
  const events = overrides.snapshotEvents?.() ?? [];
  return {
    id: 'session-1',
    header: { cwd: '/srv/ada', createdAt: 1_700_000_000_000 },
    snapshotEvents: () => events,
    ...overrides,
  };
}

describe('session source', () => {
  it('titles a session from its first user text and flattens whitespace', () => {
    const title = sessionTitle([
      event('turn/start', 1, {}),
      event('user/message', 2, {
        content: [
          { type: 'reasoning', text: 'hidden' },
          { type: 'text', text: '  文献综述：\n  RAG 评测方法  ' },
        ],
      }),
      event('assistant/message', 3, { content: [{ type: 'text', text: 'later' }] }),
    ]);

    expect(title).toBe('文献综述： RAG 评测方法');
  });

  it('truncates long titles and leaves missing text empty', () => {
    const long = sessionTitle([
      event('user/message', 1, { content: [{ type: 'text', text: 'x'.repeat(200) }] }),
    ]);
    expect(long.length).toBe(SESSION_TITLE_MAX_CHARS + 1);
    expect(long.endsWith('…')).toBe(true);

    expect(sessionTitle([event('user/message', 1, { content: [{ type: 'image' }] })])).toBe('');
    expect(sessionTitle([])).toBe('');
  });

  it('summarizes cwd, title, and the last event time', () => {
    const summary = summarizeSession(
      session({
        snapshotEvents: () => [
          event('user/message', 111, { content: [{ type: 'text', text: 'hello' }] }),
          event('turn/end', 222, {}),
        ],
      }),
    );

    expect(summary).toEqual({
      id: 'session-1',
      title: 'hello',
      cwd: '/srv/ada',
      updatedAt: new Date(222).toISOString(),
    });
  });

  it('falls back to createdAt and drops sessions without a cwd', () => {
    const empty = summarizeSession(session({ snapshotEvents: () => [] }));
    expect(empty?.updatedAt).toBe(new Date(1_700_000_000_000).toISOString());

    expect(summarizeSession(session({ header: { createdAt: 1 } }))).toBeUndefined();
    expect(summarizeSession(session({ header: { cwd: '   ', createdAt: 1 } }))).toBeUndefined();
  });

  it('maps the DSH store list into summaries and skips cwd-less sessions', () => {
    const source = createDshSessionSource({
      list: () => [session({ id: 'kept' }), session({ id: 'dropped', header: { createdAt: 1 } })],
    });

    expect(source.list().map((summary) => summary.id)).toEqual(['kept']);
  });
});

describe('workspace containment', () => {
  it('matches a workspace and its descendants at a path boundary', () => {
    expect(isInsideWorkspace('/srv/ada', '/srv/ada')).toBe(true);
    expect(isInsideWorkspace('/srv/ada/sub/dir', '/srv/ada')).toBe(true);
    expect(isInsideWorkspace('/srv/ada/', '/srv/ada')).toBe(true);
    expect(isInsideWorkspace('C:\\srv\\ada\\sub', 'C:\\srv\\ada')).toBe(true);
  });

  it('rejects siblings, prefix traps, and empty paths', () => {
    expect(isInsideWorkspace('/srv/ada-extra', '/srv/ada')).toBe(false);
    expect(isInsideWorkspace('/srv/other', '/srv/ada')).toBe(false);
    expect(isInsideWorkspace('/srv/ada', '')).toBe(false);
    expect(isInsideWorkspace('', '/srv/ada')).toBe(false);
  });
});
