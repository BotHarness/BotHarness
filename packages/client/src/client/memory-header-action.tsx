import type { ReactElement } from 'react';
import { IconRefreshOutlineRegular, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives';
import type { ChannelSidebarEntryProps } from './channel-sidebar.js';

/** The same quiet icon action used by other collapsible Channel sections. */
export function MemoryRefreshHeaderAction({
  requestRefresh,
  t,
}: ChannelSidebarEntryProps): ReactElement {
  return (
    <Tooltip label={t('memory.refresh')} side="bottom" delayMs={500}>
      <button
        type="button"
        className="bh-channel-sidebar-entry-action"
        aria-label={t('memory.refresh')}
        onClick={() => requestRefresh?.()}
      >
        <IconRefreshOutlineRegular size={16} />
      </button>
    </Tooltip>
  );
}
