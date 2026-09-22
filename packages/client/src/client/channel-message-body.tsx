import { useMemo, type ReactElement } from 'react';

import { MarkdownText, type MarkdownLabels } from '@deepseek-ai/dsh-client-ui-primitives';

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
  if (format === 'text') return <div className="bh-bubble-body">{message.body}</div>;
  return (
    <div className="bh-bubble-body bh-bubble-body-markdown">
      <ChannelMarkdownText
        text={message.body}
        streaming={message.streaming === true}
        labels={labels}
      />
    </div>
  );
}
