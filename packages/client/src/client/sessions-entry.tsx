import { useEffect, useId, useState, useSyncExternalStore, type ReactElement } from 'react';

import {
  IconChevronDownOutlineRegular,
  SegmentedControl,
  Tag,
} from '@deepseek-ai/dsh-client-ui-primitives';

import type { ChannelSidebarEntryProps } from './channel-sidebar.js';
import { useClientState } from './bot-sidebar.js';
import { formatRelativeTime } from './labels.js';
import {
  groupSessionRowsByWorkspace,
  personaBotSessionRows,
  type NativeSessionSummary,
  type PersonaBotSessionRow,
} from './session-rows.js';
import {
  readSessionViewPreference,
  writeSessionViewPreference,
  type SessionViewPreference,
} from './session-view-prefs.js';

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

function SessionsPanel({
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
  const [preference, setPreference] = useState(() => readSessionViewPreference(botSlug ?? ''));
  const scopeId = useId();
  const layoutId = useId();
  const signature = native.ids
    .map((id) => id + ':' + (native.byId[id]?.running === true ? '1' : '0'))
    .join('|');

  useEffect(() => {
    if (botSlug !== undefined) void actions.refreshSessions(botSlug);
  }, [actions, botSlug, signature]);

  const updatePreference = (next: SessionViewPreference): void => {
    setPreference(next);
    if (botSlug !== undefined) writeSessionViewPreference(botSlug, next);
  };
  const toggleWorkspace = (key: string): void => {
    const collapsed = preference.collapsedWorkspaces.includes(key)
      ? preference.collapsedWorkspaces.filter((item) => item !== key)
      : [...preference.collapsedWorkspaces, key];
    updatePreference({ ...preference, collapsedWorkspaces: collapsed });
  };
  const rows = personaBotSessionRows(owned.items, native.byId, preference.scope);
  const groups = groupSessionRowsByWorkspace(rows);
  const statusLabel = {
    running: t('sessions.status.running'),
    stopping: t('sessions.status.stopping'),
    attention: t('sessions.status.attention'),
    stopped: t('sessions.status.stopped'),
    idle: t('sessions.status.idle'),
    unavailable: t('sessions.status.unavailable'),
  } as const;
  const renderRow = (row: PersonaBotSessionRow, showWorkspace: boolean): ReactElement => (
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
        <span className={'bh-session-status bh-session-status-' + row.status}>
          {statusLabel[row.status]}
        </span>
      </div>
      <div className="bh-session-meta">
        {showWorkspace ? (
          <span>{workspaceName(row.cwd) ?? t('sessions.workspace.unknown')}</span>
        ) : null}
        <span>{formatRelativeTime(row.updatedAt, Date.now(), t)}</span>
      </div>
    </button>
  );

  return (
    <div className="bh-sessions">
      <div className="bh-session-controls">
        <SegmentedControl
          id={scopeId}
          label={t('sessions.view')}
          value={preference.scope}
          options={[
            { value: 'current', label: t('sessions.current') },
            { value: 'all', label: t('sessions.all') },
          ]}
          onChange={(scope) => updatePreference({ ...preference, scope })}
        />
        <SegmentedControl
          id={layoutId}
          label={t('sessions.layout')}
          value={preference.layout}
          options={[
            { value: 'flat', label: t('sessions.layout.flat') },
            { value: 'workspace', label: t('sessions.layout.workspace') },
          ]}
          onChange={(layout) => updatePreference({ ...preference, layout })}
        />
      </div>
      {owned.status === 'loading' ? <div className="bh-note">{t('sessions.loading')}</div> : null}
      {owned.status === 'error' && owned.error !== undefined ? (
        <div className="bh-error">{t('sessions.error', { error: owned.error })}</div>
      ) : null}
      {owned.status === 'ready' && rows.length === 0 ? (
        <div className="bh-note">{t('sessions.empty')}</div>
      ) : null}
      {preference.layout === 'flat'
        ? rows.map((row) => renderRow(row, true))
        : groups.map((group) => {
            const expanded = !preference.collapsedWorkspaces.includes(group.key);
            return (
              <section key={group.key} className="bh-session-workspace-group">
                <button
                  type="button"
                  className="bh-session-workspace-heading"
                  title={group.path}
                  aria-expanded={expanded}
                  onClick={() => toggleWorkspace(group.key)}
                >
                  <IconChevronDownOutlineRegular
                    size={14}
                    className={expanded ? '' : 'bh-session-workspace-chevron-collapsed'}
                  />
                  <span className="bh-session-workspace-name">
                    {group.name ?? t('sessions.workspace.unknown')}
                  </span>
                  <span className="bh-session-workspace-count">{group.rows.length}</span>
                </button>
                {expanded ? (
                  <div className="bh-session-workspace-rows">
                    {group.rows.map((row) => renderRow(row, false))}
                  </div>
                ) : null}
              </section>
            );
          })}
    </div>
  );
}

export function SessionsEntry(
  props: ChannelSidebarEntryProps & { nativeSessions: NativeSessionCatalog },
): ReactElement {
  return <SessionsPanel key={props.botSlug ?? 'none'} {...props} />;
}
