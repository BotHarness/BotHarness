import type { ReactElement, ReactNode } from 'react';
import type { ExternalSource } from '../../../core/src/messaging/inbound.js';
import type { BotHarnessTranslate } from './locale.js';

type Mention = ExternalSource['event']['mentions'][number];

interface MessageView {
  sourceEventId: string;
  messageId: string;
  senderId: string;
  senderName?: string;
  at: string;
  text: string;
  mentions?: readonly Mention[];
}

function messageText(text: string, mentions: readonly Mention[]): ReactNode {
  const named = mentions.filter((mention) => mention.key && mention.name);
  if (!named.length) return text;
  const keys = named
    .map((mention) => mention.key.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'))
    .sort((a, b) => b.length - a.length);
  return text.split(new RegExp(`(${keys.join('|')})(?![\\w])`, 'gu')).map((part, index) => {
    const mention = named.find((entry) => entry.key === part);
    return mention ? (
      <span className="bh-external-mention" title={mention.id} key={index}>
        @{mention.name}
      </span>
    ) : (
      part
    );
  });
}

function MessageCard({
  message,
  t,
}: {
  message: MessageView;
  t: BotHarnessTranslate;
}): ReactElement {
  const name = message.senderName ?? message.senderId;
  const date = new Date(message.at);
  const time = Number.isNaN(date.getTime())
    ? message.at
    : new Intl.DateTimeFormat(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(date);
  return (
    <article className="bh-external-message">
      <span className="bh-external-avatar" aria-hidden="true">
        {Array.from(name.trim())[0]?.toLocaleUpperCase() ?? '?'}
      </span>
      <div className="bh-external-message-main">
        <header className="bh-external-message-head">
          <strong title={message.senderId}>{name}</strong>
          <time dateTime={message.at} title={message.at}>
            {time}
          </time>
        </header>
        <div className="bh-external-message-text">
          {messageText(message.text, message.mentions ?? [])}
        </div>
        <details className="bh-external-details">
          <summary>{t('im.messageDetails')}</summary>
          <div className="bh-external-detail-body">
            <p>
              {t('im.messageReference', {
                messageId: message.messageId,
                sourceEventId: message.sourceEventId,
              })}
            </p>
            <p>
              {message.senderName
                ? `${message.senderName} (${message.senderId})`
                : message.senderId}
            </p>
            <p>{message.at}</p>
            {message.mentions?.length ? (
              <>
                <p>
                  {message.mentions
                    .map(
                      (mention) => `${mention.key} → ${mention.name ?? mention.id} (${mention.id})`,
                    )
                    .join(' · ')}
                </p>
                <p className="bh-external-raw-text">{message.text}</p>
              </>
            ) : null}
          </div>
        </details>
      </div>
    </article>
  );
}

export function ExternalSourceContent({
  source,
  t,
  children,
}: {
  source: ExternalSource;
  t: BotHarnessTranslate;
  children?: ReactNode;
}): ReactElement {
  const platform =
    source.platform === 'feishu'
      ? 'Lark / 飞书'
      : source.platform === 'lark'
        ? 'Lark'
        : source.platform;
  const hasThread = Boolean(source.event.reply.threadId ?? source.event.reply.rootId);
  const messages = [...(source.contextMessages ?? [])].sort((a, b) => a.at.localeCompare(b.at));
  return (
    <div className="bh-external-source-content">
      <header className="bh-external-route">
        <div className="bh-external-route-head">
          <span className="bh-external-platform">{platform}</span>
          <span className="bh-external-scope">
            {t(hasThread ? 'im.threadLabel' : 'im.groupLabel')}
          </span>
        </div>
        <strong>{source.conversationName}</strong>
        <span>{t('im.receivedAs', { name: source.accountName })}</span>
        <details className="bh-external-details">
          <summary>{t('im.originDetails')}</summary>
          <div className="bh-external-detail-body">
            <p>
              {source.platform} · {source.event.conversation.id}
            </p>
            {source.event.reply.threadId ? <p>{source.event.reply.threadId}</p> : null}
            {source.event.reply.rootId ? <p>{source.event.reply.rootId}</p> : null}
          </div>
        </details>
      </header>
      {source.report ? (
        <section aria-label={t('im.relatedReport')} className="bh-external-context">
          <h3>{t('im.relatedReport')}</h3>
          <article className="bh-external-message">
            <span className="bh-external-avatar" aria-hidden="true">
              ↗
            </span>
            <div className="bh-external-message-main">
              <header className="bh-external-message-head">
                <strong>{source.report.accountName}</strong>
                <time dateTime={source.report.createdAt}>
                  {new Date(source.report.createdAt).toLocaleString()}
                </time>
              </header>
              <div className="bh-external-message-text">{source.report.text}</div>
              <details className="bh-external-details">
                <summary>{t('im.originDetails')}</summary>
                <div className="bh-external-detail-body">
                  <p>
                    {t('im.outboxId')}: {source.report.intentId}
                  </p>
                  <p>
                    {t('im.externalMessageId')}: {source.report.messageId}
                  </p>
                </div>
              </details>
            </div>
          </article>
        </section>
      ) : null}
      <section aria-label={t('im.sourceTitle')} className="bh-external-original">
        <MessageCard
          message={{
            sourceEventId: source.id,
            messageId: source.event.messageId,
            senderId: source.event.actor.id,
            ...(source.event.actor.name ? { senderName: source.event.actor.name } : {}),
            at: source.at,
            text: source.body,
            mentions: source.event.mentions,
          }}
          t={t}
        />
        {children}
      </section>
      {source.contextReads?.length ? (
        <section aria-label={t('im.contextTitle')} className="bh-external-context">
          <h3>{t('im.contextTitle')}</h3>
          <p className="bh-external-context-hint">{t('im.contextExplanation')}</p>
          {source.contextReads.map((read, index) =>
            read.outcome === 'refused' || read.incomplete ? (
              <p className="bh-external-notice" key={`${read.at}:${index}`}>
                {read.outcome === 'refused'
                  ? t('im.contextRefused', { reason: read.reason ?? 'history-unavailable' })
                  : t('im.contextIncomplete', { count: String(read.omitted) })}
              </p>
            ) : null,
          )}
          <details className="bh-external-details bh-external-audit">
            <summary>{t('im.readDetails', { count: String(source.contextReads.length) })}</summary>
            <div className="bh-external-detail-body">
              {source.contextReads.map((read, index) => (
                <div key={`${read.at}:${index}`}>
                  <p>
                    {read.scope} · {read.at} ·{' '}
                    {read.outcome === 'refused'
                      ? t('im.contextRefused', { reason: read.reason ?? 'history-unavailable' })
                      : t('im.contextCount', { count: String(read.sourceEventIds.length) })}
                  </p>
                  <p>{read.sourceEventIds.join(', ')}</p>
                </div>
              ))}
            </div>
          </details>
          <div className="bh-external-context-messages">
            {messages.map((message) => (
              <MessageCard key={message.sourceEventId} message={message} t={t} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
