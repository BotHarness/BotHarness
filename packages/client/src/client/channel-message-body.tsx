import { useMemo, type ReactElement } from 'react';

import { MarkdownText, type MarkdownLabels } from '@deepseek-ai/dsh-client-ui-primitives';

import { channelAttachmentUrl } from './bridge.js';
import type { BotHarnessTranslate } from './locale.js';
import type { ChannelMessage } from './store.js';

// DSH's memoized primitive carries React 19 types; this Client still uses React 18 types.
const ChannelMarkdownText = MarkdownText as unknown as (
  props: Parameters<typeof MarkdownText>[0],
) => ReactElement;

export function ChannelMessageBody({
  message,
  t,
}: {
  message: ChannelMessage;
  t: BotHarnessTranslate;
}): ReactElement {
  const labels = useMemo<MarkdownLabels>(
    () => ({
      code: {
        copyLabel: t('message.code.copy'),
        copiedLabel: t('message.code.copied'),
      },
      footnotes: t('message.footnotes'),
    }),
    [t],
  );
  const format = message.format ?? (message.author.kind === 'human' ? 'text' : 'markdown');
  return (
    <div className="bh-bubble-content">
      {message.body.length === 0 ? null : format === 'text' ? (
        <div className="bh-bubble-body">{message.body}</div>
      ) : (
        <div className="bh-bubble-body bh-bubble-body-markdown">
          <ChannelMarkdownText
            text={message.body}
            streaming={message.streaming === true}
            labels={labels}
          />
        </div>
      )}
      {message.attachments?.length ? (
        <div className="bh-message-attachments">
          {message.attachments.map((ref, index) => {
            const url = channelAttachmentUrl(ref);
            return ['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(ref.mime) ? (
              <a
                className="bh-message-image-link"
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                key={`${ref.hash}-${index}`}
              >
                <img className="bh-message-image" src={url} alt={ref.name} loading="lazy" />
              </a>
            ) : (
              <a
                className="bh-message-file"
                href={url}
                download={ref.name}
                key={`${ref.hash}-${index}`}
              >
                <span aria-hidden="true">▤</span> {ref.name} ·{' '}
                {Math.max(1, Math.round(ref.size / 1024))} KB
              </a>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
