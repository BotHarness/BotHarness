import { useRef, useState, useSyncExternalStore, type ReactElement } from 'react';
import { Menu, MenuItemButton, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives';
import type {
  ChannelSidebarEntry,
  ChannelSidebarEntryProps,
  ChannelSidebarSettingsProps,
} from './channel-sidebar.js';
import { ChannelSidebarIcon } from './channel-sidebar-icon.js';
import { channelSidebarPrefs } from './channel-sidebar-prefs.js';
import {
  sessionViewPreferenceSnapshot,
  subscribeSessionViewPreference,
  updateSessionViewPreference,
} from './session-view-prefs.js';

export function SessionsDisplaySettings({
  botSlug,
  t,
  onClose,
}: ChannelSidebarSettingsProps): ReactElement {
  const slug = botSlug ?? '';
  const preference = useSyncExternalStore(
    (listener) => subscribeSessionViewPreference(slug, listener),
    () => sessionViewPreferenceSnapshot(slug),
    () => sessionViewPreferenceSnapshot(slug),
  );
  return (
    <>
      <div className="bh-sidebar-settings-label">
        {t('entry.sessions')} · {t('sessions.view')}
      </div>
      {(['current', 'all'] as const).map((scope) => (
        <MenuItemButton
          key={scope}
          icon={preference.scope === scope ? <ChannelSidebarIcon name="check" /> : undefined}
          onSelect={() => {
            updateSessionViewPreference(slug, (current) => ({ ...current, scope }));
            onClose();
          }}
        >
          {t(scope === 'current' ? 'sessions.current' : 'sessions.all')}
        </MenuItemButton>
      ))}
      <div className="bh-sidebar-settings-label">{t('sessions.layout')}</div>
      {(['flat', 'workspace'] as const).map((layout) => (
        <MenuItemButton
          key={layout}
          icon={preference.layout === layout ? <ChannelSidebarIcon name="check" /> : undefined}
          onSelect={() => {
            updateSessionViewPreference(slug, (current) => ({ ...current, layout }));
            onClose();
          }}
        >
          {t(layout === 'flat' ? 'sessions.layout.flat' : 'sessions.layout.workspace')}
        </MenuItemButton>
      ))}
    </>
  );
}

export function MemoryDisplaySettings({ t, onClose }: ChannelSidebarSettingsProps): ReactElement {
  const terminology = useSyncExternalStore(
    channelSidebarPrefs.subscribe,
    () => channelSidebarPrefs.getSnapshot().memoryTerminology,
    () => channelSidebarPrefs.getSnapshot().memoryTerminology,
  );
  return (
    <>
      <div className="bh-sidebar-settings-label">
        {t('entry.memoryEvolution')} · {t('memory.terminology')}
      </div>
      {(['memory', 'git'] as const).map((term) => (
        <MenuItemButton
          key={term}
          icon={terminology === term ? <ChannelSidebarIcon name="check" /> : undefined}
          onSelect={() => {
            channelSidebarPrefs.setMemoryTerminology(term);
            onClose();
          }}
        >
          {t(term === 'memory' ? 'memory.terms.memory' : 'memory.terms.git')}
        </MenuItemButton>
      ))}
    </>
  );
}

export function ChannelSidebarSettings({
  entries,
  entryProps,
}: {
  entries: readonly ChannelSidebarEntry[];
  entryProps: ChannelSidebarEntryProps;
}): ReactElement {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const settings = entries.filter((entry) => entry.settings !== undefined);
  const close = () => setOpen(false);
  const label = entryProps.t('sidebar.settings');
  return (
    <Menu
      open={open}
      portal
      dense
      autoFocus
      align="end"
      className="bh-sidebar-settings-menu"
      listClassName="bh-sidebar-settings-list"
      getAnchorRect={() => anchor.current?.getBoundingClientRect() ?? null}
      anchor={
        <Tooltip label={label} side="bottom" delayMs={500}>
          <button
            ref={anchor}
            type="button"
            className="bh-sidebar-toggle bh-sidebar-settings"
            aria-label={label}
            aria-haspopup="menu"
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
          >
            <ChannelSidebarIcon name="settings" />
          </button>
        </Tooltip>
      }
      onClose={close}
    >
      {settings.map((entry) => {
        const Settings = entry.settings!;
        return <Settings key={entry.id} {...entryProps} onClose={close} />;
      })}
      {settings.length === 0 ? (
        <MenuItemButton disabled onSelect={close}>
          {entryProps.t('sidebar.settings.empty')}
        </MenuItemButton>
      ) : null}
    </Menu>
  );
}
