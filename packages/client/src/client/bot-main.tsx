import { useEffect, useLayoutEffect, useRef, useState, type ReactElement } from 'react';

import {
  IconAgentPresetOutline16,
  IconCopyOutline16,
  IconPanelLeftOutline16,
  Menu,
  Tag,
} from '@deepseek-ai/dsh-client-ui-primitives';

import type { BridgeActions } from './actions.js';
import {
  PersonaBotAvatar,
  PersonaBotFacepile,
  personaBotActivityLabel,
  type PersonaBotFacepileItem,
} from './avatar.js';
import { useClientState } from './bot-sidebar.js';
import { ChannelComposer, type ChannelComposerActivity } from './channel-composer.js';
import { zhTranslate, type BotHarnessTranslate } from './locale.js';
import type { ChannelSidebarRegistry } from './channel-sidebar.js';
import { ChannelSidebar, useChannelSidebar } from './channel-sidebar-view.js';
import { groupChannelMessages, type MessageGroup } from './message-groups.js';
import { personaBotActivity } from './persona-activity.js';
import {
  store,
  type BotSummary,
  type ChannelMessage,
  type ChannelSummary,
  type ClientState,
} from './store.js';
const useClientLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

function memberName(bots: readonly BotSummary[], slug: string): string {
  return bots.find((bot) => bot.slug === slug)?.displayName ?? slug;
}

function authorLabel(
  message: ChannelMessage,
  bots: readonly BotSummary[],
  t: BotHarnessTranslate,
): string {
  switch (message.author.kind) {
    case 'human':
      return t('main.author.human');
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
          <IconAgentPresetOutline16 size={32} />
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

function MessageGroupView({
  group,
  bots,
  focusMessageId,
  onContextMenu,
  t,
}: {
  group: MessageGroup;
  focusMessageId?: string | undefined;
  bots: readonly BotSummary[];
  onContextMenu(message: ChannelMessage, x: number, y: number): void;
  t: BotHarnessTranslate;
}): ReactElement {
  const first = group.messages[0]!;
  const last = group.messages.at(-1)!;
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
        size={28}
        indicator={false}
      />
    ) : undefined;
  return (
    <div
      className={`bh-message-group${human ? ' bh-message-group-me' : ''}`}
      data-group-size={group.messages.length}
    >
      {avatar === undefined ? null : <span className="bh-message-group-avatar">{avatar}</span>}
      <div className="bh-message-stack">
        <div className="bh-bubble-author">{authorLabel(first, bots, t)}</div>
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
              className={`bh-bubble-wrap${focusMessageId === message.id ? ' bh-bubble-focused' : ''}`}
              data-message-id={message.id}
              onContextMenu={(event) => {
                event.preventDefault();
                onContextMenu(message, event.clientX, event.clientY);
              }}
            >
              <div
                className={`bh-bubble${human ? ' bh-bubble-me' : ''}${message.pending === true || message.streaming === true ? ' bh-bubble-pending' : ''}`}
                data-group-position={position}
              >
                <div className="bh-bubble-body">{message.body}</div>
              </div>
              <button
                type="button"
                className="bh-bubble-quick-action"
                aria-label={t('message.copy')}
                title={t('message.copy')}
                onClick={() => {
                  void navigator.clipboard?.writeText(message.body);
                }}
              >
                <IconCopyOutline16 size={16} />
              </button>
            </div>
          );
        })}
        <div className="bh-bubble-time">
          {last.streaming === true
            ? t('message.generating')
            : last.pending === true
              ? t('message.sending')
              : clockTime(last.at)}
        </div>
      </div>
    </div>
  );
}

