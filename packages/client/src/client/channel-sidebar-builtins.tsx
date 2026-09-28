import { useEffect, useRef, useState, useSyncExternalStore, type ReactElement } from 'react';

import {
  Button,
  IconEllipsisOutlineRegular,
  Input,
  Menu,
  Tag,
  Tooltip,
  type MenuEntry,
} from '@deepseek-ai/dsh-client-ui-primitives';

import type { BotModePrefs } from './bot-mode-prefs.js';
import { WorkspaceGrantsEntry } from './workspace-grants-entry.js';
import { useClientState } from './bot-sidebar.js';
import type { ChannelSidebarEntry, ChannelSidebarEntryProps } from './channel-sidebar.js';
import { formatRelativeTime } from './labels.js';
import { MemoryEntry } from './memory-entry.js';
import { MemoryFilesEntry } from './memory-files-entry.js';
import { MemoryRefreshHeaderAction } from './memory-header-action.js';
import { Modal } from './modal.js';
import { GroupAvatarCropModal } from './group-avatar-crop.js';
import { MembersEntry, MembersHeaderAction } from './group-member-controls.js';
import {
  SessionsEntry,
  SessionsHeaderAction,
  type NativeSessionCatalog,
} from './sessions-entry.js';
import type { BotHarnessTranslate } from './locale.js';
import type { BotAttentionItem } from './store.js';

const inactiveSubscribe = (): (() => void) => () => {};

function GroupManagementEntry({ actions, t }: ChannelSidebarEntryProps): ReactElement {
  const state = useClientState();
  const group = state.conversation.channel;
  const [name, setName] = useState(group?.name ?? '');
  const [cropFile, setCropFile] = useState<File>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => setName(group?.name ?? ''), [group?.id, group?.name]);
  useEffect(() => {
    setCropFile(undefined);
    setError(false);
  }, [group?.id]);
  if (group?.type !== 'group') return <></>;
  const apply = async (result: Promise<boolean>): Promise<boolean> => {
    setBusy(true);
    try {
      const ok = await result;
      setError(!ok);
      return ok;
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="bh-group-management">
      <div className="bh-group-setting">
        <div className="bh-group-invitations-title">{t('group.avatar')}</div>
        <div className="bh-group-avatar-setting">
          {group.avatar ? <img src={group.avatar} alt="" /> : <span aria-hidden="true">#</span>}
          <label className="bh-group-manage-button">
            {t('group.avatarChoose')}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              disabled={busy}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (file) setCropFile(file);
                event.currentTarget.value = '';
              }}
            />
          </label>
          {group.avatar ? (
            <button
              type="button"
              className="bh-group-manage-button"
              disabled={busy}
              onClick={() => void apply(actions.setGroupAvatar(group.id, null))}
            >
              {t('group.avatarRemove')}
            </button>
          ) : null}
        </div>
      </div>
      <form
        className="bh-group-setting"
        onSubmit={(event) => {
          event.preventDefault();
          if (name.trim() !== group.name) void apply(actions.renameChannel(group.id, name.trim()));
        }}
      >
        <label htmlFor="bh-group-name">{t('group.name')}</label>
        <div className="bh-group-setting-row">
          <Input
            id="bh-group-name"
            value={name}
            maxLength={120}
            onChange={(event) => setName(event.target.value)}
          />
          <button
            type="submit"
            className="bh-group-manage-button"
            disabled={busy || !name.trim() || name.trim() === group.name}
          >
            {t('group.save')}
          </button>
        </div>
      </form>
      {cropFile ? (
        <GroupAvatarCropModal
          file={cropFile}
          t={t}
          onClose={() => setCropFile(undefined)}
          onSave={(avatar) => apply(actions.setGroupAvatar(group.id, avatar))}
        />
      ) : null}
      {error ? (
        <div className="bh-error" role="alert">
          {t('members.error')}
        </div>
      ) : null}
    </div>
  );
}

