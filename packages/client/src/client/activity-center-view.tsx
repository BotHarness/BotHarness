import { type ReactElement } from 'react';
import type { BridgeActions } from './actions.js';
import { useClientState } from './bot-sidebar.js';
import { PersonaBotAvatar, personaBotActivityLabel } from './avatar.js';
import { HumanInboxView } from './human-inbox-view.js';
import { zhTranslate, type BotHarnessTranslate } from './locale.js';
import { useMountedResource } from './mounted-resource.js';

export function ActivityCenterView({
  actions,
  t = zhTranslate,
}: {
  actions: BridgeActions;
  t?: BotHarnessTranslate;
}): ReactElement {
  const state = useClientState();
  const overview = state.selection?.kind === 'inbox' && state.selection.view === 'overview';
  const mount = useMountedResource<HTMLDivElement>(() => {
    if (!overview) return;
    const timer = window.setInterval(() => void actions.refreshOverview(), 5000);
    return () => window.clearInterval(timer);
  }, [actions, overview]);
  const value = state.overview.value;
  return (
    <div className="bh-root bh-main bh-activity-center" ref={mount}>
      <header className="bh-activity-center-header">
        <h1>{t('activityCenter.title')}</h1>
        <div className="bh-human-inbox-tabs" role="tablist" aria-label={t('activityCenter.title')}>
          <button
            type="button"
            role="tab"
            aria-selected={overview}
            onClick={() => void actions.openActivityCenter()}
          >
            {t('activityCenter.overview')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={!overview}
            onClick={() => void actions.openHumanInbox()}
          >
            {t('activityCenter.inbox')}
          </button>
        </div>
      </header>
      {overview ? (
        <section className="bh-overview" aria-label={t('activityCenter.overview')}>
          <div className="bh-overview-toolbar">
            {value === undefined ? null : (
              <button
                className="bh-overview-action-count"
                type="button"
                onClick={() => {
                  void actions.openHumanInbox().then(() => actions.refreshHumanInbox('action'));
                }}
              >
                <span>{t('activityCenter.actions')}</span>
                <strong>{value.actionCount}</strong>
              </button>
            )}
            <button
              className="bh-overview-refresh"
              type="button"
              onClick={() => void actions.refreshOverview()}
            >
              {t('activityCenter.refresh')}
            </button>
          </div>
          {state.overview.status === 'loading' ? (
            <p role="status">{t('activityCenter.loading')}</p>
          ) : null}
          {state.overview.status === 'error' ? (
            <p role="alert">{t('activityCenter.error')}</p>
          ) : null}
          {value?.bots.length === 0 ? <p>{t('activityCenter.empty')}</p> : null}
          <div className="bh-overview-bots">
            {value?.bots.map((bot) => (
              <article className="bh-overview-bot" key={bot.slug} data-bot-id={bot.slug}>
                <button
                  className="bh-overview-bot-header"
                  type="button"
                  onClick={() => void actions.openBot(bot.slug)}
                >
                  <PersonaBotAvatar
                    personaBotId={bot.slug}
                    name={bot.displayName}
                    src={bot.avatar}
                    size={32}
                    state={bot.state}
                    t={t}
                  />
                  <span className="bh-overview-bot-name">{bot.displayName}</span>
                  <span className="bh-overview-bot-state">
                    {bot.paused
                      ? t('activityCenter.paused')
                      : personaBotActivityLabel(bot.state, t)}
                  </span>
                </button>
                <h2>
                  {t('activityCenter.sessions')} <span>{bot.sessions.length}</span>
                </h2>
                {bot.sessions.length === 0 ? (
                  <p className="bh-overview-idle">{t('activityCenter.idle')}</p>
                ) : (
                  <ul>
                    {bot.sessions.map((session) => (
                      <li key={session.sessionId} data-session-id={session.sessionId}>
                        <button
                          type="button"
                          onClick={() => actions.openSession(session.sessionId)}
                        >
                          <span className="bh-overview-session-role">
                            {t(
                              session.role === 'orchestrator'
                                ? 'activityCenter.orchestrator'
                                : 'activityCenter.assignment',
                            )}
                          </span>
                          <span className="bh-overview-session-purpose" title={session.purpose}>
                            {session.purpose ?? t('activityCenter.orchestratorPurpose')}
                          </span>
                          <span className="bh-overview-session-state">
                            {personaBotActivityLabel(session.state, t)}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            ))}
          </div>
        </section>
      ) : (
        <HumanInboxView actions={actions} t={t} embedded />
      )}
    </div>
  );
}
