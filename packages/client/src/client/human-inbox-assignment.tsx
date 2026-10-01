import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import { useRef, useState, type ReactElement } from 'react';
import type { BridgeActions } from './actions.js';
import type { HumanAssignmentContext } from './bridge.js';
import type { BotHarnessTranslate } from './locale.js';
import type { HumanAttentionItem } from './store.js';
import type { BotSummary } from './store.js';
import { PersonaBotAvatar } from './avatar.js';
import { useMountedResource } from './mounted-resource.js';

export function HumanInboxAssignment({
  source,
  actions,
  t,
  botName,
  bots = [],
  onClose,
}: {
  source: HumanAttentionItem;
  actions: BridgeActions;
  t: BotHarnessTranslate;
  botName: (slug: string) => string;
  bots?: readonly BotSummary[];
  onClose: () => void;
}): ReactElement {
  const sessionId = source.assignmentSessionId!;
  const sourceEventId = source.sourceEventId!;
  const [context, setContext] = useState<HumanAssignmentContext>();
  const [failed, setFailed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState(false);
  const [navigationError, setNavigationError] = useState(false);
  const [sent, setSent] = useState<HumanAssignmentContext['reply']>();
  const loading = useRef<AbortController>();
  const pending = useRef(false);
  const attempt = useRef<{ body: string; id: string }>();
  const reload = async (): Promise<void> => {
    loading.current?.abort();
    const controller = new AbortController();
    loading.current = controller;
    setFailed(false);
    setContext(undefined);
    try {
      const value = await actions.humanAssignmentContext(
        source.botSlug,
        sessionId,
        sourceEventId,
        controller.signal,
      );
      if (!controller.signal.aborted) setContext(value);
    } catch {
      if (!controller.signal.aborted) setFailed(true);
    }
  };
  const mount = useMountedResource<HTMLElement>(() => {
    void reload();
    return () => loading.current?.abort();
  }, [actions, source.botSlug, sessionId, sourceEventId]);
  const submit = async (): Promise<void> => {
    const body = draft.trim();
    if (pending.current || body.length === 0 || context?.canReply !== true) return;
    pending.current = true;
    setSending(true);
    setSendError(false);
    if (attempt.current?.body !== body)
      attempt.current = { body, id: 'human-' + crypto.randomUUID() };
    try {
      const reply = await actions.replyToHumanAssignment(
        source.botSlug,
        sessionId,
        sourceEventId,
        body,
        attempt.current.id,
      );
      setSent(reply);
      setDraft('');
    } catch {
      setSendError(true);
      await reload();
    } finally {
      pending.current = false;
      setSending(false);
    }
  };
  const reply = sent ?? context?.reply;
  const navigate = async (open: () => unknown): Promise<void> => {
    setNavigationError(false);
    try {
      await open();
    } catch {
      setNavigationError(true);
    }
  };
  const target = context?.reports.find((row) => row.sourceEventId === sourceEventId);
  const title = t('humanInbox.assignment.title', { bot: botName(source.botSlug) });
  return (
    <section className="bh-human-inbox-reply" ref={mount} aria-label={title}>
      <div className="bh-human-inbox-reply-header">
        <h2>{title}</h2>
        <Button size="sm" variant="outline" type="button" disabled={sending} onClick={onClose}>
          {t('humanInbox.reply.close')}
        </Button>
      </div>
      {target === undefined ? (
        <p role={failed ? 'alert' : 'status'}>
          {t(failed ? 'humanInbox.reply.unavailable' : 'humanInbox.loading')}
        </p>
      ) : (
        <>
          <h3
            className={expanded ? 'bh-human-inbox-purpose' : 'bh-human-inbox-purpose is-collapsed'}
          >
            {context!.purpose}
          </h3>
          <Button
            size="sm"
            variant="outline"
            type="button"
            className="bh-human-inbox-reply-context"
            aria-expanded={expanded}
            onClick={() => setExpanded(!expanded)}
          >
            {t(expanded ? 'humanInbox.assignment.collapse' : 'humanInbox.assignment.context')}
          </Button>
          <div className="bh-human-inbox-message-flow">
            {(expanded ? context!.reports : [target]).map((report) => (
              <article
                key={report.sourceEventId}
                data-source-event-id={report.sourceEventId}
                className={
                  'bh-human-inbox-message' +
                  (report.sourceEventId === sourceEventId ? ' bh-human-inbox-reply-source' : '')
                }
              >
                <PersonaBotAvatar
                  personaBotId={source.botSlug}
                  name={botName(source.botSlug)}
                  src={bots.find((bot) => bot.slug === source.botSlug)?.avatar}
                  size={28}
                  indicator={false}
                  t={t}
                />
                <div className="bh-human-inbox-message-content">
                  <div className="bh-human-inbox-message-heading">
                    <strong>{botName(source.botSlug)}</strong>
                    <time dateTime={report.at}>{new Date(report.at).toLocaleString()}</time>
                  </div>
                  <span className="bh-human-inbox-message-target">
                    {t(`inbox.report.${report.state}`)}
                  </span>
                  <p>{report.summary}</p>
                </div>
              </article>
            ))}
          </div>
        </>
      )}
      <div className="bh-human-inbox-reply-actions">
        <Button
          size="sm"
          variant="outline"
          type="button"
          disabled={sending}
          onClick={() => void reload()}
        >
          {t('humanInbox.reply.refresh')}
        </Button>
        <Button
          size="sm"
          variant="outline"
          type="button"
          onClick={() => void navigate(() => actions.openSession(sessionId))}
        >
          {t('humanInbox.assignment.session')}
        </Button>
        <Button
          size="sm"
          variant="outline"
          type="button"
          onClick={() => void navigate(() => actions.openBot(source.botSlug))}
        >
          {t('humanInbox.assignment.dm')}
        </Button>
      </div>
      {navigationError ? <p role="alert">{t('humanInbox.reply.unavailable')}</p> : null}
      {reply !== undefined ? (
        <div role="status">
          <strong>{t('humanInbox.assignment.sent')}</strong>
          <p>{reply.body}</p>
          <p>{t('humanInbox.assignment.forwarding')}</p>
          <Button
            size="sm"
            variant="outline"
            type="button"
            onClick={() =>
              void navigate(() => actions.openChannelAtMessage('dm-' + source.botSlug, reply.id))
            }
          >
            {t('humanInbox.open')}
          </Button>
        </div>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          {context !== undefined && !context.canReply ? (
            <p role="status">{t('humanInbox.assignment.stale')}</p>
          ) : null}
          <label>
            <span>{t('humanInbox.reply.input')}</span>
            <textarea
              rows={3}
              value={draft}
              disabled={sending}
              onChange={(event) => setDraft(event.currentTarget.value)}
            />
          </label>
          {sendError ? <p role="alert">{t('humanInbox.reply.failed')}</p> : null}
          <div className="bh-human-inbox-reply-actions">
            <Button
              size="sm"
              variant="primary"
              type="submit"
              disabled={sending || context?.canReply !== true || draft.trim().length === 0}
            >
              {t(sending ? 'humanInbox.reply.sending' : 'humanInbox.reply.send')}
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
