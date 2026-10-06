import type { ReactElement } from 'react';
import type { MessagingInboundEvent } from '../../../core/src/messaging/provider.js';

export function ExternalMessageText({
  text,
  mentions,
  chip = false,
}: {
  text: string;
  mentions: readonly MessagingInboundEvent['mentions'][number][];
  chip?: boolean;
}): ReactElement {
  const named = mentions.filter((mention) => mention.key && mention.name?.trim());
  if (!named.length) return <>{text}</>;
  const keys = named
    .map((mention) => mention.key)
    .sort((a, b) => b.length - a.length)
    .map((key) => {
      const escaped = key.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
      return `${escaped}${/\w$/u.test(key) ? '(?![\\w])' : ''}`;
    });
  return (
    <>
      {text.split(new RegExp(`(${keys.join('|')})`, 'gu')).map((part, index) => {
        const mention = named.find((entry) => entry.key === part);
        return mention ? (
          <span
            className={`bh-external-mention${chip ? ' bh-inline-mention bh-inline-mention-sent' : ''}`}
            data-external-mention-id={mention.id}
            title={mention.id}
            key={index}
          >
            @{mention.name}
          </span>
        ) : (
          part
        );
      })}
    </>
  );
}
