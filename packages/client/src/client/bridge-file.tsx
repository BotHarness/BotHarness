import { useMemo, useRef, useState, useSyncExternalStore, type ReactElement } from 'react';
import { FileTypeIcon, Menu } from '@deepseek-ai/dsh-client-ui-primitives';
import type { BridgeActions } from './actions.js';
import type { HostFileOptions } from './host-file-actions.js';
import { createBridgeFileResource } from './bridge-file-resource.js';
import type { BotHarnessTranslate } from './locale.js';

export function BridgeFile({
  channelId,
  sourceEventId,
  item,
  actions,
  t,
}: {
  channelId: string;
  sourceEventId: string;
  item: { id: string; name: string; mediaType?: string; sizeBytes?: number };
  actions?: Pick<BridgeActions, 'channelMediaApplications' | 'channelMediaOpen'> | undefined;
  t: BotHarnessTranslate;
}): ReactElement {
  const resource = useMemo(
    () => createBridgeFileResource(channelId, sourceEventId, item.id),
    [channelId, sourceEventId, item.id],
  );
  const state = useSyncExternalStore(
    resource.subscribe,
    resource.getSnapshot,
    resource.getSnapshot,
  );
  const [options, setOptions] = useState<HostFileOptions>();
  const [menuOpen, setMenuOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const close = () => {
    setMenuOpen(false);
    anchor.current?.focus();
  };
  const failure = {
    unavailable: 'bridgeFile.unavailable',
    tooLarge: 'bridgeFile.tooLarge',
    failed: 'bridgeFile.failed',
  } as const;
  const download = () => {
    close();
    void resource.run((blob) => {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = item.name;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  };
  const openMenu = () => {
    setOptions(undefined);
    void resource.run(async (_, signal) => {
      const next = (await actions?.channelMediaApplications(channelId, sourceEventId, item.id)) ?? {
        available: false,
        applications: [],
      };
      signal.throwIfAborted();
      setOptions(next);
      setMenuOpen(true);
    });
  };
  const size = state.size ?? item.sizeBytes;
  return (
    <div className="bh-message-attachment bh-bridge-file" data-media-id={item.id}>
      <div className="bh-message-file">
        <span className="bh-message-file-icon" aria-hidden="true">
          <FileTypeIcon path={item.name} size={28} />
        </span>
        <span className="bh-message-file-copy">
          <span className="bh-message-file-name" title={item.name}>
            {item.name}
          </span>
          <span className="bh-message-file-size">
            {state.mediaType ?? item.mediaType ?? t('bridgeFile.unknownType')} ·{' '}
            {size === undefined
              ? t('bridgeFile.unknownSize')
              : t('bridgeFile.bytes', { size: String(size) })}
          </span>
        </span>
      </div>
      <div className="bh-bridge-file-actions">
        <button
          type="button"
          className="bh-memory-view-action"
          disabled={state.busy}
          onClick={download}
        >
          {t(state.failure ? 'bridgeFile.retry' : 'fileAction.download')}
        </button>
        <button
          ref={anchor}
          type="button"
          className="bh-memory-view-action"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          disabled={state.busy}
          onClick={openMenu}
        >
          {t('bridgeFile.openWith')}
        </button>
        {state.busy ? (
          <button type="button" className="bh-memory-view-action" onClick={resource.cancel}>
            {t('common.cancel')}
          </button>
        ) : null}
      </div>
      {state.busy || state.failure ? (
        <div role="status" className="bh-note">
          {state.failure ? t(failure[state.failure]) : t('bridgeFile.loading')}
        </div>
      ) : null}
      <Menu
        open={menuOpen}
        portal
        dense
        autoFocus
        anchor={<span aria-hidden="true" />}
        getAnchorRect={() => anchor.current?.getBoundingClientRect() ?? null}
        items={
          options?.available
            ? [
                ...options.applications.map((app) => ({
                  id: app.id,
                  label: t('fileAction.openIn', { app: app.name }),
                  disabled: state.busy === true,
                })),
                ...(options.error
                  ? [{ type: 'label' as const, id: 'error', text: options.error }]
                  : []),
              ]
            : [
                { type: 'label', id: 'unavailable', text: t('fileAction.unavailable') },
                { id: 'download', label: t('fileAction.download') },
              ]
        }
        onClose={close}
        onSelect={(id) => {
          if (id === 'download') {
            download();
            return;
          }
          close();
          void resource.run(async (_, signal) => {
            signal.throwIfAborted();
            await actions?.channelMediaOpen(channelId, sourceEventId, item.id, { application: id });
          });
        }}
      />
    </div>
  );
}
