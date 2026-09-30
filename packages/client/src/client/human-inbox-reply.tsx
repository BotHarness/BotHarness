import { useRef, useState, type ReactElement } from 'react';

import type { BridgeActions } from './actions.js';
import type { BotHarnessTranslate } from './locale.js';
import { useMountedResource } from './mounted-resource.js';
import type { ChannelMessage, HumanAttentionItem } from './store.js';

export function HumanInboxReply({
  source,
  actions,
  t,
  botName,
  onClose,
}: {
  source: HumanAttentionItem;
  actions: BridgeActions;
  t: BotHarnessTranslate;
  botName: (slug: string) => string;
  onClose: () => void;
}): ReactElement {
  const channelId = source.channelId!;
  const messageId = source.messageId!;
  const [context, setContext] = useState<ChannelMessage[]>();
  const [contextError, setContextError] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState(false);
  const [sent, setSent] = useState<ChannelMessage>();
  const loading = useRef<AbortController>();
  const attempt = useRef<{ body: string; id: string }>();
  const submitting = useRef(false);
  const readMessages = useRef(new Set<string>());

  const reload = async (): Promise<void> => {
    loading.current?.abort();
    const controller = new AbortController();
    loading.current = controller;
    setContext(undefined);
    setContextError(false);
    try {
      const messages = await actions.humanInboxContext(channelId, messageId, controller.signal);
      if (!controller.signal.aborted) setContext(messages);
    } catch {
      if (!controller.signal.aborted) setContextError(true);
    }
  };
  const mount = useMountedResource<HTMLElement>(() => {
    void reload();
    return () => loading.current?.abort();
  }, [actions, channelId, messageId]);
  const visibleSource = useMountedResource<HTMLDivElement>(
    (element) => {
      if (typeof IntersectionObserver === 'undefined') return;
      const observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            const visibleId = entry.target.getAttribute('data-message-id');
            if (
              !entry.isIntersecting ||
              entry.intersectionRatio < 0.5 ||
              visibleId === null ||
              readMessages.current.has(visibleId)
            )
              continue;
            readMessages.current.add(visibleId);
            void actions.markRead(channelId, visibleId).catch(() => {
              readMessages.current.delete(visibleId);
            });
          }
        },
        { threshold: 0.5 },
      );
      for (const message of element.querySelectorAll('[data-message-id]'))
        observer.observe(message);
      return () => observer.disconnect();
    },
    [actions, channelId, messageId],
  );
  const submit = async (): Promise<void> => {
    const body = draft.trim();
    if (submitting.current || body.length === 0 || context === undefined || contextError) return;
    submitting.current = true;
    setSending(true);
    setSendError(false);
    if (attempt.current?.body !== body)
      attempt.current = { body, id: 'human-' + crypto.randomUUID() };
    try {
      const reply = await actions.replyFromHumanInbox(
        channelId,
        messageId,
        body,
        attempt.current.id,
      );
      setSent(reply);
      setDraft('');
      void actions.refreshHumanInbox().catch(() => undefined);
    } catch {
      setSendError(true);
    } finally {
      submitting.current = false;
      setSending(false);
    }
  };
  const author = (message: ChannelMessage): string =>
    message.author.kind === 'bot'
      ? botName(message.author.slug)
      : t(message.author.kind === 'human' ? 'humanInbox.reply.you' : 'humanInbox.reply.system');
  const target = context?.find((message) => message.id === messageId);
  const openSource = (id: string): void => {
    void actions.openChannelAtMessage(channelId, id).catch(() => {
      setContext(undefined);
      setContextError(true);
    });
  };

  return (
    <section
      className="bh-human-inbox-reply"
      ref={mount}
      aria-label={t('humanInbox.reply.title', { channel: source.channelName ?? '' })}
    >
      <div className="bh-human-inbox-reply-header">
        <h2>{t('humanInbox.reply.title', { channel: source.channelName ?? '' })}</h2>
        <button type="button" disabled={sending} onClick={onClose}>
          {t('humanInbox.reply.close')}
        </button>
      </div>
      {target === undefined ? (
        <p role={contextError ? 'alert' : 'status'}>
          {t(contextError ? 'humanInbox.reply.unavailable' : 'humanInbox.loading')}
        </p>
      ) : (
        <div ref={visibleSource}>
          <div className="bh-human-inbox-reply-source" data-message-id={messageId}>
            <strong>{author(target)}</strong>
            <p>{target.body}</p>
            {target.attachments?.map((attachment) => (
              <p key={attachment.hash}>{attachment.name}</p>
            ))}
          </div>
          <details className="bh-human-inbox-reply-context">
            <summary>{t('humanInbox.reply.context')}</summary>
            {context
              ?.filter((message) => message.id !== messageId)
              .map((message) => (
                <div key={message.id} data-message-id={message.id}>
                  <strong>{author(message)}</strong>
                  <p>{message.body}</p>
                </div>
              ))}
          </details>
        </div>
      )}
      {sent === undefined ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <label>
            <span>{t('humanInbox.reply.input')}</span>
            <textarea
              value={draft}
              rows={3}
              disabled={sending}
              onChange={(event) => setDraft(event.currentTarget.value)}
            />
          </label>
          {sendError ? <p role="alert">{t('humanInbox.reply.failed')}</p> : null}
          <div className="bh-human-inbox-reply-actions">
            <button type="button" disabled={sending} onClick={() => void reload()}>
              {t('humanInbox.reply.refresh')}
            </button>
            <button type="button" disabled={sending} onClick={() => openSource(messageId)}>
              {t('humanInbox.open')}
            </button>
            <button
              type="submit"
              disabled={
                sending || context === undefined || contextError || draft.trim().length === 0
              }
            >
              {t(sending ? 'humanInbox.reply.sending' : 'humanInbox.reply.send')}
            </button>
          </div>
        </form>
      ) : (
        <div role="status">
          <strong>{t('humanInbox.reply.sent')}</strong>
          <p>{sent.body}</p>
          <button type="button" onClick={() => openSource(sent.id)}>
            {t('humanInbox.open')}
          </button>
        </div>
      )}
    </section>
  );
}
