import { useState, useSyncExternalStore, type ReactElement } from 'react';
import {
  Button,
  IconAgentPresetOutlineRegular,
  IconCodeOutlineRegular,
  Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives';
import type { BridgeActions } from './actions.js';
import { useClientState } from './bot-sidebar.js';
import { PersonaBotAvatar, personaBotActivityLabel } from './avatar.js';
import { ChannelActivityView } from './channel-activity-view.js';
import { HumanInboxView } from './human-inbox-view.js';
import { zhTranslate, type BotHarnessTranslate } from './locale.js';
import { useMountedResource } from './mounted-resource.js';
import type { NativeSessionCatalog } from './sessions-entry.js';

const EMPTY_NATIVE_SESSIONS = { ids: [], byId: {} };
const fallbackSessions: NativeSessionCatalog = {
  subscribe: () => () => {},
  getSnapshot: () => EMPTY_NATIVE_SESSIONS,
};

export function ActivityCenterView({
  actions,
  t = zhTranslate,
  nativeSessions = fallbackSessions,
}: {
  actions: BridgeActions;
  t?: BotHarnessTranslate;
  nativeSessions?: NativeSessionCatalog | undefined;
}): ReactElement {
  const state = useClientState();
  const native = useSyncExternalStore(
    nativeSessions.subscribe,
    nativeSessions.getSnapshot,
    nativeSessions.getSnapshot,
  );
  const [showIdle, setShowIdle] = useState(false);
  const overview = state.selection?.kind === 'inbox' && state.selection.view === 'overview';
  const mount = useMountedResource<HTMLDivElement>(() => {
    if (!overview) return;
    const refresh = (): void => {
      void Promise.allSettled([actions.refreshOverview(), nativeSessions.refresh?.()]);
    };
    void nativeSessions.refresh?.().catch(() => undefined);
    const timer = window.setInterval(refresh, 5000);
    return () => window.clearInterval(timer);
  }, [actions, overview, nativeSessions]);
  const value = state.overview.value;
  const bots =
    value?.bots.filter(
      (bot) => showIdle || bot.state !== 'idle' || bot.hasAction || bot.sessions.length > 0,
    ) ?? [];
  return (
    <div className="bh-root bh-main bh-activity-center" ref={mount}>
      <header className="bh-activity-center-header">
        <h1>{t('activityCenter.title')}</h1>
        <div className="bh-human-inbox-tabs" role="tablist" aria-label={t('activityCenter.title')}>
          <button
            type="button"
            role="tab"
            aria-selected={overview}
            onClick={() => void actions.openActivityCenter('overview')}
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
            <Button
              variant="outline"
              size="sm"
              aria-label={t('activityCenter.showIdle')}
              aria-pressed={showIdle}
              onClick={() => setShowIdle(!showIdle)}
            >
              {t(showIdle ? 'activityCenter.hideIdle' : 'activityCenter.showIdle')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                void Promise.allSettled([actions.refreshOverview(), nativeSessions.refresh?.()])
              }
            >
              {t('activityCenter.refresh')}
            </Button>
          </div>
          {state.overview.status === 'loading' ? (
            <p role="status">{t('activityCenter.loading')}</p>
          ) : null}
          {state.overview.status === 'error' ? (
            <p role="alert">{t('activityCenter.error')}</p>
          ) : null}
          {value === undefined || bots.length > 0 ? null : (
            <p>{t(value.bots.length === 0 ? 'activityCenter.empty' : 'activityCenter.allIdle')}</p>
          )}
          <div className="bh-overview-bots">
            {bots.map((bot) => (
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
                    size={28}
                    state={bot.state}
                    t={t}
                  />
                  <span className="bh-overview-bot-name">{bot.displayName}</span>
                  <span className="bh-overview-bot-state">
                    {bot.paused
                      ? t('activityCenter.paused')
                      : bot.state === 'idle' && bot.hasAction
                        ? t('activityCenter.actionPending')
                        : personaBotActivityLabel(bot.state, t)}
                  </span>
                </button>
                {bot.sessions.length === 0 ? null : (
                  <>
                    <h2>
                      {t('activityCenter.sessions')} <span>{bot.sessions.length}</span>
                    </h2>
                    <ul>
                      {bot.sessions.map((session) => {
                        const role = t(
                          session.role === 'orchestrator'
                            ? 'activityCenter.orchestrator'
                            : 'activityCenter.assignment',
                        );
                        const title =
                          native.byId[session.sessionId]?.displayTitle ||
                          session.purpose ||
                          t('activityCenter.orchestratorPurpose');
                        const Icon =
                          session.role === 'orchestrator'
                            ? IconAgentPresetOutlineRegular
                            : IconCodeOutlineRegular;
                        return (
                          <li key={session.sessionId} data-session-id={session.sessionId}>
                            <button
                              className="bh-overview-session"
                              type="button"
                              aria-label={`${role}: ${title}`}
                              onClick={() => actions.openSession(session.sessionId)}
                            >
                              <Tooltip label={role} side="bottom">
                                <span
                                  className="bh-overview-session-role"
                                  role="img"
                                  aria-label={role}
                                >
                                  <Icon size={16} />
                                </span>
                              </Tooltip>
                              <span className="bh-overview-session-purpose" title={title}>
                                {title}
                              </span>
                              <span className="bh-overview-session-state">
                                {personaBotActivityLabel(session.state, t)}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </>
                )}
                {bot.hasAction ? (
                  <section
                    className="bh-overview-bot-actions"
                    aria-label={t('activityCenter.actions')}
                  >
                    <h2>{t('activityCenter.actions')}</h2>
                    <HumanInboxView actions={actions} t={t} embedded actionBotSlug={bot.slug} />
                  </section>
                ) : null}
                {bot.sessions.length === 0 && !bot.hasAction ? (
                  <p className="bh-overview-idle">{t('activityCenter.idle')}</p>
                ) : null}
              </article>
            ))}
          </div>
          <ChannelActivityView actions={actions} t={t} />
        </section>
      ) : (
        <HumanInboxView actions={actions} t={t} embedded />
      )}
    </div>
  );
}