function MessageActionMenu({
  onLocate,
  request,
  onClose,
  t,
}: {
  onLocate(messageId: string): void;
  request: MessageMenuRequest;
  onClose(): void;
  t: BotHarnessTranslate;
}): ReactElement {
  const proxy = useRef<HTMLSpanElement | null>(null);
  useEffect(() => {
    // The portaled Menu initially focuses while its placement is hidden.
    // Re-focus after placement, matching the roster context-menu behavior.
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
    <span className="bh-menu-anchor" style={{ left: request.x, top: request.y }}>
      <Menu
        open
        portal
        dense
        autoFocus
        anchor={<span ref={proxy} aria-hidden="true" />}
        getAnchorRect={() => proxy.current?.getBoundingClientRect() ?? null}
        items={[
          { id: 'locate', label: t('message.locate') },
          { id: 'copy', label: t('message.copy'), icon: <IconCopyOutline16 /> },
        ]}
        onSelect={(id) => {
          if (id === 'locate') onLocate(request.message.id);
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
          #
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
  channelSidebar,
  t,
}: {
  state: ClientState;
  actions: BridgeActions;
  channelSidebar: ChannelSidebarRegistry;
  t: BotHarnessTranslate;
}): ReactElement {
  const sidebar = useChannelSidebar(state);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [draft, setDraft] = useState('');
  const submitting = useRef(false);
  const followingLatest = useRef(true);
  const prependAnchor = useRef<{
    firstId: string | undefined;
    y: number | undefined;
    top: number;
    height: number;
  } | null>(null);
  const openedChannel = useRef<string | undefined>(undefined);
  const lastRevision = useRef<number | undefined>(undefined);
  const readMarkTimer = useRef<number | undefined>(undefined);
  const [unseen, setUnseen] = useState(0);
  const [messageMenu, setMessageMenu] = useState<MessageMenuRequest | undefined>();
  const conversation = state.conversation;
  const channel = conversation.channel;
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
  const title = channel?.name ?? bot?.displayName ?? t('main.group.title');
  const botActivity = bot === undefined ? undefined : personaBotActivity(state, bot);
  const channelBots =
    channel?.type === 'group'
      ? channel.members.flatMap((slug) => {
          const member = state.bots.find((candidate) => candidate.slug === slug);
          return member === undefined ? [] : [member];
        })
      : [];
  const channelFacepile: PersonaBotFacepileItem[] = channelBots.map((member) => ({
    personaBotId: member.slug,
    name: member.displayName,
    src: member.avatar,
    state: personaBotActivity(state, member),
  }));
  const activeFacepile = channelFacepile.filter((item) => item.state !== 'idle');
  const composerFacepile: PersonaBotFacepileItem[] =
    bot === undefined
      ? activeFacepile
      : botActivity === undefined || botActivity === 'idle'
        ? []
        : [
            {
              personaBotId: bot.slug,
              name: bot.displayName,
              src: bot.avatar,
              state: botActivity,
            },
          ];
  const composerActivity: ChannelComposerActivity | undefined =
    composerFacepile.length === 0
      ? undefined
      : {
          items: composerFacepile,
          summary:
            composerFacepile.length === 1
              ? `${composerFacepile[0]?.name ?? 'PersonaBot'} ${personaBotActivityLabel(composerFacepile[0]?.state ?? 'idle', t)}`
              : t('main.activity.bots', { count: composerFacepile.length }),
        };
  const channelId = channel?.id;
  const scheduleReadMark = (): void => {
    const element = scrollRef.current;
    if (channelId === undefined || element === null || conversation.status !== 'ready') return;
    const committedIds = new Set(messages.map((message) => message.id));
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

  useEffect(
    () => () => {
      window.clearTimeout(readMarkTimer.current);
    },
    [channelId],
  );
  const currentChannel = useRef(channelId);

  useEffect(() => {
    currentChannel.current = channelId;
  }, [channelId]);

  useEffect(() => {
    setDraft('');
  }, [channelId]);

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

  useClientLayoutEffect(() => {
    if (openedChannel.current === channelId) return;
    openedChannel.current = channelId;
    followingLatest.current = true;
    prependAnchor.current = null;
    lastRevision.current = undefined;
    setUnseen(0);
  }, [channelId]);

  useClientLayoutEffect(() => {
    const element = scrollRef.current;
    if (element === null || conversation.status !== 'ready') return;
    if (conversation.focusMessageId !== undefined && conversation.timeline.hasNewer)
      followingLatest.current = false;
    const anchor = prependAnchor.current;
    if (anchor !== null && messages[0]?.id !== anchor.firstId) {
      const retained = Array.from(element.querySelectorAll<HTMLElement>('[data-message-id]')).find(
        (candidate) => candidate.dataset['messageId'] === anchor.firstId,
      );
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
  }, [channelId, conversation.status, conversation.drafts, conversation.revision, messages]);

  useEffect(() => {
    if (conversation.timeline.olderError !== undefined) prependAnchor.current = null;
  }, [conversation.timeline.olderError]);

  useEffect(() => {
    const element = scrollRef.current;
    if (element !== null && element.scrollHeight <= element.clientHeight + 1) loadOlderAtTop();
  }, [messages[0]?.id, conversation.timeline.hasOlder, conversation.timeline.loadingOlder]);
  useEffect(() => {
    const id = conversation.focusMessageId;
    const element = scrollRef.current;
    if (id === undefined || element === null) return;
    const target = Array.from(element.querySelectorAll<HTMLElement>('[data-message-id]')).find(
      (candidate) => candidate.dataset['messageId'] === id,
    );
    target?.scrollIntoView({ block: 'center' });
    const timer = window.setTimeout(() => {
      const current = store.getSnapshot().conversation;
      if (current.channel?.id === channelId && current.focusMessageId === id) {
        store.setConversation({ focusMessageId: undefined });
      }
    }, 2200);
    return () => {
      window.clearTimeout(timer);
    };
  }, [channelId, conversation.focusMessageId, messages]);

  useEffect(() => {
    if (conversation.status !== 'ready') return;
    const frame = window.requestAnimationFrame(scheduleReadMark);
    return () => window.cancelAnimationFrame(frame);
  }, [channelId, conversation.status, conversation.focusMessageId, messages]);

  const onTimelineScroll = (): void => {
    const element = scrollRef.current;
    if (element === null) return;
    const atBottom = element.scrollHeight - element.scrollTop - element.clientHeight <= 80;
    followingLatest.current = atBottom;
    if (atBottom) setUnseen(0);
    scheduleReadMark();
    if (element.scrollTop <= 48) loadOlderAtTop();
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

  const submit = async (): Promise<void> => {
    const body = draft.trim();
    if (body.length === 0 || conversation.sending || submitting.current) return;
    submitting.current = true;
    followingLatest.current = true;
    setUnseen(0);
    const submittedFor = currentChannel.current;
    setDraft('');
    try {
      const sent = await actions.send(body);
      if (!sent && currentChannel.current === submittedFor) setDraft(body);
    } finally {
      submitting.current = false;
    }
  };

  return (
    <div className="bh-root bh-main">
      <div className="bh-chat-layout">
        <section className="bh-chat-pane">
          <div className="bh-topbar">
            {bot !== undefined ? (
              <PersonaBotAvatar
                t={t}
                personaBotId={bot.slug}
                name={bot.displayName}
                src={bot.avatar}
                state={botActivity}
                size={22}
              />
            ) : channelFacepile.length > 0 ? (
              <PersonaBotFacepile items={channelFacepile} size={22} t={t} />
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
          </div>
          <div className="bh-chat-body" ref={scrollRef} onScroll={onTimelineScroll}>
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
              <div className="bh-note">{t('messages.loading')}</div>
            ) : null}
            {conversation.status === 'error' && conversation.error !== undefined ? (
              <div className="bh-error">{t('messages.error', { error: conversation.error })}</div>
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
                  <MessageGroupView
                    group={group}
                    focusMessageId={conversation.focusMessageId}
                    bots={state.bots}
                    onContextMenu={(message, x, y) => {
                      setMessageMenu({ message, x, y });
                    }}
                    t={t}
                  />
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
          {unseen > 0 || conversation.timeline.hasNewer ? (
            <button type="button" className="bh-timeline-new" onClick={jumpToLatest}>
              {conversation.timeline.hasNewer
                ? t('messages.latest')
                : t('messages.unseen', { count: unseen })}
            </button>
          ) : null}
          <ChannelComposer
            value={draft}
            placeholder={t('composer.placeholder', { name: title })}
            sending={conversation.sending}
            activity={composerActivity}
            t={t}
            onChange={setDraft}
            onSubmit={submit}
          />
          {messageMenu === undefined ? null : (
            <MessageActionMenu
              request={messageMenu}
              t={t}
              onLocate={(messageId) => {
                if (channelId !== undefined) void actions.openAround(channelId, messageId);
              }}
              onClose={() => {
                setMessageMenu(undefined);
              }}
            />
          )}
        </section>
        <ChannelSidebar
          registry={channelSidebar}
          state={state}
          actions={actions}
          controller={sidebar}
          t={t}
        />
        <button
          type="button"
          className="bh-sidebar-toggle"
          aria-label={sidebar.mode === 'hidden' ? t('sidebar.expand') : t('sidebar.collapse')}
          aria-expanded={sidebar.mode !== 'hidden'}
          aria-controls="bh-channel-sidebar"
          onClick={sidebar.toggle}
        >
          <IconPanelLeftOutline16 size={16} />
        </button>
      </div>
    </div>
  );
}

export function BotMain({
  actions,
  channelSidebar,
  t = zhTranslate,
}: {
  actions: BridgeActions;
  channelSidebar: ChannelSidebarRegistry;
  t?: BotHarnessTranslate | undefined;
}): ReactElement {
  const state = useClientState();
  if (state.selection === undefined) return <Welcome state={state} t={t} />;
  return <ConversationView state={state} actions={actions} channelSidebar={channelSidebar} t={t} />;
}

export function BotPanel({
  actions,
  channelSidebar,
  t,
}: {
  actions: BridgeActions;
  channelSidebar: ChannelSidebarRegistry;
  t: BotHarnessTranslate;
}): ReactElement {
  useEffect(() => {
    store.setMode('bot');
    return () => {
      store.setMode('dsh');
    };
  }, []);
  return <BotMain actions={actions} channelSidebar={channelSidebar} t={t} />;
}
