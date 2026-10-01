import { useState, type ReactElement } from 'react';

import type { BridgeActions } from './actions.js';
import { PersonaBotAvatar } from './avatar.js';
import { channelSidebarPrefs, channelSidebarScopeKey } from './channel-sidebar-prefs.js';
import { useClientState } from './bot-sidebar.js';
import { zhTranslate, type BotHarnessTranslate } from './locale.js';
import { store } from './store.js';
import type { HumanAttentionItem, HumanInboxCategory, HumanInboxFilters } from './store.js';
import { useMountedResource } from './mounted-resource.js';
import { HumanInboxReply } from './human-inbox-reply.js';
import { HumanInboxAssignment } from './human-inbox-assignment.js';

const categoryCopy = {
  unread: { title: 'humanInbox.unread', empty: 'humanInbox.empty.unread' },
  replies: { title: 'humanInbox.replies', empty: 'humanInbox.empty.replies' },
  action: { title: 'humanInbox.action', empty: 'humanInbox.empty.action' },
  info: { title: 'humanInbox.info', empty: 'humanInbox.empty.info' },
  handled: { title: 'humanInbox.handled', empty: 'humanInbox.empty.handled' },
} as const;

export function HumanInboxView({
  actions,
  t = zhTranslate,
  embedded = false,
}: {
  actions: BridgeActions;
  embedded?: boolean;
  t?: BotHarnessTranslate | undefined;
}): ReactElement {
  const state = useClientState();
  const inbox = state.humanInbox;
  const [busyId, setBusyId] = useState<string>();
  const [actionError, setActionError] = useState<string>();
  const [replySource, setReplySource] = useState<HumanAttentionItem>();

  const mount = useMountedResource<HTMLDivElement>(() => {
    const timer = window.setInterval(() => {
      if (store.getSnapshot().humanInbox.items.length <= 150)
        void actions.refreshHumanInbox(undefined, true);
    }, 10_000);
    return () => window.clearInterval(timer);
  }, [actions]);

  const botName = (slug: string): string =>
    state.bots.find((bot) => bot.slug === slug)?.displayName ?? slug;
  const bots = [...state.bots].sort((left, right) =>
    left.displayName.localeCompare(right.displayName),
  );
  const channels = state.channels
    .filter((channel) =>
      inbox.category === 'action'
        ? channel.type === 'group' || (channel.type === 'dm' && channel.botSlug !== undefined)
        : inbox.category === 'replies'
          ? channel.type === 'group'
          : inbox.category === 'unread'
            ? channel.type === 'group' || (channel.type === 'dm' && channel.botSlug !== undefined)
            : channel.type === 'dm' && channel.botSlug !== undefined,
    )
    .sort((left, right) => left.name.localeCompare(right.name));

  const openRepairBotInbox = async (item: HumanAttentionItem): Promise<void> => {
    const scopeKey = channelSidebarScopeKey('personabot', '', item.botSlug);
    channelSidebarPrefs.setSidebarCollapsed(scopeKey, false);
    channelSidebarPrefs.setEntryExpanded(scopeKey, 'bot-inbox', true);
    await actions.openBot(item.botSlug);
  };

  const openSource = async (item: HumanAttentionItem): Promise<void> => {
    if (
      item.kind === 'channel-unread' ||
      item.kind === 'channel-reply' ||
      item.kind === 'channel-mention'
    ) {
      await actions.openChannelAtMessage(item.channelId!, item.messageId!);
    } else if (item.kind === 'bot-message-needs-repair') {
      if (item.channelName && item.channelId && item.messageId) {
        await actions.openChannel(item.channelId);
        await actions.openAround(item.channelId, item.messageId);
      } else await openRepairBotInbox(item);
    } else if (
      item.kind === 'assignment-waiting-human' ||
      item.kind === 'assignment-blocked' ||
      item.kind === 'assignment-report'
    ) {
      if (item.assignmentSessionId === undefined) return;
      await actions.openBot(item.botSlug);
      await actions.openSession(item.assignmentSessionId);
    } else if (item.kind === 'group-join-request') {
      if (item.channelId !== undefined) await actions.openChannel(item.channelId);
    } else {
      await actions.openBot(item.botSlug);
      if (item.channelId !== undefined && item.messageId !== undefined)
        await actions.openAround(item.channelId, item.messageId);
    }
  };

  const decide = async (item: HumanAttentionItem, accept: boolean): Promise<void> => {
    if (item.requestId === undefined || item.channelId === undefined) return;
    setBusyId(item.id);
    setActionError(undefined);
    try {
      if (!(await actions.decideGroupJoin(item.channelId, item.requestId, accept)))
        throw new Error(t('humanInbox.failed'));
      await actions.refreshHumanInbox();
    } catch {
      setActionError(t('humanInbox.failed'));
    } finally {
      setBusyId(undefined);
    }
  };

  const acknowledge = async (item: HumanAttentionItem): Promise<void> => {
    if (item.kind === 'assignment-report') {
      if (item.sourceEventId === undefined) return;
    } else if (item.messageId === undefined || item.channelId === undefined) {
      return;
    }
    setBusyId(item.id);
    setActionError(undefined);
    try {
      if (item.kind === 'assignment-report') {
        await actions.ignoreHumanReport(item.sourceEventId!);
        await actions.refreshHumanInbox();
      } else {
        await actions.markRead(item.channelId!, item.messageId!);
      }
    } catch {
      setActionError(t('humanInbox.failed'));
    } finally {
      setBusyId(undefined);
    }
  };

  const changeCategory = (category: HumanInboxCategory): void => {
    if (category === inbox.category) return;
    setActionError(undefined);
    setReplySource(undefined);
    void actions.refreshHumanInbox(category);
  };

  const changeFilters = (filters: HumanInboxFilters): void => {
    setReplySource(undefined);
    setActionError(undefined);
    void actions.setHumanInboxFilters(filters);
  };

  return (
    <div className={embedded ? 'bh-human-inbox' : 'bh-root bh-main bh-human-inbox'} ref={mount}>
      <main
        className={
          'bh-human-inbox-inner' + (replySource === undefined ? '' : ' bh-human-inbox-with-context')
        }
      >
        {embedded ? null : <h1>{t('humanInbox.title')}</h1>}
        <div className="bh-human-inbox-tabs" role="tablist" aria-label={t('humanInbox.title')}>
          {(['unread', 'replies', 'action', 'info', 'handled'] as const).map((category) => (
            <button
              key={category}
              type="button"
              role="tab"
              aria-selected={inbox.category === category}
              onClick={() => changeCategory(category)}
            >
              {t(categoryCopy[category].title)}
            </button>
          ))}
        </div>
        {inbox.items.length <= 150 ? null : (
          <div role="status">
            <p>{t('humanInbox.refresh.paused')}</p>
            <button type="button" onClick={() => void actions.refreshHumanInbox()}>
              {t('humanInbox.refresh.current')}
            </button>
          </div>
        )}
        <div className="bh-human-inbox-filters">
          {inbox.category === 'unread' ? null : (
            <label>
              <span>{t('humanInbox.filter.bot')}</span>
              <select
                value={inbox.botSlug ?? ''}
                onChange={(event) =>
                  changeFilters({
                    botSlug: event.target.value || undefined,
                    channelId: inbox.channelId,
                    sort: inbox.sort,
                  })
                }
              >
                <option value="">{t('humanInbox.filter.allBots')}</option>
                {bots.map((bot) => (
                  <option key={bot.slug} value={bot.slug}>
                    {bot.displayName}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            <span>{t('humanInbox.filter.channel')}</span>
            <select
              value={inbox.channelId ?? ''}
              onChange={(event) =>
                changeFilters({
                  botSlug: inbox.botSlug,
                  channelId: event.target.value || undefined,
                  sort: inbox.sort,
                })
              }
            >
              <option value="">{t('humanInbox.filter.allChannels')}</option>
              {channels.map((channel) => (
                <option key={channel.id} value={channel.id}>
                  {channel.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{t('humanInbox.filter.sort')}</span>
            <select
              value={inbox.sort}
              onChange={(event) =>
                changeFilters({
                  botSlug: inbox.botSlug,
                  channelId: inbox.channelId,
                  sort: event.target.value === 'oldest' ? 'oldest' : 'newest',
                })
              }
            >
              <option value="newest">{t('humanInbox.filter.newest')}</option>
              <option value="oldest">{t('humanInbox.filter.oldest')}</option>
            </select>
          </label>
        </div>
        {actionError === undefined ? null : <p role="alert">{actionError}</p>}
        {inbox.error === undefined ? null : <p role="alert">{inbox.error}</p>}
        {inbox.status === 'loading' ? <p>{t('humanInbox.loading')}</p> : null}
        {inbox.status === 'ready' && inbox.items.length === 0 ? (
          <p>{t(categoryCopy[inbox.category].empty)}</p>
        ) : null}
        <div className="bh-human-inbox-workspace">
          <div role="list" className="bh-human-inbox-list">
            {inbox.items.map((item) => (
              <article
                key={item.id}
                role="listitem"
                data-attention-id={item.id}
                className={
                  'bh-human-inbox-row' +
                  (item.kind === 'channel-reply' || item.kind === 'channel-mention'
                    ? ' bh-human-inbox-personal-row'
                    : '')
                }
                data-selected={replySource?.id === item.id ? 'true' : undefined}
              >
                {item.kind === 'channel-reply' || item.kind === 'channel-mention' ? (
                  <PersonaBotAvatar
                    personaBotId={item.botSlug}
                    name={botName(item.botSlug)}
                    src={state.bots.find((bot) => bot.slug === item.botSlug)?.avatar}
                    size={28}
                    indicator={false}
                    t={t}
                  />
                ) : null}
                <div className="bh-human-inbox-row-main">
                  <div className="bh-human-inbox-row-title">
                    {item.kind === 'channel-unread'
                      ? item.channelName
                      : item.kind === 'group-join-request'
                        ? t('humanInbox.groupJoin', {
                            bot: botName(item.botSlug),
                            channel: item.channelName ?? '',
                          })
                        : item.kind === 'user-question'
                          ? t('humanInbox.question', { bot: botName(item.botSlug) })
                          : item.kind === 'tool-approval'
                            ? t('humanInbox.approval', { bot: botName(item.botSlug) })
                            : item.kind === 'workspace-grant-request'
                              ? t('humanInbox.grant', { bot: botName(item.botSlug) })
                              : item.kind === 'assignment-waiting-human'
                                ? t('humanInbox.assignmentWaiting', { bot: botName(item.botSlug) })
                                : item.kind === 'assignment-blocked'
                                  ? t('humanInbox.assignmentBlocked', {
                                      bot: botName(item.botSlug),
                                    })
                                  : item.kind === 'assignment-report'
                                    ? t('humanInbox.assignmentReport', {
                                        bot: botName(item.botSlug),
                                      })
                                    : item.kind === 'bot-message-needs-repair'
                                      ? t('humanInbox.repair', { bot: botName(item.botSlug) })
                                      : botName(item.botSlug)}
                  </div>
                  {item.kind === 'channel-reply' || item.kind === 'channel-mention' ? (
                    <div className="bh-human-inbox-unread-meta">
                      <span>{item.channelName}</span>
                      {item.kind === 'channel-mention' ? (
                        <>
                          {' · '}
                          <span className="bh-inline-mention">{t('humanInbox.mention')}</span>
                        </>
                      ) : null}
                      {' · '}
                      <time dateTime={item.createdAt}>
                        {new Date(item.createdAt).toLocaleString()}
                      </time>
                      {item.isUnread ? (
                        <span className="bh-human-inbox-message-target">
                          {t('humanInbox.reply.unread')}
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                  {item.category === 'handled' ? (
                    <div className="bh-human-inbox-unread-meta">
                      {item.channelName}
                      {' · '}
                      <time dateTime={item.createdAt}>
                        {new Date(item.createdAt).toLocaleString()}
                      </time>
                    </div>
                  ) : null}
                  {item.kind === 'channel-unread' ? (
                    <div className="bh-human-inbox-unread-meta">
                      {t('humanInbox.unreadCount', { count: String(item.unreadCount ?? 0) })}
                      {' · '}
                      {new Date(item.createdAt).toLocaleString()}
                      <details>
                        <summary>{t('humanInbox.preview')}</summary>
                        <p className="bh-human-inbox-row-summary">{item.summary}</p>
                      </details>
                    </div>
                  ) : null}
                  {item.kind === 'channel-reply' ||
                  item.kind === 'channel-mention' ||
                  item.kind === 'bot-dm-message' ||
                  item.kind === 'user-question' ||
                  item.kind === 'tool-approval' ||
                  item.kind === 'workspace-grant-request' ||
                  item.kind === 'assignment-waiting-human' ||
                  item.kind === 'assignment-blocked' ||
                  item.kind === 'assignment-report' ||
                  item.kind === 'bot-message-needs-repair' ? (
                    <div className="bh-human-inbox-row-summary" title={item.summary}>
                      {item.summary}
                    </div>
                  ) : null}
                  {item.kind === 'bot-message-needs-repair' &&
                  (!item.channelName || !item.messageId) ? (
                    <div className="bh-human-inbox-row-summary">
                      {t(
                        item.channelId && item.channelName
                          ? 'humanInbox.messageUnavailable'
                          : 'humanInbox.sourceUnavailable',
                      )}
                    </div>
                  ) : null}
                </div>
                <div className="bh-human-inbox-row-actions">
                  {item.kind === 'channel-unread' ||
                  item.kind === 'channel-reply' ||
                  item.kind === 'channel-mention' ||
                  item.kind === 'tool-approval' ||
                  item.kind === 'user-question' ||
                  item.kind === 'workspace-grant-request' ||
                  item.kind === 'assignment-waiting-human' ||
                  item.kind === 'assignment-blocked' ? (
                    <button type="button" onClick={() => setReplySource(item)}>
                      {t(
                        item.category === 'handled'
                          ? 'humanInbox.handled.context'
                          : item.kind === 'tool-approval'
                            ? 'humanInbox.approval.handle'
                            : item.kind === 'user-question'
                              ? 'humanInbox.question.handle'
                              : item.kind === 'workspace-grant-request'
                                ? 'humanInbox.grant.handle'
                                : item.kind === 'assignment-waiting-human' ||
                                    item.kind === 'assignment-blocked'
                                  ? 'humanInbox.assignment.handle'
                                  : 'humanInbox.reply',
                      )}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() =>
                      void openSource(item).catch(() => setActionError(t('humanInbox.failed')))
                    }
                  >
                    {t(
                      item.kind === 'bot-message-needs-repair' &&
                        (!item.channelName || !item.messageId)
                        ? 'humanInbox.openBotInbox'
                        : item.category === 'handled' && item.assignmentSessionId !== undefined
                          ? 'humanInbox.handled.session'
                          : 'humanInbox.open',
                    )}
                  </button>
                  {item.category === 'handled' ? (
                    <button
                      type="button"
                      onClick={() =>
                        void actions
                          .openChannelAtMessage(item.channelId!, item.responseMessageId!)
                          .catch(() => setActionError(t('humanInbox.failed')))
                      }
                    >
                      {t('humanInbox.handled.response')}
                    </button>
                  ) : null}
                  {item.kind === 'bot-message-needs-repair' &&
                  item.channelName &&
                  item.messageId ? (
                    <button
                      type="button"
                      onClick={() =>
                        void openRepairBotInbox(item).catch(() =>
                          setActionError(t('humanInbox.failed')),
                        )
                      }
                    >
                      {t('humanInbox.openBotInbox')}
                    </button>
                  ) : null}
                  {item.kind === 'group-join-request' ? (
                    <>
                      <button
                        type="button"
                        disabled={busyId === item.id}
                        onClick={() => void decide(item, true)}
                      >
                        {t('humanInbox.accept')}
                      </button>
                      <button
                        type="button"
                        disabled={busyId === item.id}
                        onClick={() => void decide(item, false)}
                      >
                        {t('humanInbox.decline')}
                      </button>
                    </>
                  ) : item.kind === 'bot-dm-message' ||
                    item.kind === 'assignment-report' ||
                    item.kind === 'channel-unread' ||
                    ((item.kind === 'channel-reply' || item.kind === 'channel-mention') &&
                      item.isUnread) ? (
                    <button
                      type="button"
                      disabled={busyId === item.id}
                      onClick={() => void acknowledge(item)}
                    >
                      {t(
                        item.kind === 'assignment-report'
                          ? 'humanInbox.ignore'
                          : item.kind === 'channel-unread' ||
                              item.kind === 'channel-reply' ||
                              item.kind === 'channel-mention'
                            ? 'humanInbox.markRead'
                            : 'humanInbox.acknowledge',
                      )}
                    </button>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
          {replySource === undefined ? null : replySource.kind === 'assignment-waiting-human' ||
            replySource.kind === 'assignment-blocked' ? (
            <HumanInboxAssignment
              key={replySource.assignmentSessionId + ':' + replySource.sourceEventId}
              source={replySource}
              actions={actions}
              t={t}
              botName={botName}
              bots={state.bots}
              onClose={() => setReplySource(undefined)}
            />
          ) : (
            <HumanInboxReply
              key={replySource.channelId + ':' + replySource.messageId}
              source={replySource}
              actions={actions}
              t={t}
              botName={botName}
              bots={state.bots}
              humanMembers={
                state.channels.find((channel) => channel.id === replySource.channelId)
                  ?.humanMembers ?? []
              }
              onClose={() => setReplySource(undefined)}
            />
          )}
        </div>
        {inbox.nextCursor === undefined ? null : (
          <button
            type="button"
            className="bh-human-inbox-more"
            onClick={() => void actions.loadMoreHumanInbox()}
          >
            {t('humanInbox.more')}
          </button>
        )}
      </main>
    </div>
  );
}
