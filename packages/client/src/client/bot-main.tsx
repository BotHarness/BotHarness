import { useEffect, useRef, useState, type ReactElement } from 'react';

import {
  IconAgentPresetOutline16,
  IconPanelLeftOutline16,
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
import { personaBotActivity } from './persona-activity.js';
import {
  store,
  type BotSummary,
  type ChannelMessage,
  type ChannelSummary,
  type ClientState,
} from './store.js';

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

function MessageBubble({
  message,
  bots,
  continuation,
  t,
}: {
  message: ChannelMessage;
  bots: readonly BotSummary[];
  continuation: boolean;
  t: BotHarnessTranslate;
}): ReactElement {
  const human = message.author.kind === 'human';
  const authorSlug = message.author.kind === 'bot' ? message.author.slug : undefined;
  const authorBot = bots.find((candidate) => candidate.slug === authorSlug);
  return (
    <div
      className={`bh-bubble-row${human ? ' bh-bubble-row-me' : ''}${continuation ? ' bh-bubble-row-continuation' : ''}`}
    >
      {message.author.kind === 'bot' ? (
        continuation ? (
          <span className="bh-bubble-avatar-spacer" aria-hidden="true" />
        ) : (
          <PersonaBotAvatar
            personaBotId={message.author.slug}
            name={authorBot?.displayName ?? message.author.slug}
            src={authorBot?.avatar}
            size={26}
            indicator={false}
          />
        )
      ) : null}
      <div
        className={`bh-bubble${human ? ' bh-bubble-me' : ''}${message.pending === true || message.streaming === true ? ' bh-bubble-pending' : ''}`}
      >
        {human || continuation ? null : (
          <div className="bh-bubble-author">{authorLabel(message, bots, t)}</div>
        )}
        <div className="bh-bubble-body">{message.body}</div>
        <div className="bh-bubble-time">
          {message.streaming === true
            ? t('message.generating')
            : message.pending === true
              ? t('message.sending')
              : clockTime(message.at)}
        </div>
      </div>
    </div>
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
  const conversation = state.conversation;
  const channel = conversation.channel;
  const messages = conversation.messages;
  const displayMessages: ChannelMessage[] = [
    ...messages,
    ...conversation.drafts.map((item) => ({
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
  const currentChannel = useRef(channelId);

  useEffect(() => {
    currentChannel.current = channelId;
  }, [channelId]);

  useEffect(() => {
    setDraft('');
  }, [channelId]);

  useEffect(() => {
    const element = scrollRef.current;
    if (element !== null) element.scrollTop = element.scrollHeight;
  }, [messages.length, conversation.drafts, channelId]);

  const submit = async (): Promise<void> => {
    const body = draft.trim();
    if (body.length === 0 || conversation.sending || submitting.current) return;
    submitting.current = true;
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
                personaBotId={bot.slug}
                name={bot.displayName}
                src={bot.avatar}
                state={botActivity}
                size={22}
              />
            ) : channelFacepile.length > 0 ? (
              <PersonaBotFacepile items={channelFacepile} size={22} />
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
          <div className="bh-chat-body" ref={scrollRef}>
            {conversation.status === 'loading' && messages.length === 0 ? (
              <div className="bh-note">{t('messages.loading')}</div>
            ) : null}
            {conversation.status === 'error' && conversation.error !== undefined ? (
              <div className="bh-error">{t('messages.error', { error: conversation.error })}</div>
            ) : null}
            {displayMessages.length === 0 && conversation.status !== 'loading' ? (
              <EmptyConversation channel={channel} bot={bot} t={t} />
            ) : null}
            {displayMessages.map((message, index) => {
              const previous = displayMessages[index - 1];
              const continuation =
                previous !== undefined &&
                previous.author.kind === message.author.kind &&
                ((message.author.kind === 'bot' &&
                  previous.author.kind === 'bot' &&
                  previous.author.slug === message.author.slug) ||
                  (message.author.kind === 'bridged' &&
                    previous.author.kind === 'bridged' &&
                    previous.author.source === message.author.source));
              return (
                <MessageBubble
                  key={message.id}
                  message={message}
                  bots={state.bots}
                  continuation={continuation}
                  t={t}
                />
              );
            })}
          </div>
          <ChannelComposer
            value={draft}
            placeholder={t('composer.placeholder', { name: title })}
            sending={conversation.sending}
            activity={composerActivity}
            t={t}
            onChange={setDraft}
            onSubmit={submit}
          />
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
