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

  const openSource = async (item: HumanAttentionItem): Promise<void> => {
    if (item.kind === 'group-join-request') {
      await actions.openChannel(item.channelId);
    } else {
      await actions.openBot(item.botSlug);
      if (item.messageId !== undefined) await actions.openAround(item.channelId, item.messageId);
    }
  };

  const decide = async (item: HumanAttentionItem, accept: boolean): Promise<void> => {
    if (item.requestId === undefined) return;
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
    if (item.messageId === undefined) return;
    setBusyId(item.id);
    setActionError(undefined);
    try {
      await actions.markRead(item.channelId, item.messageId);
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
                        channel: item.channelName,
                      })
                    : botName(item.botSlug)}
                </div>
                {item.kind === 'bot-dm-message' ? (
                  <div className="bh-human-inbox-row-summary">{item.summary}</div>
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
                ) : (
                  <button
                    type="button"
                    disabled={busyId === item.id}
                    onClick={() => void acknowledge(item)}
                  >
                    {t('humanInbox.acknowledge')}
                  </button>
                )}
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
