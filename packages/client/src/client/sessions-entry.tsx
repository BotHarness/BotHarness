import { useEffect, useState, useSyncExternalStore, type ReactElement } from 'react';

import {
  IconCheckOutlineRegular,
  IconChevronDownOutlineRegular,
  IconEllipsisOutlineRegular,
  Menu,
  Tag,
  Tooltip,
  type MenuEntry,
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
  sessionViewPreferenceSnapshot,
  subscribeSessionViewPreference,
  updateSessionViewPreference,
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

function useSessionViewPreference(botSlug: string) {
  return useSyncExternalStore(
    (listener) => subscribeSessionViewPreference(botSlug, listener),
    () => sessionViewPreferenceSnapshot(botSlug),
    () => sessionViewPreferenceSnapshot(botSlug),
  );
}

export function SessionsHeaderAction({ botSlug, t }: ChannelSidebarEntryProps): ReactElement {
  const [open, setOpen] = useState(false);
  const slug = botSlug ?? '';
  const preference = useSessionViewPreference(slug);
  const items: MenuEntry[] = [
    { type: 'label', id: 'scope-label', text: t('sessions.view') },
    {
      id: 'scope-current',
      label: t('sessions.current'),
      icon: preference.scope === 'current' ? <IconCheckOutlineRegular /> : undefined,
    },
    {
      id: 'scope-all',
      label: t('sessions.all'),
      icon: preference.scope === 'all' ? <IconCheckOutlineRegular /> : undefined,
    },
    { type: 'separator', id: 'layout-separator' },
    { type: 'label', id: 'layout-label', text: t('sessions.layout') },
    {
      id: 'layout-flat',
      label: t('sessions.layout.flat'),
      icon: preference.layout === 'flat' ? <IconCheckOutlineRegular /> : undefined,
    },
    {
      id: 'layout-workspace',
      label: t('sessions.layout.workspace'),
      icon: preference.layout === 'workspace' ? <IconCheckOutlineRegular /> : undefined,
    },
  ];
  return (
    <Menu
      open={open}
      portal
      dense
      align="end"
      anchor={
        <Tooltip label={t('sessions.menu')} side="bottom" delayMs={500}>
          <button
            type="button"
            className="bh-channel-sidebar-entry-action"
            aria-label={t('sessions.menu')}
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
          >
            <IconEllipsisOutlineRegular size={16} />
          </button>
        </Tooltip>
      }
      items={items}
      onSelect={(id) => {
        if (id === 'scope-current' || id === 'scope-all') {
          updateSessionViewPreference(slug, (current) => ({
            ...current,
            scope: id === 'scope-current' ? 'current' : 'all',
          }));
        } else if (id === 'layout-flat' || id === 'layout-workspace') {
          updateSessionViewPreference(slug, (current) => ({
            ...current,
            layout: id === 'layout-flat' ? 'flat' : 'workspace',
          }));
        }
        setOpen(false);
      }}
      onClose={() => setOpen(false)}
    />
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

  useEffect(() => {
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
