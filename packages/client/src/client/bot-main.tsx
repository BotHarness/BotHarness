import { GroupChannelHeader } from './group-channel-header.js';
import { CompanionPin } from './window-companions-view.js';
import type { WindowCompanions } from './window-companions.js';
import { BridgeCallError, parseAllBotPreview } from './bridge.js';
import type { AllBotPreview, AllBotMention } from '../../../core/src/channels/all-bot-mention.js';
import { useCallback, useRef, useState, type ReactElement } from 'react';

import {
  IconAgentPresetOutlineRegular,
  IconCopyOutlineRegular,
  IconPanelLeftOutlineRegular,
  Menu,
  Tag,
  Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives';

import type { BridgeActions } from './actions.js';
import {
  uploadChannelAttachment,
  type MemoryWorkingChange,
  type ProfileActivity,
  type GroupProfileActivity,
} from './bridge.js';
import {
  PersonaBotAvatar,
  PersonaBotFacepile,
  personaBotPresentationSummary,
  type PersonaBotFacepileItem,
} from './avatar.js';
import { useClientState } from './bot-sidebar.js';
import {
  ChannelComposer,
  type ChannelComposerActivity,
  type ChannelComposerUpload,
} from './channel-composer.js';
import type { SelectedMention } from './mentions.js';
import type { SelectedChannelRef } from './channel-refs.js';
import { channelHumanName } from './actor-names.js';
import { HumanChannelNameMenu } from './human-channel-name.js';
import type { ChannelHumanMember } from './store.js';
import { ChannelMessageBody, type NativeChatFailureText } from './channel-message-body.js';
import { BridgeSourceAuthor } from './bridge-source-author.js';
import { ChannelDeliveryReceipt } from './channel-delivery-receipt.js';
import { MessageCopyAction } from './message-copy-action.js';
import { isBotDmChannel, isHumanReadOnlyDmChannel } from './channel-kind.js';
import { zhTranslate, type BotHarnessTranslate } from './locale.js';
import type { NativeSessionCatalog } from './sessions-entry.js';
import { ActivityCenterView } from './activity-center-view.js';
import type { ChannelSidebarRegistry } from './channel-sidebar.js';
import { ChannelSidebar, useChannelSidebar } from './channel-sidebar-view.js';
import { MemoryCommitView } from './memory-commit-view.js';
import { MemoryFileView, MemoryWorkingView } from './memory-current-view.js';
import { LoadingSkeleton } from './loading-skeleton.js';
import { groupChannelMessages, type MessageGroup } from './message-groups.js';
import { ProfilePopover, ProfileView } from './personabot-profile.js';
import { GroupProfilePopover, GroupProfileView } from './group-profile.js';
import { personaBotActivity } from './persona-activity.js';
import { groupComposerActivity } from './group-composer-activity.js';
import {
  EMPTY_PROFILE_CARDS,
  loadPinnedProfileCards,
  loadPinnedGroupProfileCards,
  savePinnedProfileCards,
  savePinnedGroupProfileCards,
  togglePinnedProfileCard,
  type ProfileCardRegistry,
} from './profile-cards.js';
import {
  store,
  type BotSummary,
  type ChannelMessage,
  type ChannelSummary,
  type ClientState,
} from './store.js';
import { useMountedResource } from './mounted-resource.js';
import type { ReleaseNotesController } from './release-notes.js';
import { ReleaseNotesAnnouncement } from './release-notes-view.js';
import type { TelemetryNoticeController } from './telemetry-notice.js';
import { TelemetryNotice } from './telemetry-notice-view.js';

export function committedMessageIds(messages: readonly ChannelMessage[]): Set<string> {
  return new Set(
    messages
      .filter(
        (message) =>
          message.pending !== true && message.streaming !== true && message.failed === undefined,
      )
      .map((message) => message.id),
  );
}

export function resolvedGrantRequestIds(messages: readonly ChannelMessage[]): Set<string> {
  const committed = committedMessageIds(messages);
  return new Set(
    messages
      .filter(
        (item) =>
          committed.has(item.id) &&
          item.author.kind === 'human' &&
          item.replyTo !== undefined &&
          item.grantRequestResolution?.requestMessageId === item.replyTo,
      )
      .map((item) => item.replyTo!)
      .concat(
        messages
          .filter((item) => committed.has(item.id) && item.grantRequestResolved === true)
          .map((item) => item.id),
      ),
  );
}

function memberName(bots: readonly BotSummary[], slug: string): string {
  return bots.find((bot) => bot.slug === slug)?.displayName ?? slug;
}

function authorLabel(
  message: ChannelMessage,
  bots: readonly BotSummary[],
  t: BotHarnessTranslate,
  humanName = 'Human',
): string {
  switch (message.author.kind) {
    case 'human':
      return humanName;
    case 'system':
      return t('main.author.system');
    case 'bot':
      return memberName(bots, message.author.slug);
    case 'bridged':
      return message.author.source;
  }
}

function clockTime(at: string): string {
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function Welcome({ state, t }: { state: ClientState; t: BotHarnessTranslate }): ReactElement {
  return (
    <div className="bh-root bh-main">
      <div className="bh-content">
        <div className="bh-placeholder">
          <IconAgentPresetOutlineRegular size={32} />
          <div className="bh-big">{t('main.welcome.title')}</div>
          <div>{t('main.welcome.hint')}</div>
          {state.bots.length === 0 ? <div className="bh-dim">{t('main.welcome.empty')}</div> : null}
        </div>
      </div>
    </div>
  );
}

interface MessageMenuRequest {
  message: ChannelMessage;
  x: number;
  y: number;
}

function ReplyQuote({
  humanName,
  message,
  bots,
  onJump,
  t,
}: {
  message: ChannelMessage;
  bots: readonly BotSummary[];
  humanName: string;
  onJump(messageId: string): void;
  t: BotHarnessTranslate;
}): ReactElement | null {
  const targetId = message.replyTo;
  if (targetId === undefined) return null;
  const preview = message.replyToPreview;
  if (preview === undefined || preview === null) {
    return (
      <div className="bh-bubble-reply bh-bubble-reply-unavailable">
        {t('message.replyUnavailable')}
      </div>
    );
  }
  return (
    <button
      type="button"
      className="bh-bubble-reply"
      onClick={() => onJump(targetId)}
      aria-label={t('message.replyJump', {
        author: authorLabel({ ...message, author: preview.author }, bots, t, humanName),
      })}
    >
      <span className="bh-bubble-reply-author">
        {authorLabel({ ...message, author: preview.author }, bots, t, humanName)}
      </span>
      <span className="bh-bubble-reply-body">{preview.body}</span>
    </button>
  );
}

function ReplyIcon(): ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M9 7 4 12l5 5M4 12h9a7 7 0 0 1 7 7"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function MessageGroupView({
  humanMembers = [],
  group,
  channelId,
  bots,
  focusMessageId,
  currentDmBotSlug,
  onContextMenu,
  onReply,
  onJumpReply,
  onRestoreFailed,
  actions,
  resolvedGrantRequests,
  toolApprovalDecisions,
  userQuestionResolutions,
  nativeChatT,
  t,
}: {
  humanMembers?: readonly ChannelHumanMember[];
  group: MessageGroup;
  channelId?: string | undefined;
  focusMessageId?: string | undefined;
  currentDmBotSlug?: string | undefined;
  bots: readonly BotSummary[];
  onContextMenu(message: ChannelMessage, x: number, y: number): void;
  onReply?: ((message: ChannelMessage) => void) | undefined;
  onRestoreFailed(message: ChannelMessage): void;
  onJumpReply(messageId: string): void;
  actions: BridgeActions;
  resolvedGrantRequests: ReadonlySet<string>;
  toolApprovalDecisions: ReadonlyMap<
    string,
    'allowed-once' | 'allowed-always-exact' | 'allowed-always-all' | 'rejected'
  >;
  userQuestionResolutions: ReadonlyMap<string, 'answered' | 'cancelled'>;
  t: BotHarnessTranslate;
  nativeChatT?: NativeChatFailureText | undefined;
}): ReactElement {
  const humanName = channelHumanName({ humanMembers: [...humanMembers] });
  const first = group.messages[0]!;
  const author = first.author;
  const human = author.kind === 'human';
  const authorBot =
    author.kind === 'bot' ? bots.find((candidate) => candidate.slug === author.slug) : undefined;
  const avatar =
    author.kind === 'bot' ? (
      <PersonaBotAvatar
        t={t}
        personaBotId={author.slug}
        name={authorBot?.displayName ?? author.slug}
        src={authorBot?.avatar}
        appearance={authorBot?.appearance}
        size={28}
        indicator={false}
      />
    ) : undefined;
  return (
    <div
      className={`bh-message-group${human ? ' bh-message-group-me' : ''}`}
      data-group-size={group.messages.length}
    >
      {author.kind !== 'bot' || avatar === undefined ? null : currentDmBotSlug === author.slug ? (
        <span className="bh-message-group-avatar">{avatar}</span>
      ) : (
        <button
          type="button"
          className="bh-message-group-avatar bh-message-group-avatar-link"
          aria-label={t('message.mention.openDm', { bot: authorBot?.displayName ?? author.slug })}
          onClick={() => void actions.openBot(author.slug)}
        >
          {avatar}
        </button>
      )}
      <div className="bh-message-stack">
        <div className="bh-message-identity">
          {first.bridgeOrigin ? (
            <BridgeSourceAuthor origin={first.bridgeOrigin} t={t} />
          ) : (
            <div className="bh-bubble-author">{authorLabel(first, bots, t, humanName)}</div>
          )}
          <time className="bh-bubble-time" dateTime={first.at}>
            {clockTime(first.at)}
          </time>
        </div>
        {group.messages.map((message, index) => {
          const position =
            group.messages.length === 1
              ? 'solo'
              : index === 0
                ? 'first'
                : index === group.messages.length - 1
                  ? 'last'
                  : 'middle';
          return (
            <div
              key={message.id}
              className={`bh-bubble-wrap${focusMessageId === message.id ? ' bh-bubble-focused' : ''}${message.failed === undefined ? '' : ' bh-bubble-wrap-failed'}`}
              data-message-id={message.id}
              onContextMenu={(event) => {
                event.preventDefault();
                onContextMenu(message, event.clientX, event.clientY);
              }}
            >
              <div
                className={`bh-bubble-surface${message.failed === undefined ? '' : ' bh-bubble-surface-failed'}`}
              >
                {message.failed === undefined ? null : (
                  <button
                    type="button"
                    className="bh-bubble-failed-action"
                    aria-label={t('message.failedRestore')}
                    title={message.failed}
                    onClick={() => onRestoreFailed(message)}
                  >
                    {t('message.failed')}
                  </button>
                )}
                <div
                  className={`bh-bubble${human ? ' bh-bubble-me' : ''}${message.pending === true || message.streaming === true ? ' bh-bubble-pending' : ''}${message.failed === undefined ? '' : ' bh-bubble-failed'}`}
                  data-group-position={position}
                >
                  <ReplyQuote
                    humanName={humanName}
                    message={message}
                    bots={bots}
                    onJump={onJumpReply}
                    t={t}
                  />
                  <ChannelMessageBody
                    message={message}
                    channelId={channelId}
                    t={t}
                    nativeChatT={nativeChatT}
                    actions={actions}
                    bots={bots}
                    humanMembers={humanMembers}
                    grantRequestResolved={resolvedGrantRequests.has(message.id)}
                    toolApprovalDecision={toolApprovalDecisions.get(message.id)}
                    userQuestionResolution={userQuestionResolutions.get(message.id)}
                  />
                  {message.pending === true || message.streaming === true ? (
                    <span className="bh-bubble-status" role="status">
                      {t(message.streaming === true ? 'message.generating' : 'message.sending')}
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="bh-bubble-side">
                <ChannelDeliveryReceipt
                  message={message}
                  bots={bots}
                  humanMembers={humanMembers}
                  t={t}
                />
                <div className="bh-bubble-meta">
                  <div className="bh-bubble-actions">
                    {onReply !== undefined &&
                    message.pending !== true &&
                    message.streaming !== true &&
                    message.failed === undefined ? (
                      <Tooltip label={t('message.reply')} side="top" portal delayMs={400}>
                        <button
                          type="button"
                          className="bh-bubble-action"
                          aria-label={t('message.reply')}
                          onClick={() => onReply(message)}
                        >
                          <ReplyIcon />
                        </button>
                      </Tooltip>
                    ) : null}
                    <MessageCopyAction body={message.body} t={t} />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MessageActionMenu({
  onLocate,
  onReply,
  request,
  onClose,
  t,
}: {
  onLocate(messageId: string): void;
  onReply(message: ChannelMessage): void;
  request: MessageMenuRequest;
  onClose(): void;
  t: BotHarnessTranslate;
}): ReactElement {
  const proxy = useRef<HTMLSpanElement | null>(null);
  const menuMount = useMountedResource<HTMLSpanElement>(() => {
    const timer = window.setTimeout(() => {
      const lists = document.querySelectorAll<HTMLElement>('div[role="menu"]');
      lists
        .item(lists.length - 1)
        ?.querySelector<HTMLButtonElement>('button:not(:disabled)')
        ?.focus();
    }, 0);
    return () => {
      window.clearTimeout(timer);
    };
  }, []);
  return (
    <span ref={menuMount} className="bh-menu-anchor" style={{ left: request.x, top: request.y }}>
      <Menu
        open
        portal
        dense
        autoFocus
        anchor={<span ref={proxy} aria-hidden="true" />}
        getAnchorRect={() => proxy.current?.getBoundingClientRect() ?? null}
        items={[
          ...(request.message.pending === true || request.message.streaming === true
            ? []
            : [{ id: 'reply', label: t('message.reply') }]),
          { id: 'locate', label: t('message.locate') },
          { id: 'copy', label: t('message.copy'), icon: <IconCopyOutlineRegular /> },
        ]}
        onSelect={(id) => {
          if (id === 'reply') onReply(request.message);
          else if (id === 'locate') onLocate(request.message.id);
          else if (id === 'copy') {
            void navigator.clipboard?.writeText(request.message.body);
          }
          onClose();
        }}
        onClose={onClose}
      />
    </span>
  );
}

function EmptyConversation({
  channel,
  bot,
  t,
}: {
  channel: ChannelSummary | undefined;
  bot: BotSummary | undefined;
  t: BotHarnessTranslate;
}): ReactElement {
  if (channel?.type === 'group') {
    return (
      <div className="bh-placeholder bh-chat-empty">
        <span className="bh-channel-mark" aria-hidden="true">
          {channel.avatar ? (
            <img className="bh-group-avatar-image" src={channel.avatar} alt="" />
          ) : (
            '#'
          )}
        </span>
        <div className="bh-big">{channel.name}</div>
        <div>{t('main.group.note')}</div>
      </div>
    );
  }
  return (
    <div className="bh-placeholder bh-chat-empty">
      {bot !== undefined ? (
        <PersonaBotAvatar
          t={t}
          personaBotId={bot.slug}
          name={bot.displayName}
          src={bot.avatar}
          appearance={bot.appearance}
          size={56}
          indicator={false}
        />
      ) : null}
      <div className="bh-big">
        {bot === undefined
          ? t('main.localChat')
          : t('main.localChat.with', { name: bot.displayName })}
      </div>
      <div>{t('main.localChat.hint')}</div>
    </div>
  );
}

function ConversationView({
  state,
  actions,
  companion,
  channelSidebar,
  profileCards = EMPTY_PROFILE_CARDS,
  nativeChatT,
  t,
}: {
  state: ClientState;
  actions: BridgeActions;
  companion?: WindowCompanions | undefined;
  channelSidebar: ChannelSidebarRegistry;
  nativeSessions?: NativeSessionCatalog;
  profileCards?: ProfileCardRegistry | undefined;
  nativeChatT?: NativeChatFailureText | undefined;
  t: BotHarnessTranslate;
}): ReactElement {
  const sidebar = useChannelSidebar(state);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [draft, setDraft] = useState('');
  const [allBotPreview, setAllBotPreview] = useState<AllBotPreview>();
  const [allBotNotice, setAllBotNotice] = useState<string>();
  const [mentionTokens, setMentionTokens] = useState<SelectedMention[]>([]);
  const [channelRefTokens, setChannelRefTokens] = useState<SelectedChannelRef[]>([]);
  const [selectedMemoryView, setSelectedMemoryView] = useState<
    { channelId: string } & (
      | { kind: 'commit'; sha: string }
      | { kind: 'file'; path: string }
      | { kind: 'working'; change: MemoryWorkingChange }
    )
  >();
  const chatScrollBeforeDiff = useRef(0);
  const [uploadItems, setUploadItems] = useState<ChannelComposerUpload[]>([]);
  const [restoreBlocked, setRestoreBlocked] = useState(false);
  const [restoreFocusSignal, setRestoreFocusSignal] = useState(0);
  const uploadControllers = useRef(new Map<string, AbortController>());
  const [replyTarget, setReplyTarget] = useState<ChannelMessage | undefined>();
  const submitting = useRef(false);
  const followingLatest = useRef(true);
  const activityOverlayPane = useRef<HTMLElement | null>(null);
  const resizeActivityOverlay = useCallback(
    (height: number): void => {
      const timeline = scrollRef.current;
      const pane = timeline?.closest<HTMLElement>('.bh-chat-pane') ?? activityOverlayPane.current;
      if (pane === null) return;
      activityOverlayPane.current = pane;
      const following =
        followingLatest.current && !store.getSnapshot().conversation.timeline.hasNewer;
      if (height > 0) pane.style.setProperty('--bh-activity-overlay-inset', `${height + 6}px`);
      else pane.style.removeProperty('--bh-activity-overlay-inset');
      if (following && timeline !== null) timeline.scrollTop = timeline.scrollHeight;
    },
    [store],
  );
  const prependAnchor = useRef<{
    firstId: string | undefined;
    y: number | undefined;
    top: number;
    height: number;
  } | null>(null);
  const lastRevision = useRef<number | undefined>(undefined);
  const readMarkTimer = useRef<number | undefined>(undefined);
  const [unseen, setUnseen] = useState(0);
  const [messageMenu, setMessageMenu] = useState<MessageMenuRequest | undefined>();
  const [profilePopoverOpen, setProfilePopoverOpen] = useState(false);
  const [profileViewOpen, setProfileViewOpen] = useState(
    state.selection?.kind === 'bot' && state.selection.profile === true,
  );
  const [profileActivity, setProfileActivity] = useState<ProfileActivity | undefined>(undefined);
  const [groupProfileActivity, setGroupProfileActivity] = useState<GroupProfileActivity>();
  const [pinnedProfileCards, setPinnedProfileCards] = useState<readonly string[]>(() =>
    loadPinnedProfileCards(),
  );
  const [pinnedGroupProfileCards, setPinnedGroupProfileCards] = useState<readonly string[]>(() =>
    loadPinnedGroupProfileCards(),
  );
  const profileTriggerRef = useRef<HTMLSpanElement | null>(null);
  const conversation = state.conversation;
  const channel = conversation.channel;
  const botNames = new Map(state.bots.map((member) => [member.slug, member.displayName]));
  const messages = conversation.messages;
  const displayMessages: ChannelMessage[] = [
    ...messages,
    ...(conversation.timeline.hasNewer ? [] : conversation.drafts).map((item) => ({
      id: item.draftId,
      at: '',
      author: { kind: 'bot' as const, slug: item.botSlug },
      body: item.body,
      streaming: true,
    })),
  ];
  const selection = state.selection;
  const bot =
    selection?.kind === 'bot'
      ? state.bots.find((candidate) => candidate.slug === selection.slug)
      : undefined;
  const botDm = isBotDmChannel(channel);
  const readOnlyDm = isHumanReadOnlyDmChannel(channel);
  const profileBot =
    channel?.type === 'dm' && channel.botSlug !== undefined
      ? state.bots.find((candidate) => candidate.slug === channel.botSlug)
      : undefined;
  const profileBotActivity =
    profileBot === undefined ? undefined : personaBotActivity(state, profileBot);
  const title =
    channel?.type === 'dm'
      ? botDm
        ? channel.members.map((slug) => memberName(state.bots, slug)).join(' ↔ ')
        : (bot?.displayName ??
          state.bots.find((candidate) => candidate.slug === channel.botSlug)?.displayName ??
          channel.name)
      : (channel?.name ?? bot?.displayName ?? t('main.group.title'));
  const botActivity = bot === undefined ? undefined : personaBotActivity(state, bot);
  const channelBots =
    channel !== undefined && (channel.type === 'group' || botDm)
      ? channel.members.flatMap((slug) => {
          const member = state.bots.find((candidate) => candidate.slug === slug);
          return member === undefined ? [] : [member];
        })
      : [];
  const channelFacepile: PersonaBotFacepileItem[] = channelBots.map((member) => ({
    personaBotId: member.slug,
    name: member.displayName,
    src: member.avatar,
    appearance: member.appearance,
    state: personaBotActivity(state, member),
    activity: member.activity,
    attention: member.attention,
    sessions: member.sessionActivity,
  }));
  const activeFacepile = channelFacepile.filter(
    (item) => item.state !== 'idle' || item.attention !== undefined,
  );
  const composerFacepile: PersonaBotFacepileItem[] =
    bot === undefined
      ? activeFacepile
      : botActivity === undefined || (botActivity === 'idle' && bot.attention === undefined)
        ? []
        : [
            {
              personaBotId: bot.slug,
              name: bot.displayName,
              src: bot.avatar,
              appearance: bot.appearance,
              state: botActivity,
              activity: bot.activity,
              attention: bot.attention,
              sessions: bot.sessionActivity,
            },
          ];
  const composerActivity: ChannelComposerActivity | undefined =
    channel?.type === 'group'
      ? groupComposerActivity(channelFacepile, t)
      : composerFacepile.length === 0
        ? undefined
        : {
            items: composerFacepile,
            summary:
              composerFacepile.length === 1
                ? `${composerFacepile[0]?.name ?? 'PersonaBot'} ${personaBotPresentationSummary(composerFacepile[0]?.state ?? 'idle', composerFacepile[0]?.activity, composerFacepile[0]?.attention, t)}`
                : t('main.activity.bots', { count: composerFacepile.length }),
          };
  const channelId = channel?.id;
  const activeMemoryView =
    selectedMemoryView?.channelId === channelId ? selectedMemoryView : undefined;
  const selectedMemoryCommitSha =
    activeMemoryView?.kind === 'commit' ? activeMemoryView.sha : undefined;
  const openMemoryView = (
    view:
      | { kind: 'commit'; sha: string }
      | { kind: 'file'; path: string }
      | { kind: 'working'; change: MemoryWorkingChange },
  ): void => {
    if (activeMemoryView === undefined)
      chatScrollBeforeDiff.current = scrollRef.current?.scrollTop ?? 0;
    setProfileViewOpen(false);
    if (channelId !== undefined) setSelectedMemoryView({ channelId, ...view });
  };
  const closeMemoryView = (): void => {
    setSelectedMemoryView(undefined);
    window.requestAnimationFrame(() => {
      if (scrollRef.current !== null) scrollRef.current.scrollTop = chatScrollBeforeDiff.current;
    });
  };
  const scheduleReadMark = (): void => {
    const element = scrollRef.current;
    if (channelId === undefined || element === null || conversation.status !== 'ready') return;
    const committedIds = committedMessageIds(messages);
    const viewport = element.getBoundingClientRect();
    const visible = Array.from(element.querySelectorAll<HTMLElement>('[data-message-id]'))
      .filter((candidate) => {
        const id = candidate.dataset['messageId'];
        if (id === undefined || !committedIds.has(id)) return false;
        const bounds = candidate.getBoundingClientRect();
        return bounds.top < viewport.bottom && bounds.bottom > viewport.top;
      })
      .at(-1);
    const messageId = visible?.dataset['messageId'];
    if (messageId === undefined) return;
    window.clearTimeout(readMarkTimer.current);
    readMarkTimer.current = window.setTimeout(() => {
      if (currentChannel.current !== channelId) return;
      void actions.markRead(channelId, messageId).catch((error: unknown) => {
        console.warn('botharness: channel read position failed', error);
      });
    }, 250);
  };

  const currentChannel = useRef(channelId);
  currentChannel.current = channelId;
  const previewRoster = channelBots
    .map((bot) => [bot.slug, bot.paused, bot.displayName].join(':'))
    .join('|');
  const allBotPreviewMount = useMountedResource<HTMLSpanElement>(() => {
    let cancelled = false;
    setAllBotPreview(undefined);
    if (channel?.type === 'group')
      void actions
        .allBotPreview(channel.id)
        .then((preview) => {
          if (!cancelled) setAllBotPreview(preview);
        })
        .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [channelId, previewRoster]);
  const conversationMount = useMountedResource<HTMLDivElement>(() => {
    setAllBotNotice(undefined);
    return () => {
      currentChannel.current = undefined;
      window.clearTimeout(readMarkTimer.current);
      for (const controller of uploadControllers.current.values()) controller.abort();
      uploadControllers.current.clear();
    };
  }, [channelId]);

  const profileMount = useMountedResource<HTMLDivElement>(() => {
    if (!profilePopoverOpen && !profileViewOpen) return;
    let cancelled = false;
    if (channelId !== undefined) {
      if (channel?.type === 'group')
        void actions.groupProfileActivity(channelId).then(
          (activity) => {
            if (!cancelled) setGroupProfileActivity(activity);
          },
          (error: unknown) => {
            console.warn('botharness: Group Profile activity failed', error);
          },
        );
      else
        void actions.profileActivity(channelId).then(
          (activity) => {
            if (!cancelled) setProfileActivity(activity);
          },
          (error: unknown) => {
            console.warn('botharness: Profile activity failed', error);
          },
        );
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (document.querySelector('[role="dialog"][aria-modal="true"]') !== null) return;
      event.preventDefault();
      if (profilePopoverOpen) setProfilePopoverOpen(false);
      else setProfileViewOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    const onPointerDown = (event: Event): void => {
      const target = event.target;
      if (target instanceof Node && profileTriggerRef.current?.contains(target) === true) return;
      setProfilePopoverOpen(false);
    };
    if (profilePopoverOpen) document.addEventListener('pointerdown', onPointerDown);
    return () => {
      cancelled = true;
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [actions, channel?.type, channelId, profilePopoverOpen, profileViewOpen]);

  const togglePinnedCard = (id: string): void => {
    setPinnedProfileCards((current) => {
      const next = togglePinnedProfileCard(current, id);
      savePinnedProfileCards(next);
      return next;
    });
  };
  const togglePinnedGroupCard = (id: string): void => {
    setPinnedGroupProfileCards((current) => {
      const next = togglePinnedProfileCard(current, id);
      savePinnedGroupProfileCards(next);
      return next;
    });
  };

  const loadOlderAtTop = (retry = false): void => {
    const element = scrollRef.current;
    if (
      element === null ||
      channelId === undefined ||
      !conversation.timeline.hasOlder ||
      conversation.timeline.loadingOlder ||
      (!retry && conversation.timeline.olderError !== undefined) ||
      prependAnchor.current !== null
    )
      return;
    prependAnchor.current = {
      firstId: messages[0]?.id,
      y: element.querySelector<HTMLElement>('[data-message-id]')?.getBoundingClientRect().top,
      top: element.scrollTop,
      height: element.scrollHeight,
    };
    void actions.loadOlder(channelId);
  };

  const loadNewerAtBottom = (): void => {
    if (
      channelId === undefined ||
      !conversation.timeline.hasNewer ||
      conversation.timeline.loadingNewer ||
      conversation.timeline.newerError !== undefined
    )
      return;
    void actions.loadNewer(channelId);
  };

  const timelineMount = useMountedResource<HTMLDivElement>(
    (element) => {
      scrollRef.current = element;
      if (conversation.timeline.olderError !== undefined) prependAnchor.current = null;
      if (conversation.status === 'ready') {
        if (conversation.focusMessageId !== undefined && conversation.timeline.hasNewer)
          followingLatest.current = false;
        const anchor = prependAnchor.current;
        if (anchor !== null && messages[0]?.id !== anchor.firstId) {
          const retained = Array.from(
            element.querySelectorAll<HTMLElement>('[data-message-id]'),
          ).find((candidate) => candidate.dataset['messageId'] === anchor.firstId);
          if (retained !== undefined && anchor.y !== undefined) {
            element.scrollTop += retained.getBoundingClientRect().top - anchor.y;
          } else {
            element.scrollTop = anchor.top + element.scrollHeight - anchor.height;
          }
          prependAnchor.current = null;
        } else if (followingLatest.current) {
          element.scrollTop = element.scrollHeight;
        }
        const previousRevision = lastRevision.current;
        if (
          previousRevision !== undefined &&
          conversation.revision > previousRevision &&
          !followingLatest.current
        ) {
          setUnseen((count) => count + conversation.revision - previousRevision);
        }
        lastRevision.current = conversation.revision;
      }
      const id = conversation.focusMessageId;
      let focusTimer: number | undefined;
      if (id !== undefined) {
        const target = Array.from(element.querySelectorAll<HTMLElement>('[data-message-id]')).find(
          (candidate) => candidate.dataset['messageId'] === id,
        );
        target?.scrollIntoView({ block: 'center' });
        focusTimer = window.setTimeout(() => {
          const current = store.getSnapshot().conversation;
          if (current.channel?.id === channelId && current.focusMessageId === id) {
            store.setConversation({ focusMessageId: undefined });
          }
        }, 2200);
      }
      const frame = window.requestAnimationFrame(() => {
        if (element.scrollHeight <= element.clientHeight + 1) {
          loadOlderAtTop();
          loadNewerAtBottom();
        }
        if (conversation.status === 'ready') scheduleReadMark();
      });
      return () => {
        window.cancelAnimationFrame(frame);
        window.clearTimeout(focusTimer);
        scrollRef.current = null;
      };
    },
    [
      actions,
      channelId,
      conversation.status,
      conversation.drafts,
      conversation.revision,
      conversation.focusMessageId,
      conversation.timeline.hasOlder,
      conversation.timeline.hasNewer,
      conversation.timeline.loadingOlder,
      conversation.timeline.loadingNewer,
      conversation.timeline.olderError,
      conversation.timeline.newerError,
      messages,
    ],
  );

  const onTimelineScroll = (): void => {
    const element = scrollRef.current;
    if (element === null) return;
    const atBottom = element.scrollHeight - element.scrollTop - element.clientHeight <= 80;
    followingLatest.current = atBottom && !conversation.timeline.hasNewer;
    if (followingLatest.current) setUnseen(0);
    scheduleReadMark();
    if (element.scrollTop <= 48) loadOlderAtTop();
    if (atBottom) loadNewerAtBottom();
  };

  const jumpToLatest = (): void => {
    followingLatest.current = true;
    setUnseen(0);
    if (conversation.timeline.hasNewer && channelId !== undefined) {
      void actions.openLatest(channelId).catch((error: unknown) => {
        console.warn('botharness: latest timeline reload failed', error);
      });
      return;
    }
    const element = scrollRef.current;
    if (element !== null) element.scrollTop = element.scrollHeight;
  };

  const startUpload = (item: ChannelComposerUpload): void => {
    const controller = new AbortController();
    uploadControllers.current.set(item.id, controller);
    setUploadItems((current) =>
      current.map((entry) =>
        entry.id === item.id ? { ...entry, status: 'uploading', error: undefined } : entry,
      ),
    );
    void uploadChannelAttachment(item.file, controller.signal, item.id)
      .then((ref) => {
        if (controller.signal.aborted) return;
        setUploadItems((current) =>
          current.map((entry) =>
            entry.id === item.id ? { ...entry, status: 'ready', ref } : entry,
          ),
        );
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setUploadItems((current) =>
          current.map((entry) =>
            entry.id === item.id
              ? {
                  ...entry,
                  status: 'error',
                  error: error instanceof Error ? error.message : String(error),
                }
              : entry,
          ),
        );
      })
      .finally(() => {
        if (uploadControllers.current.get(item.id) === controller)
          uploadControllers.current.delete(item.id);
      });
  };

  const addFiles = (files: File[]): void => {
    const available = Math.max(0, 10 - uploadItems.length);
    const added = files
      .slice(0, available)
      .map((file) => ({ id: crypto.randomUUID(), file, status: 'uploading' as const }));
    setUploadItems((current) => [...current, ...added]);
    for (const item of added) startUpload(item);
  };

  const submit = async (): Promise<void> => {
    const body = draft.trim();
    const leftTrim = draft.length - draft.trimStart().length;
    const submittedRefs = channelRefTokens.flatMap((token) => {
      const adjusted = { ...token, start: token.start - leftTrim, end: token.end - leftTrim };
      return adjusted.start >= 0 && body.slice(adjusted.start, adjusted.end) === '#' + token.label
        ? [adjusted]
        : [];
    });
    const submittedMentions = mentionTokens.flatMap((token) => {
      const adjusted = { ...token, start: token.start - leftTrim, end: token.end - leftTrim };
      return adjusted.start >= 0 && body.slice(adjusted.start, adjusted.end) === '@' + token.label
        ? [adjusted]
        : [];
    });
    const shortcut = submittedMentions.find((item) => item.kind === 'all-bots');
    const allBotMention: AllBotMention | undefined =
      shortcut?.kind === 'all-bots'
        ? {
            start: shortcut.start,
            end: shortcut.end,
            label: shortcut.label,
            preview: shortcut.preview,
          }
        : undefined;
    if (allBotMention?.preview.recipients.length === 0) return;
    if (
      (body.length === 0 && uploadItems.length === 0) ||
      uploadItems.some((item) => item.status !== 'ready' || item.ref === undefined) ||
      conversation.sending ||
      submitting.current
    )
      return;
    submitting.current = true;
    const viewport = scrollRef.current;
    followingLatest.current =
      viewport !== null &&
      !conversation.timeline.hasNewer &&
      viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight <= 80;
    if (followingLatest.current) setUnseen(0);
    const submittedFor = currentChannel.current;
    const submittedUploads = uploadItems;
    const previousFailures = new Set(
      store
        .getSnapshot()
        .conversation.messages.filter((item) => item.failed !== undefined)
        .map((item) => item.id),
    );
    setDraft('');
    setMentionTokens([]);
    setChannelRefTokens([]);
    setUploadItems([]);
    const submittedReplyTo = replyTarget?.id;
    try {
      const sent = await actions.send(
        body,
        submittedReplyTo,
        submittedUploads.flatMap((item) => (item.ref === undefined ? [] : [item.ref])),
        undefined,
        submittedMentions.filter((item) => item.kind !== 'all-bots'),
        submittedRefs,
        undefined,
        allBotMention,
      );
      if (sent) {
        setAllBotNotice(undefined);
        setReplyTarget((current) => (current?.id === submittedReplyTo ? undefined : current));
      } else if (currentChannel.current === submittedFor) {
        const failedEcho = store
          .getSnapshot()
          .conversation.messages.some(
            (item) => item.failed !== undefined && !previousFailures.has(item.id),
          );
        if (!failedEcho) {
          setDraft((current) => current || body);
          setMentionTokens((current) => (current.length > 0 ? current : submittedMentions));
          setChannelRefTokens((current) => (current.length > 0 ? current : submittedRefs));
          setUploadItems((current) => (current.length > 0 ? current : submittedUploads));
        }
      }
    } catch (error) {
      if (
        error instanceof BridgeCallError &&
        error.code === 'all-bot-preview-changed' &&
        currentChannel.current === submittedFor &&
        submittedFor !== undefined
      ) {
        const preview =
          parseAllBotPreview((error.details as { preview?: unknown } | undefined)?.preview) ??
          (await actions.allBotPreview(submittedFor).catch(() => undefined));
        if (currentChannel.current !== submittedFor) return;
        store.setConversation({ error: undefined });
        setAllBotNotice(t('composer.allBotsChanged'));
        setAllBotPreview(preview);
        setDraft((current) => current || body);
        setMentionTokens((current) =>
          current.length > 0
            ? current
            : submittedMentions.map((item) =>
                item.kind === 'all-bots' && preview !== undefined ? { ...item, preview } : item,
              ),
        );
        setChannelRefTokens((current) => (current.length > 0 ? current : submittedRefs));
        setUploadItems((current) => (current.length > 0 ? current : submittedUploads));
      } else throw error;
    } finally {
      submitting.current = false;
    }
  };

  return (
    <div ref={conversationMount} className="bh-root bh-main">
      <span ref={allBotPreviewMount} hidden />
      <div className="bh-chat-layout">
        <section className="bh-chat-pane">
          <div ref={profileMount} className="bh-topbar">
            {channel === undefined ? null : (
              <HumanChannelNameMenu key={channel.id} channel={channel} actions={actions} t={t} />
            )}
            {channel?.type === 'group' ? (
              <span className="bh-channel-island-wrap" ref={profileTriggerRef}>
                <GroupChannelHeader
                  channel={channel}
                  title={title}
                  members={channelFacepile}
                  companion={companion}
                  expanded={profilePopoverOpen}
                  t={t}
                  onOpenActivity={() => setProfilePopoverOpen(true)}
                  onToggleProfile={() => setProfilePopoverOpen((open) => !open)}
                />
                {profilePopoverOpen ? (
                  <GroupProfilePopover
                    members={channelFacepile}
                    channel={channel}
                    activity={
                      groupProfileActivity?.channelId === channel.id
                        ? groupProfileActivity
                        : undefined
                    }
                    cards={profileCards}
                    pinned={pinnedGroupProfileCards}
                    botNames={botNames}
                    t={t}
                    onExpand={() => {
                      setProfilePopoverOpen(false);
                      setSelectedMemoryView(undefined);
                      setProfileViewOpen(true);
                    }}
                  />
                ) : null}
              </span>
            ) : profileBot === undefined ? (
              <span className="bh-companion-chip">
                <button
                  type="button"
                  className="bh-channel-island"
                  aria-label={`${title} — ${t(sidebar.mode === 'hidden' ? 'sidebar.expand' : 'sidebar.collapse')}`}
                  aria-controls="bh-channel-sidebar"
                  aria-expanded={sidebar.mode !== 'hidden'}
                  onClick={sidebar.toggle}
                >
                  {bot !== undefined ? (
                    <PersonaBotAvatar
                      t={t}
                      personaBotId={bot.slug}
                      name={bot.displayName}
                      src={bot.avatar}
                      appearance={bot.appearance}
                      state={botActivity}
                      size={22}
                      indicator={false}
                    />
                  ) : channelFacepile.length > 0 ? (
                    <PersonaBotFacepile items={channelFacepile} size={22} indicator={false} t={t} />
                  ) : (
                    <span className="bh-channel-mark bh-channel-mark-sm" aria-hidden="true">
                      #
                    </span>
                  )}
                  <span className="bh-title">{title}</span>
                  {bot === undefined || bot.roles.length === 0 ? null : (
                    <span className="bh-role-badges">
                      {bot.roles.map((role) => (
                        <Tag key={role} tone="neutral">
                          {role}
                        </Tag>
                      ))}
                    </span>
                  )}
                </button>
                {bot && companion ? (
                  <CompanionPin
                    companion={companion}
                    botId={bot.slug}
                    name={bot.displayName}
                    t={t}
                  />
                ) : null}
              </span>
            ) : (
              <span className="bh-channel-island-wrap" ref={profileTriggerRef}>
                <button
                  type="button"
                  className="bh-channel-island"
                  aria-haspopup="dialog"
                  aria-expanded={profilePopoverOpen}
                  aria-label={t('profile.openAvatar', { name: profileBot.displayName })}
                  onClick={() => setProfilePopoverOpen((open) => !open)}
                >
                  <PersonaBotAvatar
                    t={t}
                    personaBotId={profileBot.slug}
                    name={profileBot.displayName}
                    src={profileBot.avatar}
                    appearance={profileBot.appearance}
                    state={profileBotActivity}
                    size={22}
                    indicator={false}
                  />
                  <span className="bh-title">{title}</span>
                  {profileBot.roles.length === 0 ? null : (
                    <span className="bh-role-badges">
                      {profileBot.roles.map((role) => (
                        <Tag key={role} tone="neutral">
                          {role}
                        </Tag>
                      ))}
                    </span>
                  )}
                </button>
                {companion ? (
                  <CompanionPin
                    companion={companion}
                    botId={profileBot.slug}
                    name={profileBot.displayName}
                    t={t}
                  />
                ) : null}
                {profilePopoverOpen ? (
                  <ProfilePopover
                    bot={profileBot}
                    activity={profileActivity}
                    cards={profileCards}
                    pinned={pinnedProfileCards}
                    t={t}
                    onExpand={() => {
                      setProfilePopoverOpen(false);
                      setSelectedMemoryView(undefined);
                      setProfileViewOpen(true);
                    }}
                  />
                ) : null}
              </span>
            )}
          </div>
          <div
            className="bh-chat-top-fade"
            aria-hidden="true"
            style={{ display: activeMemoryView === undefined ? undefined : 'none' }}
          />
          {profileViewOpen && channel?.type === 'group' ? (
            <GroupProfileView
              actions={actions}
              channel={channel}
              activity={
                groupProfileActivity?.channelId === channel.id ? groupProfileActivity : undefined
              }
              cards={profileCards}
              pinned={pinnedGroupProfileCards}
              botNames={botNames}
              t={t}
              onTogglePin={togglePinnedGroupCard}
              onClose={() => setProfileViewOpen(false)}
            />
          ) : profileViewOpen && profileBot !== undefined && channel !== undefined ? (
            <ProfileView
              bot={profileBot}
              channel={channel}
              activity={profileActivity}
              cards={profileCards}
              pinned={pinnedProfileCards}
              actions={actions}
              t={t}
              onTogglePin={togglePinnedCard}
              onClose={() => setProfileViewOpen(false)}
            />
          ) : (
            <>
              {activeMemoryView === undefined ||
              channelId === undefined ? null : activeMemoryView.kind === 'commit' ? (
                <MemoryCommitView
                  key={`${channelId}:${activeMemoryView.sha}`}
                  actions={actions}
                  channelId={channelId}
                  sha={activeMemoryView.sha}
                  t={t}
                  onClose={closeMemoryView}
                />
              ) : activeMemoryView.kind === 'file' ? (
                <MemoryFileView
                  key={`${channelId}:${activeMemoryView.path}`}
                  actions={actions}
                  channelId={channelId}
                  path={activeMemoryView.path}
                  botSlug={channel?.botSlug}
                  t={t}
                  onClose={closeMemoryView}
                />
              ) : (
                <MemoryWorkingView
                  key={`${channelId}:${activeMemoryView.change.kind}:${activeMemoryView.change.path}`}
                  actions={actions}
                  channelId={channelId}
                  change={activeMemoryView.change}
                  t={t}
                  onClose={closeMemoryView}
                />
              )}
              <div
                className="bh-chat-body"
                ref={timelineMount}
                onScroll={onTimelineScroll}
                style={{ display: activeMemoryView === undefined ? undefined : 'none' }}
              >
                {conversation.timeline.hasOlder ? (
                  <div className="bh-timeline-top-sentinel">
                    {conversation.timeline.loadingOlder ? (
                      <span>{t('messages.older.loading')}</span>
                    ) : conversation.timeline.olderError !== undefined ? (
                      <button type="button" onClick={() => loadOlderAtTop(true)}>
                        {t('messages.retry')}
                      </button>
                    ) : (
                      <button type="button" onClick={() => loadOlderAtTop()}>
                        {t('messages.older.view')}
                      </button>
                    )}
                  </div>
                ) : null}
                {conversation.status === 'loading' && messages.length === 0 ? (
                  <LoadingSkeleton kind="messages" label={t('messages.loading')} />
                ) : null}
                {conversation.status === 'error' && conversation.error !== undefined ? (
                  <div className="bh-error">
                    {t('messages.error', { error: conversation.error })}
                  </div>
                ) : null}
                {conversation.draftNotice !== undefined ? (
                  <div className="bh-note" role="status">
                    {conversation.draftNotice === 'interrupted'
                      ? t('message.draftInterrupted')
                      : t('message.draftExpired')}
                  </div>
                ) : null}
                {displayMessages.length === 0 && conversation.status !== 'loading' ? (
                  <EmptyConversation channel={channel} bot={bot} t={t} />
                ) : null}
                {groupChannelMessages(displayMessages).map((group, index, groups) => {
                  const first = group.messages[0]!;
                  const previous = groups[index - 1]?.messages.at(-1);
                  const firstDay = Number.isFinite(Date.parse(first.at))
                    ? new Date(first.at).toDateString()
                    : undefined;
                  const previousDay =
                    previous !== undefined && Number.isFinite(Date.parse(previous.at))
                      ? new Date(previous.at).toDateString()
                      : undefined;
                  return (
                    <div key={group.key} className="bh-message-block">
                      {firstDay !== undefined && firstDay !== previousDay ? (
                        <div className="bh-message-day">
                          {new Date(first.at).toLocaleDateString(t('main.date.locale'), {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                          })}
                        </div>
                      ) : null}
                      {first.memberDeparture !== undefined ? (
                        <div className="bh-member-departure" data-message-id={first.id}>
                          <span>
                            {t(
                              first.memberDeparture.departureType === 'removed'
                                ? 'member.removed'
                                : 'member.left',
                              { name: first.memberDeparture.displayName },
                            )}
                          </span>
                          <ChannelDeliveryReceipt
                            message={first}
                            bots={state.bots}
                            humanMembers={channel?.humanMembers ?? []}
                            t={t}
                          />
                        </div>
                      ) : first.botDmAction === undefined ? (
                        <MessageGroupView
                          humanMembers={channel?.humanMembers ?? []}
                          group={group}
                          channelId={channelId}
                          actions={actions}
                          nativeChatT={nativeChatT}
                          resolvedGrantRequests={resolvedGrantRequestIds(displayMessages)}
                          toolApprovalDecisions={
                            new Map(
                              displayMessages
                                .filter((item) => item.toolApprovalDecision !== undefined)
                                .map((item) => [
                                  item.toolApprovalDecision!.requestMessageId,
                                  item.toolApprovalDecision!.outcome,
                                ]),
                            )
                          }
                          userQuestionResolutions={
                            new Map(
                              displayMessages
                                .filter((item) => item.userQuestionResolution !== undefined)
                                .map((item) => [
                                  item.userQuestionResolution!.requestMessageId,
                                  item.userQuestionResolution!.state,
                                ]),
                            )
                          }
                          focusMessageId={conversation.focusMessageId}
                          currentDmBotSlug={
                            channel?.type === 'dm' && !botDm ? channel.botSlug : undefined
                          }
                          bots={state.bots}
                          onContextMenu={(message, x, y) => {
                            setMessageMenu({ message, x, y });
                          }}
                          onReply={readOnlyDm ? undefined : (message) => setReplyTarget(message)}
                          onJumpReply={(messageId) => {
                            if (channelId !== undefined)
                              void actions.openAround(channelId, messageId);
                          }}
                          onRestoreFailed={(message) => {
                            if (channelId === undefined) return;
                            if (
                              draft.length > 0 ||
                              uploadItems.length > 0 ||
                              conversation.sending
                            ) {
                              setRestoreBlocked(true);
                              return;
                            }
                            if (!actions.dismissFailedMessage(channelId, message.id)) return;
                            setDraft(message.body);
                            setMentionTokens(message.mentions ?? []);
                            setChannelRefTokens(message.channelRefs ?? []);
                            setUploadItems(
                              (message.attachments ?? []).map((ref) => ({
                                id: crypto.randomUUID(),
                                file: new File([], ref.name, { type: ref.mime }),
                                ref,
                                status: 'ready' as const,
                              })),
                            );
                            setReplyTarget(
                              message.replyTo === undefined
                                ? undefined
                                : messages.find((candidate) => candidate.id === message.replyTo),
                            );
                            setRestoreBlocked(false);
                            setRestoreFocusSignal((value) => value + 1);
                          }}
                          t={t}
                        />
                      ) : (
                        <button
                          type="button"
                          className="bh-bot-dm-action"
                          data-message-id={first.id}
                          onClick={() => {
                            const action = first.botDmAction!;
                            void actions
                              .openChannel(action.channelId)
                              .then(() => actions.openAround(action.channelId, action.messageId));
                          }}
                        >
                          {t('botDm.action', {
                            sender: authorLabel(first, state.bots, t, channelHumanName(channel)),
                            recipient: memberName(state.bots, first.botDmAction.recipientBotSlug),
                          })}
                        </button>
                      )}
                    </div>
                  );
                })}
                {conversation.timeline.hasNewer ? (
                  <div className="bh-timeline-newer-sentinel">
                    {conversation.timeline.loadingNewer ? (
                      <span>{t('messages.newer.loading')}</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          if (channelId !== undefined) void actions.loadNewer(channelId);
                        }}
                      >
                        {conversation.timeline.newerError === undefined
                          ? t('messages.newer.view')
                          : t('messages.retry')}
                      </button>
                    )}
                  </div>
                ) : null}
              </div>
              {activeMemoryView === undefined && (unseen > 0 || conversation.timeline.hasNewer) ? (
                <button type="button" className="bh-timeline-new" onClick={jumpToLatest}>
                  {conversation.timeline.hasNewer
                    ? t('messages.latest')
                    : t('messages.unseen', { count: unseen })}
                </button>
              ) : null}
              {activeMemoryView === undefined && restoreBlocked ? (
                <div className="bh-note" role="alert">
                  {t('message.restoreBlocked')}
                </div>
              ) : null}
              {readOnlyDm ? <div className="bh-bot-dm-readonly">{t('botDm.readOnly')}</div> : null}
              {readOnlyDm ? null : (
                <div
                  className="bh-memory-chat-composer"
                  style={{
                    display: activeMemoryView === undefined ? 'contents' : 'none',
                  }}
                >
                  <ChannelComposer
                    key={channelId}
                    value={draft}
                    mentions={mentionTokens}
                    channelRefs={channelRefTokens}
                    channelCandidates={
                      channel?.type === 'dm' && channel.botSlug !== undefined
                        ? state.channels.filter((candidate) => candidate.type === 'group')
                        : []
                    }
                    allBotPreview={channel?.type === 'group' ? allBotPreview : undefined}
                    allBotNotice={allBotNotice}
                    mentionCandidates={
                      channel?.type === 'group'
                        ? channelBots
                        : channel?.type === 'dm' && channel.botSlug !== undefined
                          ? state.bots.filter(
                              (candidate) =>
                                candidate.slug !== channel.botSlug && candidate.paused !== true,
                            )
                          : []
                    }
                    placeholder={t('composer.placeholder', { name: title })}
                    sending={conversation.sending}
                    focusSignal={restoreFocusSignal}
                    attachments={uploadItems}
                    onAddFiles={addFiles}
                    onRetryAttachment={(id) => {
                      const item = uploadItems.find((candidate) => candidate.id === id);
                      if (item !== undefined) startUpload(item);
                    }}
                    onRemoveAttachment={(id) => {
                      uploadControllers.current.get(id)?.abort();
                      uploadControllers.current.delete(id);
                      setUploadItems((current) => current.filter((item) => item.id !== id));
                    }}
                    activity={composerActivity}
                    onActivityOverlayResize={resizeActivityOverlay}
                    reply={
                      replyTarget === undefined
                        ? undefined
                        : {
                            id: replyTarget.id,
                            author: authorLabel(
                              replyTarget,
                              state.bots,
                              t,
                              channelHumanName(channel),
                            ),
                            body: replyTarget.body,
                          }
                    }
                    t={t}
                    onChange={(value, mentions, channelRefs) => {
                      setDraft(value);
                      setMentionTokens(mentions ?? []);
                      setChannelRefTokens(channelRefs ?? []);
                      setRestoreBlocked(false);
                    }}
                    onCancelReply={() => setReplyTarget(undefined)}
                    onSubmit={submit}
                  />
                </div>
              )}
              {activeMemoryView !== undefined || messageMenu === undefined || readOnlyDm ? null : (
                <MessageActionMenu
                  request={messageMenu}
                  t={t}
                  onLocate={(messageId) => {
                    if (channelId !== undefined) void actions.openAround(channelId, messageId);
                  }}
                  onReply={(message) => setReplyTarget(message)}
                  onClose={() => {
                    setMessageMenu(undefined);
                  }}
                />
              )}
            </>
          )}
        </section>
        <ChannelSidebar
          registry={channelSidebar}
          state={state}
          actions={actions}
          controller={sidebar}
          t={t}
          selectedMemoryCommitSha={selectedMemoryCommitSha}
          selectedMemoryFilePath={
            activeMemoryView?.kind === 'file' ? activeMemoryView.path : undefined
          }
          selectedMemoryWorking={
            activeMemoryView?.kind === 'working' ? activeMemoryView.change : undefined
          }
          onMemoryCommitSelect={(sha) => openMemoryView({ kind: 'commit', sha })}
          onMemoryFileSelect={(path) => openMemoryView({ kind: 'file', path })}
          onMemoryWorkingSelect={(change) => openMemoryView({ kind: 'working', change })}
        />
        <button
          type="button"
          className="bh-sidebar-toggle"
          aria-label={sidebar.mode === 'hidden' ? t('sidebar.expand') : t('sidebar.collapse')}
          aria-expanded={sidebar.mode !== 'hidden'}
          aria-controls="bh-channel-sidebar"
          onClick={sidebar.toggle}
        >
          <IconPanelLeftOutlineRegular size={16} />
        </button>
      </div>
    </div>
  );
}

export function BotMain({
  actions,
  companion,
  nativeSessions,
  channelSidebar,
  profileCards,
  nativeChatT,
  t = zhTranslate,
}: {
  actions: BridgeActions;
  companion?: WindowCompanions | undefined;
  channelSidebar: ChannelSidebarRegistry;
  nativeSessions?: NativeSessionCatalog | undefined;
  profileCards?: ProfileCardRegistry | undefined;
  nativeChatT?: NativeChatFailureText | undefined;
  t?: BotHarnessTranslate | undefined;
}): ReactElement {
  const state = useClientState();
  if (state.selection === undefined) return <Welcome state={state} t={t} />;
  if (state.selection.kind === 'inbox')
    return <ActivityCenterView actions={actions} t={t} nativeSessions={nativeSessions} />;
  const scopeKey =
    state.selection.kind === 'bot'
      ? `bot:${state.selection.slug}:${state.selection.profile ? 'profile' : 'chat'}`
      : `channel:${state.selection.channelId}`;
  return (
    <ConversationView
      key={`${scopeKey}:${state.conversation.channel?.id ?? ''}`}
      state={state}
      actions={actions}
      companion={companion}
      channelSidebar={channelSidebar}
      profileCards={profileCards}
      nativeChatT={nativeChatT}
      t={t}
    />
  );
}

export function BotPanel({
  actions,
  companion,
  nativeSessions,
  channelSidebar,
  profileCards,
  nativeChatT,
  releaseNotes,
  telemetryNotice,
  t,
}: {
  actions: BridgeActions;
  companion?: WindowCompanions | undefined;
  channelSidebar: ChannelSidebarRegistry;
  nativeSessions?: NativeSessionCatalog | undefined;
  profileCards?: ProfileCardRegistry | undefined;
  nativeChatT?: NativeChatFailureText | undefined;
  releaseNotes?: ReleaseNotesController | undefined;
  telemetryNotice?: TelemetryNoticeController | undefined;
  t: BotHarnessTranslate;
}): ReactElement {
  const modeMount = useMountedResource<HTMLSpanElement>(() => {
    store.setMode('bot');
    return () => {
      store.setMode('dsh');
    };
  }, []);
  return (
    <>
      <span ref={modeMount} hidden aria-hidden="true" />
      {releaseNotes === undefined ? null : (
        <ReleaseNotesAnnouncement controller={releaseNotes} t={t} />
      )}
      {telemetryNotice === undefined ? null : (
        <TelemetryNotice controller={telemetryNotice} releaseNotes={releaseNotes} t={t} />
      )}
      <BotMain
        actions={actions}
        companion={companion}
        nativeSessions={nativeSessions}
        channelSidebar={channelSidebar}
        profileCards={profileCards}
        nativeChatT={nativeChatT}
        t={t}
      />
    </>
  );
}
