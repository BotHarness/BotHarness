import { useEffect, useState, type ReactElement } from 'react';

import type { BridgeActions } from './actions.js';
import { useClientState } from './bot-sidebar.js';
import { zhTranslate, type BotHarnessTranslate } from './locale.js';
import type { HumanAttentionItem, HumanInboxCategory } from './store.js';

export function HumanInboxView({
  actions,
  t = zhTranslate,
}: {
  actions: BridgeActions;
  t?: BotHarnessTranslate | undefined;
}): ReactElement {
  const state = useClientState();
  const inbox = state.humanInbox;
  const [busyId, setBusyId] = useState<string>();
  const [actionError, setActionError] = useState<string>();

  useEffect(() => {
    const timer = window.setInterval(() => {
      void actions.refreshHumanInbox();
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
        : channel.type === 'dm' && channel.botSlug !== undefined,
    )
    .sort((left, right) => left.name.localeCompare(right.name));

  const openSource = async (item: HumanAttentionItem): Promise<void> => {
    if (item.kind === 'assignment-waiting-human' || item.kind === 'assignment-report') {
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
      if (item.kind === 'assignment-report') await actions.ignoreHumanReport(item.sourceEventId!);
      else await actions.markRead(item.channelId!, item.messageId!);
      await actions.refreshHumanInbox();
    } catch {
      setActionError(t('humanInbox.failed'));
    } finally {
      setBusyId(undefined);
    }
  };

  const changeCategory = (category: HumanInboxCategory): void => {
    if (category === inbox.category) return;
    setActionError(undefined);
    void actions.refreshHumanInbox(category);
  };

  return (
    <div className="bh-root bh-main bh-human-inbox">
      <main className="bh-human-inbox-inner">
        <h1>{t('humanInbox.title')}</h1>
        <div className="bh-human-inbox-tabs" role="tablist" aria-label={t('humanInbox.title')}>
          {(['action', 'info'] as const).map((category) => (
            <button
              key={category}
              type="button"
              role="tab"
              aria-selected={inbox.category === category}
              onClick={() => changeCategory(category)}
            >
              {t(category === 'action' ? 'humanInbox.action' : 'humanInbox.info')}
            </button>
          ))}
        </div>
        <div className="bh-human-inbox-filters">
          <label>
            <span>{t('humanInbox.filter.bot')}</span>
            <select
              value={inbox.botSlug ?? ''}
              onChange={(event) =>
                void actions.setHumanInboxFilters({
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
          <label>
            <span>{t('humanInbox.filter.channel')}</span>
            <select
              value={inbox.channelId ?? ''}
              onChange={(event) =>
                void actions.setHumanInboxFilters({
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
                void actions.setHumanInboxFilters({
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
          <p>
            {t(inbox.category === 'action' ? 'humanInbox.empty.action' : 'humanInbox.empty.info')}
          </p>
        ) : null}
        <div role="list">
          {inbox.items.map((item) => (
            <article key={item.id} role="listitem" className="bh-human-inbox-row">
              <div className="bh-human-inbox-row-main">
                <div className="bh-human-inbox-row-title">
                  {item.kind === 'group-join-request'
                    ? t('humanInbox.groupJoin', {
                        bot: botName(item.botSlug),
                        channel: item.channelName ?? '',
                      })
                    : item.kind === 'user-question'
                      ? t('humanInbox.question', { bot: botName(item.botSlug) })
                      : item.kind === 'tool-approval'
                        ? t('humanInbox.approval', { bot: botName(item.botSlug) })
                        : item.kind === 'assignment-waiting-human'
                          ? t('humanInbox.assignmentWaiting', { bot: botName(item.botSlug) })
                          : item.kind === 'assignment-report'
                            ? t('humanInbox.assignmentReport', { bot: botName(item.botSlug) })
                            : botName(item.botSlug)}
                </div>
                {item.kind === 'bot-dm-message' ||
                item.kind === 'user-question' ||
                item.kind === 'tool-approval' ||
                item.kind === 'assignment-waiting-human' ||
                item.kind === 'assignment-report' ? (
                  <div className="bh-human-inbox-row-summary" title={item.summary}>
                    {item.summary}
                  </div>
                ) : null}
              </div>
              <div className="bh-human-inbox-row-actions">
                <button
                  type="button"
                  onClick={() =>
                    void openSource(item).catch(() => setActionError(t('humanInbox.failed')))
                  }
                >
                  {t('humanInbox.open')}
                </button>
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
                ) : item.kind === 'bot-dm-message' || item.kind === 'assignment-report' ? (
                  <button
                    type="button"
                    disabled={busyId === item.id}
                    onClick={() => void acknowledge(item)}
                  >
                    {t(
                      item.kind === 'assignment-report'
                        ? 'humanInbox.ignore'
                        : 'humanInbox.acknowledge',
                    )}
                  </button>
                ) : null}
              </div>
            </article>
          ))}
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