function GroupManagementHeaderAction({
  actions,
  t,
  channelId,
}: ChannelSidebarEntryProps): ReactElement {
  const group = useClientState().conversation.channel;
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    setMenuOpen(false);
    setConfirmOpen(false);
  }, [channelId]);
  if (group?.type !== 'group' || group.id !== channelId) return <></>;
  const items: readonly MenuEntry[] = [{ id: 'disband', label: t('members.delete') }];
  const disband = async (): Promise<void> => {
    setBusy(true);
    try {
      if (await actions.deleteGroupChannel(group.id)) setConfirmOpen(false);
      else setError(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Menu
        open={menuOpen}
        portal
        dense
        align="end"
        anchor={
          <Tooltip label={t('group.more')} side="bottom" delayMs={500}>
            <button
              type="button"
              className="bh-channel-sidebar-entry-action"
              aria-label={t('group.more')}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((value) => !value)}
            >
              <IconEllipsisOutlineRegular size={16} />
            </button>
          </Tooltip>
        }
        items={items}
        onSelect={() => {
          setMenuOpen(false);
          setConfirmOpen(true);
        }}
        onClose={() => setMenuOpen(false)}
      />
      {confirmOpen ? (
        <Modal
          open
          onClose={() => setConfirmOpen(false)}
          closeLabel={t('common.close')}
          title={t('members.delete')}
          description={t('members.deleteConfirm', { name: group.name })}
          footer={
            <>
              <Button variant="outline" onClick={() => setConfirmOpen(false)}>
                {t('common.cancel')}
              </Button>
              <Button variant="primary" disabled={busy} onClick={() => void disband()}>
                {t('members.delete')}
              </Button>
            </>
          }
        >
          {error ? (
            <div className="bh-error" role="alert">
              {t('members.error')}
            </div>
          ) : null}
        </Modal>
      ) : null}
    </>
  );
}

function MembersBadge(): ReactElement {
  return <Tag tone="neutral">{useClientState().conversation.channel?.members.length ?? 0}</Tag>;
}

function BotInboxItemRow({
  item,
  actions,
  t,
}: {
  item: BotAttentionItem;
  actions: ChannelSidebarEntryProps['actions'];
  t: BotHarnessTranslate;
}): ReactElement {
  const author =
    item.sourceKind === 'assignment-report'
      ? t('inbox.assignment')
      : item.authorKind === 'human'
        ? t('main.author.human')
        : item.authorKind === 'bot'
          ? (item.authorBotSlug ?? t('inbox.bot'))
          : t('inbox.system');
  const open = async (): Promise<void> => {
    if (!item.sourceAvailable) return;
    if (item.assignmentSessionId !== undefined) {
      await actions.openSession(item.assignmentSessionId);
      return;
    }
    if (item.sourceChannelId === undefined || item.sourceMessageId === undefined) return;
    await actions.openChannel(item.sourceChannelId);
    await actions.openAround(item.sourceChannelId, item.sourceMessageId);
  };
  return (
    <button
      type="button"
      className="bh-inbox-item"
      disabled={!item.sourceAvailable}
      onClick={() => void open()}
    >
      <span className="bh-inbox-item-top">
        <span>{author}</span>
        {item.assignmentReportState === undefined ? null : (
          <Tag tone="neutral">{t(`inbox.report.${item.assignmentReportState}`)}</Tag>
        )}
        <Tag tone="neutral">{t(`inbox.state.${item.state}`)}</Tag>
      </span>
      <span className="bh-inbox-item-summary">{item.summary || t('inbox.system')}</span>
      <span className="bh-inbox-item-meta">
        {formatRelativeTime(Date.parse(item.createdAt), Date.now(), t)}
        {!item.sourceAvailable ? ` · ${t('inbox.sourceUnavailable')}` : ''}
      </span>
    </button>
  );
}

function BotInboxGroup({
  name,
  items,
  actions,
  t,
}: {
  name: string;
  items: BotAttentionItem[];
  actions: ChannelSidebarEntryProps['actions'];
  t: BotHarnessTranslate;
}): ReactElement {
  const active = items.filter((item) => item.state !== 'handled' && item.state !== 'ignored');
  const history = items.filter((item) => item.state === 'handled' || item.state === 'ignored');
  const activeSignature = active
    .map((item) => item.id + ':' + item.state)
    .sort()
    .join('|');
  const previousActiveSignature = useRef(activeSignature);
  const [expanded, setExpanded] = useState(active.length > 0);
  useEffect(() => {
    if (activeSignature !== previousActiveSignature.current) {
      if (active.length > 0) setExpanded(true);
      previousActiveSignature.current = activeSignature;
    }
  }, [activeSignature, active.length]);
  return (
    <details
      className="bh-inbox-group"
      open={expanded}
      onToggle={(event) => setExpanded(event.currentTarget.open)}
    >
      <summary className="bh-inbox-group-head">
        <span title={name}>{name}</span>
        <Tag tone="neutral">{items.length}</Tag>
      </summary>
      {active.map((item) => (
        <BotInboxItemRow key={item.id} item={item} actions={actions} t={t} />
      ))}
      {history.length > 0 ? (
        <details className="bh-inbox-history">
          <summary>{t('inbox.handledHistory', { count: history.length })}</summary>
          {history.map((item) => (
            <BotInboxItemRow key={item.id} item={item} actions={actions} t={t} />
          ))}
        </details>
      ) : null}
    </details>
  );
}
function BotInboxEntry({ actions, t, botSlug }: ChannelSidebarEntryProps): ReactElement {
  const inbox = useClientState().botInbox;
  const groups = new Map<string, { name: string; items: BotAttentionItem[] }>();
  for (const item of inbox.items) {
    const key =
      item.assignmentSessionId === undefined
        ? (item.sourceChannelId ?? `system:${item.reason}`)
        : `assignment:${item.assignmentSessionId}`;
    const group = groups.get(key) ?? {
      name:
        item.assignmentPurpose ??
        item.sourceChannelName ??
        item.sourceChannelId ??
        t(item.assignmentSessionId === undefined ? 'inbox.system' : 'inbox.assignment'),
      items: [],
    };
    group.items.push(item);
    groups.set(key, group);
  }
  return (
    <>
      {inbox.status === 'loading' ? <div className="bh-note">{t('inbox.loading')}</div> : null}
      {inbox.status === 'error' ? (
        <div className="bh-error" role="alert">
          {t('inbox.error', { error: inbox.error ?? '' })}
        </div>
      ) : null}
      {[...groups.entries()].map(([key, group]) => (
        <BotInboxGroup key={key} name={group.name} items={group.items} actions={actions} t={t} />
      ))}
      {inbox.nextCursor !== undefined && botSlug !== undefined ? (
        <button
          type="button"
          className="bh-group-manage-button"
          onClick={() => void actions.loadMoreBotInbox(botSlug)}
        >
          {t('inbox.more')}
        </button>
      ) : null}
    </>
  );
}

