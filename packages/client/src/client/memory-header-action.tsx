import { useState, useSyncExternalStore, type ReactElement } from 'react';
import {
  IconCheckOutlineRegular,
  IconEllipsisOutlineRegular,
  IconRefreshOutlineRegular,
  Menu,
  Tooltip,
  type MenuEntry,
} from '@deepseek-ai/dsh-client-ui-primitives';
import type { ChannelSidebarEntryProps } from './channel-sidebar.js';
import { channelSidebarPrefs } from './channel-sidebar-prefs.js';

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

/** Memory evolution keeps its display terminology in the same persisted sidebar preference. */
export function MemoryEvolutionHeaderAction(props: ChannelSidebarEntryProps): ReactElement {
  const [open, setOpen] = useState(false);
  const terminology = useSyncExternalStore(
    channelSidebarPrefs.subscribe,
    () => channelSidebarPrefs.getSnapshot().memoryTerminology,
  );
  const items: MenuEntry[] = [
    { type: 'label', id: 'terminology-label', text: props.t('memory.terminology') },
    {
      id: 'memory',
      label: props.t('memory.terms.memory'),
      icon: terminology === 'memory' ? <IconCheckOutlineRegular /> : undefined,
    },
    {
      id: 'git',
      label: props.t('memory.terms.git'),
      icon: terminology === 'git' ? <IconCheckOutlineRegular /> : undefined,
    },
  ];
  return (
    <div className="bh-memory-header-actions">
      <MemoryRefreshHeaderAction {...props} />
      <Menu
        open={open}
        portal
        dense
        align="end"
        anchor={
          <Tooltip label={props.t('memory.terminology')} side="bottom" delayMs={500}>
            <button
              type="button"
              className="bh-channel-sidebar-entry-action"
              aria-label={props.t('memory.terminology')}
              aria-expanded={open}
              onClick={() => setOpen((value) => !value)}
            >
              <IconEllipsisOutlineRegular size={16} />
            </button>
          </Tooltip>
        }
        items={items}
        onSelect={(id) => {
          if (id === 'memory' || id === 'git') channelSidebarPrefs.setMemoryTerminology(id);
          setOpen(false);
        }}
        onClose={() => setOpen(false)}
      />
    </div>
  );
}
