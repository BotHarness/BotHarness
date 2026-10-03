import type { ExternalSource } from '../../../core/src/messaging/inbound.js';
import { useRef, useState, useSyncExternalStore, type ReactElement } from 'react';

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
import { LoadingSkeleton } from './loading-skeleton.js';
import { MemoryEntry } from './memory-entry.js';
import { MemoryFilesEntry } from './memory-files-entry.js';
import { MemoryRefreshHeaderAction } from './memory-header-action.js';
import { MemoryDisplaySettings, SessionsDisplaySettings } from './channel-sidebar-settings.js';
import { Modal } from './modal.js';
import { ExternalSourceContent } from './external-source-content.js';
import { GroupAvatarCropModal } from './group-avatar-crop.js';
import { MembersEntry, MembersHeaderAction } from './group-member-controls.js';
import { SessionsEntry, type NativeSessionCatalog } from './sessions-entry.js';
import type { BotHarnessTranslate } from './locale.js';
import type { BotAttentionItem, ChannelSummary } from './store.js';

const inactiveSubscribe = (): (() => void) => () => {};

function GroupManagementEntry(props: ChannelSidebarEntryProps): ReactElement {
  const group = useClientState().conversation.channel;
  if (group?.type !== 'group') return <></>;
  return <GroupManagementForChannel key={group.id} {...props} group={group} />;
}