function BotInboxBadge(): ReactElement {
  const items = useClientState().botInbox.items;
  return (
    <Tag tone="neutral">
      {items.filter((item) => item.state !== 'handled' && item.state !== 'ignored').length}
    </Tag>
  );
}

/** Entries BotHarness itself contributes to the Channel sidebar. */
export function createChannelSidebarBuiltins(
  t: BotHarnessTranslate,
  prefs?: BotModePrefs,
  nativeSessions: NativeSessionCatalog = {
    subscribe: inactiveSubscribe,
    getSnapshot: () => ({ ids: [], byId: {} }),
  },
): readonly ChannelSidebarEntry[] {
  function SessionsWithNative(props: ChannelSidebarEntryProps): ReactElement {
    return <SessionsEntry {...props} nativeSessions={nativeSessions} />;
  }

  function WorkspaceGrantsWithPrefs(props: ChannelSidebarEntryProps): ReactElement {
    const developerMode = useSyncExternalStore(
      prefs?.source.subscribe ?? inactiveSubscribe,
      () => prefs?.source.getSnapshot().developerMode ?? false,
    );
    return <WorkspaceGrantsEntry {...props} developerMode={developerMode} />;
  }
  function MemoryEvolutionEntry(props: ChannelSidebarEntryProps): ReactElement {
    return <MemoryEntry {...props} showFiles={false} />;
  }
  return [
    {
      id: 'memory-files',
      label: t('entry.memoryFiles'),
      order: 5,
      scope: 'personabot',
      component: MemoryFilesEntry,
      headerAction: MemoryRefreshHeaderAction,
    },
    {
      id: 'memory-evolution',
      label: t('entry.memoryEvolution'),
      order: 6,
      scope: 'personabot',
      component: MemoryEvolutionEntry,
      headerAction: MemoryRefreshHeaderAction,
    },
    {
      id: 'sessions',
      label: t('entry.sessions'),
      order: 10,
      scope: 'personabot',
      component: SessionsWithNative,
      headerAction: SessionsHeaderAction,
    },
    {
      id: 'bot-inbox',
      label: t('entry.botInbox'),
      order: 15,
      scope: 'personabot',
      component: BotInboxEntry,
      badge: BotInboxBadge,
      visible: (state) =>
        state.botInbox.status === 'loading' ||
        state.botInbox.status === 'error' ||
        state.botInbox.items.length > 0,
    },
    {
      id: 'workspace-grants',
      label: t('entry.workspaceGrants'),
      order: 20,
      scope: 'personabot',
      component: WorkspaceGrantsWithPrefs,
    },
    {
      id: 'members',
      label: t('entry.members'),
      order: 10,
      scope: 'channel',
      component: MembersEntry,
      headerAction: MembersHeaderAction,
      badge: MembersBadge,
    },
    {
      id: 'group-management',
      label: t('entry.groupManagement'),
      order: 20,
      scope: 'channel',
      component: GroupManagementEntry,
      headerAction: GroupManagementHeaderAction,
      visible: (state) => state.conversation.channel?.type === 'group',
    },
  ];
}
