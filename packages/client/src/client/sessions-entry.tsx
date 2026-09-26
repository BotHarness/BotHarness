import { useEffect, useState, useSyncExternalStore, type ReactElement } from 'react';

import { Tag } from '@deepseek-ai/dsh-client-ui-primitives';

import type { ChannelSidebarEntryProps } from './channel-sidebar.js';
import { useClientState } from './bot-sidebar.js';
import { formatRelativeTime } from './labels.js';
import { personaBotSessionRows, type NativeSessionSummary } from './session-rows.js';

export interface NativeSessionCatalog {
  subscribe(listener: () => void): () => void;
  getSnapshot(): {
    ids: readonly string[];
    byId: Readonly<Record<string, NativeSessionSummary>>;
  };
}

function workspaceName(path: string | undefined): string | undefined {
  return path?.split(/[\\/]/u).filter(Boolean).at(-1);
}

export function SessionsEntry({
  botSlug,
  actions,
  t,
  nativeSessions,
}: ChannelSidebarEntryProps & { nativeSessions: NativeSessionCatalog }): ReactElement {
  const owned = useClientState().sessions;
  const native = useSyncExternalStore(
    nativeSessions.subscribe,
    nativeSessions.getSnapshot,
    nativeSessions.getSnapshot,
  );
  const [view, setView] = useState<'current' | 'all'>('current');
  const signature = native.ids
    .map((id) => `${id}:${native.byId[id]?.running === true ? '1' : '0'}`)
    .join('|');
  useEffect(() => {
    if (botSlug !== undefined) void actions.refreshSessions(botSlug);
  }, [actions, botSlug, signature]);
  const rows = personaBotSessionRows(owned.items, native.byId, view);
  const statusLabel = {
    running: t('sessions.status.running'),
    stopping: t('sessions.status.stopping'),
    attention: t('sessions.status.attention'),
    stopped: t('sessions.status.stopped'),
    idle: t('sessions.status.idle'),
    unavailable: t('sessions.status.unavailable'),
  } as const;
  return (
    <div className="bh-sessions">
      <div className="bh-session-view" role="group" aria-label={t('sessions.view')}>
        <button type="button" aria-pressed={view === 'current'} onClick={() => setView('current')}>
          {t('sessions.current')}
        </button>
        <button type="button" aria-pressed={view === 'all'} onClick={() => setView('all')}>
          {t('sessions.all')}
        </button>
      </div>
      {owned.status === 'loading' ? <div className="bh-note">{t('sessions.loading')}</div> : null}
      {owned.status === 'error' && owned.error !== undefined ? (
        <div className="bh-error">{t('sessions.error', { error: owned.error })}</div>
      ) : null}
      {owned.status === 'ready' && rows.length === 0 ? (
        <div className="bh-note">{t('sessions.empty')}</div>
      ) : null}
      {rows.map((row) => (
        <button
          key={row.sessionId}
          type="button"
          className="bh-session-row"
          title={row.cwd}
          disabled={native.byId[row.sessionId] === undefined}
          onClick={() => actions.openSession(row.sessionId)}
        >
          <div className="bh-session-title">{row.title}</div>
          <div className="bh-session-meta">
            <Tag tone="neutral">
              {row.role === 'orchestrator'
                ? t('sessions.role.orchestrator')
                : t('sessions.role.assignment')}
            </Tag>
            <span className={`bh-session-status bh-session-status-${row.status}`}>
              {statusLabel[row.status]}
            </span>
          </div>
          <div className="bh-session-meta">
            <span>{workspaceName(row.cwd) ?? t('sessions.workspace.unknown')}</span>
            <span>{formatRelativeTime(row.updatedAt, Date.now(), t)}</span>
          </div>
        </button>
      ))}
    </div>
  );
}
