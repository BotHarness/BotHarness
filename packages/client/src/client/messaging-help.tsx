import type { ReactElement } from 'react';
import { IconInfoOutlineRegular, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives';
import type { BotHarnessTranslate } from './locale.js';

export function MessagingHelp({
  title,
  text,
  t,
}: {
  title: string;
  text: string;
  t: BotHarnessTranslate;
}): ReactElement {
  return (
    <Tooltip label={text} portal side="bottom" maxWidth={320} delayMs={250} openOnClick>
      <button
        type="button"
        className="bh-icon-btn bh-im-help"
        aria-label={t('im.infoFor', { title })}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') event.stopPropagation();
        }}
      >
        <IconInfoOutlineRegular size={16} />
      </button>
    </Tooltip>
  );
}
