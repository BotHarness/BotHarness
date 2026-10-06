import { externalPlatformLabel, externalSenderLabel } from './bridge-source-label.js';
import type { ReactElement, ReactNode } from 'react';
import { Tag } from '@deepseek-ai/dsh-client-ui-primitives';
import type { ExternalSource } from '../../../core/src/messaging/inbound.js';
import type { BotHarnessTranslate } from './locale.js';

type Mention = ExternalSource['event']['mentions'][number];
const pathMode = {
  all: 'members.wake.all',
  immediate: 'sourcePolicy.compactImmediate',
  digest: 'sourcePolicy.compactDigest',
  mentions: 'im.wake.mentions',
  silent: 'sourcePolicy.compactSilent',
  context: 'bridge.contextOnly',
  conditional: 'sourcePolicy.compactConditional',
} as const;

interface MessageView {
  sourceEventId: string;
  messageId: string;
  senderId: string;
  senderName?: string;
  senderLabel?: string;
  at: string;
  text: string;
  mentions?: readonly Mention[];
  voice?: ExternalSource['event']['voice'];
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
  media,
}: {
  message: MessageView;
  t: BotHarnessTranslate;
  media?: ReactNode;
}): ReactElement {
  const name = message.senderLabel ?? message.senderName ?? message.senderId;
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
        {message.voice ? (
          <div className="bh-external-message-head">
            <Tag tone={message.voice.transcript === 'platform' ? 'info' : 'warning'}>
              {t(
                message.voice.transcript === 'platform'
                  ? 'im.voiceTranscriptPlatform'
                  : 'im.voiceTranscriptUnavailable',
              )}
            </Tag>
            {message.voice.durationMs === undefined ? null : (
              <span>
                {t('im.voiceDuration', {
                  seconds: new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(
                    message.voice.durationMs / 1000,
                  ),
                })}
              </span>
            )}
          </div>
        ) : null}
        <div className="bh-external-message-text">
          {media}
          {media && message.text.trim() === '[Image]'
            ? null
            : message.voice?.transcript === 'unavailable'
              ? t('im.voiceTranscriptUnavailableHint')
              : messageText(message.text, message.mentions ?? [])}
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
            {message.voice?.itemId ? (
              <p>{t('im.voiceItemId', { id: message.voice.itemId })}</p>
            ) : null}
            {media && !message.mentions?.length ? (
              <p className="bh-external-raw-text">{message.text}</p>
            ) : null}
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
  messageMedia,
}: {
  source: ExternalSource;
  t: BotHarnessTranslate;
  children?: ReactNode;
  messageMedia?: ReactNode;
}): ReactElement {
  const platform = externalPlatformLabel(source.platform, t);
  const hasThread = Boolean(source.event.reply.threadId ?? source.event.reply.rootId);
  const messages = [...(source.contextMessages ?? [])].sort((a, b) => a.at.localeCompare(b.at));
  return (
    <div className="bh-external-source-content">
      <header className="bh-external-route">
        <div className="bh-external-route-head">
          <span className="bh-external-platform">{platform}</span>
          <span className="bh-external-scope">
            {t(
              hasThread
                ? 'im.threadLabel'
                : source.event.conversation.kind === 'dm'
                  ? 'im.dmLabel'
                  : 'im.groupLabel',
            )}
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
      {source.receptionPaths?.length ? (
        <details className="bh-external-details">
          <summary>
            {t('bridge.paths')} · {source.receptionPaths.length}
          </summary>
          <dl className="bh-bridge-source-fields">
            {source.receptionPaths.map((path) => (
              <div key={path.routeId}>
                <dt>{path.channelName ?? path.channelId ?? t('bridge.inboxOnly')}</dt>
                <dd>
                  {t('bridge.pathEvidence', {
                    route: path.name ?? path.routeId,
                    revision: String(path.routeRevision),
                    target: t(pathMode[path.mode], {
                      count: String(path.count),
                      seconds: String(path.intervalMs / 1000),
                    }),
                  })}
                </dd>
              </div>
            ))}
          </dl>
        </details>
      ) : null}
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
            senderLabel: externalSenderLabel(
              {
                platform: source.platform,
                senderId: source.event.actor.id,
                ...(source.event.actor.name ? { senderName: source.event.actor.name } : {}),
              },
              t,
            ),
            ...(source.event.actor.name ? { senderName: source.event.actor.name } : {}),
            at: source.at,
            text: source.body,
            mentions: source.event.mentions,
            ...(source.event.voice ? { voice: source.event.voice } : {}),
          }}
          t={t}
          media={messageMedia}
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
