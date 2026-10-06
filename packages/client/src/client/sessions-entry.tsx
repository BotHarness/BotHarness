import { useSyncExternalStore, type ReactElement } from 'react';

import { IconChevronDownOutlineRegular, Tag } from '@deepseek-ai/dsh-client-ui-primitives';

import type { ChannelSidebarEntryProps } from './channel-sidebar.js';
import { useClientState } from './bot-sidebar.js';
import { formatRelativeTime } from './labels.js';
import { LoadingSkeleton } from './loading-skeleton.js';
import {
  groupSessionRowsByWorkspace,
  personaBotSessionRows,
  type NativeSessionSummary,
  type PersonaBotSessionRow,
} from './session-rows.js';
import {
  sessionViewPreferenceSnapshot,
  subscribeSessionViewPreference,
  updateSessionViewPreference,
} from './session-view-prefs.js';
import { useMountedResource } from './mounted-resource.js';
import { SidebarCardList, SidebarCardRow } from './sidebar-card.js';

const STATUS_TONE = {
  running: 'success',
  stopping: 'warning',
  attention: 'danger',
  stopped: 'quiet',
  idle: 'outline',
  unavailable: 'quiet',
} as const;

export interface NativeSessionCatalog {
  refresh?(): Promise<void>;
  subscribe(listener: () => void): () => void;
  getSnapshot(): {
    ids: readonly string[];
    byId: Readonly<Record<string, NativeSessionSummary>>;
  };
}

function workspaceName(path: string | undefined): string | undefined {
  return path?.split(/[\\/]/u).filter(Boolean).at(-1);
}

function useSessionViewPreference(botSlug: string) {
  return useSyncExternalStore(
    (listener) => subscribeSessionViewPreference(botSlug, listener),
    () => sessionViewPreferenceSnapshot(botSlug),
    () => sessionViewPreferenceSnapshot(botSlug),
  );
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
  const slug = botSlug ?? '';
  const preference = useSessionViewPreference(slug);
  const signature = native.ids
    .map((id) => id + ':' + (native.byId[id]?.running === true ? '1' : '0'))
    .join('|');

  const mount = useMountedResource<HTMLDivElement>(() => {
    if (botSlug !== undefined) void actions.refreshSessions(botSlug);
  }, [actions, botSlug, signature]);

  const toggleWorkspace = (key: string): void => {
    updateSessionViewPreference(slug, (current) => ({
      ...current,
      collapsedWorkspaces: current.collapsedWorkspaces.includes(key)
        ? current.collapsedWorkspaces.filter((item) => item !== key)
        : [...current.collapsedWorkspaces, key],
    }));
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
  const renderRow = (row: PersonaBotSessionRow, showWorkspace: boolean): ReactElement => {
    const role =
      row.role === 'orchestrator' ? t('sessions.role.orchestrator') : t('sessions.role.assignment');
    return (
      <SidebarCardRow
        key={row.sessionId}
        icon={row.role === 'orchestrator' ? 'bot' : 'list-checks'}
        iconLabel={role}
        title={row.title}
        hint={row.cwd}
        mainClassName="bh-session-row"
        state={row.status}
        muted={native.byId[row.sessionId] === undefined}
        disabled={native.byId[row.sessionId] === undefined}
        onClick={() => void actions.openSession(row.sessionId)}
        chips={
          <>
            <Tag tone="neutral">{role}</Tag>
            <Tag tone={STATUS_TONE[row.status]}>{statusLabel[row.status]}</Tag>
            {row.assignmentAccessMode === 'danger-full-access' ? (
              <span title={t('sessions.access.dangerDetails')}>
                <Tag tone="warning">{t('sessions.access.danger')}</Tag>
              </span>
            ) : null}
          </>
        }
        meta={
          <>
            {showWorkspace ? (
              <span>{workspaceName(row.cwd) ?? t('sessions.workspace.unknown')}</span>
            ) : null}
            <span>{formatRelativeTime(row.updatedAt, Date.now(), t)}</span>
          </>
        }
      />
    );
  };

  return (
    <div className="bh-sessions" ref={mount}>
      {owned.status === 'loading' && rows.length === 0 ? (
        <LoadingSkeleton kind="sidebar" label={t('sessions.loading')} />
      ) : null}
      {owned.status === 'error' && owned.error !== undefined ? (
        <div className="bh-error">{t('sessions.error', { error: owned.error })}</div>
      ) : null}
      {owned.status === 'ready' && rows.length === 0 ? (
        <div className="bh-note">{t('sessions.empty')}</div>
      ) : null}
      {preference.layout === 'flat' ? (
        rows.length === 0 ? null : (
          <SidebarCardList label={t('entry.sessions')}>
            {rows.map((row) => renderRow(row, true))}
          </SidebarCardList>
        )
      ) : (
        groups.map((group) => {
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
                <SidebarCardList label={group.name ?? t('sessions.workspace.unknown')}>
                  {group.rows.map((row) => renderRow(row, false))}
                </SidebarCardList>
              ) : null}
            </section>
          );
        })
      )}
    </div>
  );
}

export function SessionsEntry(
  props: ChannelSidebarEntryProps & { nativeSessions: NativeSessionCatalog },
): ReactElement {
  return <SessionsPanel key={props.botSlug ?? 'none'} {...props} />;
}
