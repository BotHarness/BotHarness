import type { ReactElement } from 'react';
import { FileTypeIcon } from '@deepseek-ai/dsh-client-ui-primitives';
import type { BotHarnessTranslate } from './locale.js';

export function BridgeFile({
  channelId,
  sourceEventId,
  attachmentId,
  name,
  t,
}: {
  channelId: string;
  sourceEventId: string;
  attachmentId: string;
  name: string;
  t: BotHarnessTranslate;
}): ReactElement {
  const url =
    '/api/botharness/attachment?' + new URLSearchParams({ channelId, sourceEventId, attachmentId });
  return (
    <div className="bh-message-attachment">
      <a
        className="bh-message-file"
        href={url}
        download={name}
        aria-label={t('fileAction.download') + ': ' + name}
      >
        <span className="bh-message-file-icon" aria-hidden="true">
          <FileTypeIcon path={name} size={28} />
        </span>
        <span className="bh-message-file-copy">
          <span className="bh-message-file-name" title={name}>
            {name}
          </span>
          <span className="bh-message-file-size">{t('fileAction.download')}</span>
        </span>
      </a>
    </div>
  );
}