function GroupManagementForChannel({
  actions,
  t,
  group,
}: ChannelSidebarEntryProps & { group: ChannelSummary }): ReactElement {
  const [nameState, setNameState] = useState({ source: group.name, draft: group.name });
  if (nameState.source !== group.name) {
    setNameState({ source: group.name, draft: group.name });
  }
  const name = nameState.source === group.name ? nameState.draft : group.name;
  const [cropFile, setCropFile] = useState<File>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
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
            onChange={(event) => setNameState({ source: group.name, draft: event.target.value })}
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

function GroupManagementHeaderAction(props: ChannelSidebarEntryProps): ReactElement {
  return <GroupManagementHeaderForChannel key={props.channelId} {...props} />;
}

function GroupManagementHeaderForChannel({
  actions,
  t,
  channelId,
}: ChannelSidebarEntryProps): ReactElement {
  const group = useClientState().conversation.channel;
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
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
  const externalRequest = useRef(0);
  const [externalOpen, setExternalOpen] = useState(false);
  const [external, setExternal] = useState<ExternalSource>();
  const [externalError, setExternalError] = useState(false);
  const [fileBusy, setFileBusy] = useState<string>();
  const [fileError, setFileError] = useState(false);
  const fileRequest = useRef<AbortController>();
  const download = async (attachmentId: string, name: string): Promise<void> => {
    if (fileBusy !== undefined) return;
    const controller = new AbortController();
    fileRequest.current = controller;
    setFileBusy(attachmentId);
    setFileError(false);
    try {
      const response = await fetch(
        '/api/botharness/attachment?' +
          new URLSearchParams({
            slug: item.botSlug,
            sourceEventId: item.id,
            attachmentId,
          }),
        {
          credentials: 'same-origin',
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(45000)]),
        },
      );
      if (!response.ok) throw new Error('Download unavailable');
      const blob = await response.blob();
      controller.signal.throwIfAborted();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = name;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      if (!controller.signal.aborted) setFileError(true);
    } finally {
      if (fileRequest.current === controller) {
        fileRequest.current = undefined;
        setFileBusy(undefined);
      }
    }
  };
  const memoryChange = item.sourceKind === 'memory-change';
  const summary = memoryChange
    ? item.summary
        .replace(/^Memory changed since your last turn:\s*/u, '')
        .replace(/^Working Memory changes since your last turn:\s*/u, '')
        .replace(/^\?\? /u, '')
    : item.summary;
  const author =
    item.externalOrigin !== undefined
      ? `${item.externalOrigin.platform} · ${item.externalOrigin.senderName ? `${item.externalOrigin.senderName} (${item.externalOrigin.senderId})` : item.externalOrigin.senderId}`
      : memoryChange
        ? t('inbox.memoryChange')
        : item.sourceKind === 'assignment-report'
          ? t('inbox.assignment')
          : item.authorKind === 'human'
            ? t('main.author.human')
            : item.authorKind === 'bot'
              ? (item.authorBotSlug ?? t('inbox.bot'))
              : t('inbox.system');
  const open = async (): Promise<void> => {
    if (!item.sourceAvailable) return;
    if (item.externalOrigin !== undefined) {
      const request = ++externalRequest.current;
      setExternal(undefined);
      setExternalOpen(true);
      setExternalError(false);
      setFileError(false);
      try {
        const source = await actions.messagingSource(item.botSlug, item.id);
        if (request === externalRequest.current) setExternal(source);
      } catch {
        if (request === externalRequest.current) setExternalError(true);
      }
      return;
    }
    if (item.assignmentSessionId !== undefined) {
      await actions.openSession(item.assignmentSessionId);
      return;
    }
    if (item.sourceChannelId === undefined || item.sourceMessageId === undefined) return;
    await actions.openChannel(item.sourceChannelId);
    await actions.openAround(item.sourceChannelId, item.sourceMessageId);
  };
  const content = (
    <>
      <span className="bh-inbox-item-top">
        <span>{author}</span>
        {item.assignmentReportState === undefined ? null : (
          <Tag tone="neutral">{t(`inbox.report.${item.assignmentReportState}`)}</Tag>
        )}
        <Tag tone="neutral">{t(`inbox.state.${item.state}`)}</Tag>
      </span>
      <span className="bh-inbox-item-summary">{summary || t('inbox.system')}</span>
      <span className="bh-inbox-item-meta">
        {item.externalOrigin === undefined
          ? ''
          : `${item.externalOrigin.accountName} · ${item.externalOrigin.conversationName} · `}
        {formatRelativeTime(Date.parse(item.createdAt), Date.now(), t)}
        {!memoryChange && !item.sourceAvailable ? ` · ${t('inbox.sourceUnavailable')}` : ''}
      </span>
    </>
  );
  if (memoryChange) return <div className="bh-inbox-item bh-inbox-item-info">{content}</div>;
  return (
    <>
      <button
        type="button"
        className="bh-inbox-item"
        disabled={!item.sourceAvailable}
        onClick={() => void open()}
      >
        {content}
      </button>
      {externalOpen ? (
        <Modal
          open
          onClose={() => {
            ++externalRequest.current;
            fileRequest.current?.abort();
            setExternalOpen(false);
          }}
          title={t('im.sourceTitle')}
          className="bh-external-source-modal"
          closeLabel={t('common.close')}
        >
          {externalError ? (
            <p role="alert">{t('im.sourceError')}</p>
          ) : external === undefined ? (
            <p>{t('im.sourceLoading')}</p>
          ) : (
            <ExternalSourceContent source={external} t={t}>
              {external.event.attachments?.map((file) => (
                <div className="bh-external-source-file" key={file.id}>
                  <span>{file.name}</span>
                  <Button
                    disabled={fileBusy !== undefined}
                    onClick={() => void download(file.id, file.name)}
                  >
                    {fileBusy === file.id ? t('im.fileDownloading') : t('im.fileDownload')}
                  </Button>
                </div>
              ))}
              {fileError ? <p role="alert">{t('im.fileError')}</p> : null}
            </ExternalSourceContent>
          )}
        </Modal>
      ) : null}
    </>
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
  const [expansion, setExpansion] = useState({
    signature: activeSignature,
    expanded: active.length > 0,
  });
  const expanded =
    activeSignature !== expansion.signature && active.length > 0 ? true : expansion.expanded;
  return (
    <details
      className="bh-inbox-group"
      open={expanded}
      onToggle={(event) =>
        setExpansion({ signature: activeSignature, expanded: event.currentTarget.open })
      }
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
        ? (item.sourceChannelId ??
          (item.externalOrigin === undefined
            ? `system:${item.reason}`
            : `external:${item.externalOrigin.platform}:${item.externalOrigin.conversationId}`))
        : `assignment:${item.assignmentSessionId}`;
    const group = groups.get(key) ?? {
      name:
        item.assignmentPurpose ??
        item.externalOrigin?.conversationName ??
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
      {inbox.status === 'loading' && inbox.items.length === 0 ? (
        <LoadingSkeleton kind="sidebar" label={t('inbox.loading')} />
      ) : null}
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
      icon: 'files',
      label: t('entry.memoryFiles'),
      order: 5,
      scope: 'personabot',
      component: MemoryFilesEntry,
      headerAction: MemoryRefreshHeaderAction,
    },
    {
      id: 'memory-evolution',
      icon: 'git-branch',
      label: t('entry.memoryEvolution'),
      order: 6,
      scope: 'personabot',
      component: MemoryEvolutionEntry,
      headerAction: MemoryRefreshHeaderAction,
      settings: MemoryDisplaySettings,
    },
    {
      id: 'sessions',
      icon: 'messages-square',
      label: t('entry.sessions'),
      order: 10,
      scope: 'personabot',
      component: SessionsWithNative,
      settings: SessionsDisplaySettings,
    },
    {
      id: 'bot-inbox',
      icon: 'inbox',
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
      icon: 'folder-key',
      label: t('entry.workspaceGrants'),
      order: 20,
      scope: 'personabot',
      component: WorkspaceGrantsWithPrefs,
    },
    {
      id: 'members',
      icon: 'users',
      label: t('entry.members'),
      order: 10,
      scope: 'channel',
      component: MembersEntry,
      headerAction: MembersHeaderAction,
      badge: MembersBadge,
    },
    {
      id: 'group-management',
      icon: 'settings-2',
      label: t('entry.groupManagement'),
      order: 20,
      scope: 'channel',
      component: GroupManagementEntry,
      headerAction: GroupManagementHeaderAction,
      visible: (state) => state.conversation.channel?.type === 'group',
    },
  ];
}
