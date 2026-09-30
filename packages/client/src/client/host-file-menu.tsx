import { useRef, useState, type MouseEvent, type KeyboardEvent, type ReactElement } from 'react';
import {
  IconEllipsisOutlineRegular,
  Menu,
  Tooltip,
  writeClipboard,
  type MenuEntry,
} from '@deepseek-ai/dsh-client-ui-primitives';
import type { HostFileOpen, HostFileOptions, HostFileTarget } from './host-file-actions.js';
import type { BotHarnessTranslate } from './locale.js';
import { useMountedResource } from './mounted-resource.js';

export interface HostFileCommands {
  target(ownerId: string, targetId: string): Promise<HostFileTarget>;
  applications(ownerId: string, targetId: string): Promise<HostFileOptions>;
  open(ownerId: string, targetId: string, choice: HostFileOpen): Promise<void>;
  download?(ownerId: string, targetId: string): Promise<void>;
}

type MenuRequest = { path: string; x: number; y: number; returnFocus: HTMLElement };

function HostFileMenu({
  actions,
  slug,
  request,
  t,
  onClose,
}: {
  actions: HostFileCommands;
  slug: string;
  request: MenuRequest;
  t: BotHarnessTranslate;
  onClose: (message?: string) => void;
}): ReactElement {
  const [target, setTarget] = useState<HostFileTarget>();
  const [options, setOptions] = useState<HostFileOptions>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const proxy = useRef<HTMLSpanElement>(null);
  const mount = useMountedResource<HTMLSpanElement>(() => {
    let active = true;
    void actions.target(slug, request.path).then(
      async (next) => {
        if (!active) return;
        setTarget(next);
        try {
          const available = await actions.applications(slug, request.path);
          if (active) {
            setOptions(available);
            setError(available.error);
          }
        } catch (failure) {
          if (active) {
            setOptions({ available: false, applications: [] });
            setError(String(failure));
          }
        }
      },
      (failure: unknown) => {
        if (active) setError(failure instanceof Error ? failure.message : String(failure));
      },
    );
    return () => {
      active = false;
    };
  }, [actions, slug, request.path]);
  const focusMenu = useMountedResource<HTMLSpanElement>(() => {
    const timer = window.setTimeout(() => {
      const menus = document.querySelectorAll<HTMLElement>('[role="menu"]');
      menus
        .item(menus.length - 1)
        ?.querySelector<HTMLButtonElement>('button:not(:disabled)')
        ?.focus();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [options, error]);
  const items: MenuEntry[] = [
    { type: 'label', id: 'host-location', text: t('fileAction.host') },
    ...(target === undefined || options === undefined
      ? [{ type: 'label' as const, id: 'loading', text: error ?? t('fileAction.loading') }]
      : []),
    ...(options?.available === false
      ? [
          {
            type: 'label' as const,
            id: 'unavailable',
            text: t(
              target?.kind === 'directory'
                ? 'fileAction.directoryUnavailable'
                : 'fileAction.unavailable',
            ),
          },
        ]
      : []),
    ...(options?.applications ?? []).map((app) => ({
      id: `app:${app.id}`,
      label:
        t('fileAction.openIn', { app: app.name }) + (app.default ? t('fileAction.default') : ''),
      disabled: busy,
      icon:
        app.icon === null ? undefined : (
          <img
            className="bh-file-app-icon"
            src={app.icon}
            alt=""
            onError={(event) => {
              event.currentTarget.hidden = true;
            }}
          />
        ),
    })),
    ...(target?.kind === 'file' && options?.available === true
      ? [{ id: 'reveal', label: t('fileAction.reveal'), disabled: busy }]
      : []),
    { type: 'separator', id: 'transfer-separator' },
    ...(target?.kind === 'file' && actions.download !== undefined
      ? [{ id: 'download', label: t('fileAction.download'), disabled: busy }]
      : []),
    ...(target === undefined ? [] : [{ id: 'copy', label: t('fileAction.copy'), disabled: busy }]),
    ...(error === undefined || target === undefined
      ? []
      : [{ type: 'label' as const, id: 'error', text: error }]),
  ];
  const select = async (id: string): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    try {
      if (id === 'copy') {
        if (target === undefined || !(await writeClipboard(target.path)))
          throw new Error(t('fileAction.copyFailed'));
        onClose(t('fileAction.copied'));
      } else if (id === 'download') {
        await actions.download?.(slug, request.path);
        onClose(t('fileAction.downloadRequested'));
      } else {
        await actions.open(
          slug,
          request.path,
          id === 'reveal' ? { action: 'reveal' } : { application: id.slice(4) },
        );
        onClose(t('fileAction.dispatched'));
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setBusy(false);
    }
  };
  return (
    <span ref={mount} className="bh-menu-anchor" style={{ left: request.x, top: request.y }}>
      <span ref={focusMenu} />
      <Menu
        open
        portal
        dense
        autoFocus
        anchor={<span ref={proxy} aria-hidden="true" />}
        getAnchorRect={() => proxy.current?.getBoundingClientRect() ?? null}
        items={items}
        onSelect={(id) => {
          void select(id);
        }}
        onClose={() => {
          if (!busy) onClose();
        }}
      />
    </span>
  );
}

export function useHostFileMenu(
  actions: HostFileCommands | undefined,
  slug: string | undefined,
  t: BotHarnessTranslate,
) {
  const [request, setRequest] = useState<MenuRequest>();
  const [feedback, setFeedback] = useState<string>();
  const open = (
    path: string,
    event: MouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>,
  ): void => {
    if (actions === undefined || slug === undefined) return;
    event.preventDefault();
    event.stopPropagation();
    setFeedback(undefined);
    const anchor =
      event.target instanceof Element
        ? (event.target.closest<HTMLButtonElement>('button') ?? event.currentTarget)
        : event.currentTarget;
    const rect = anchor.getBoundingClientRect();
    const pointer = 'clientX' in event && event.type === 'contextmenu';
    setRequest({
      path,
      x: pointer ? event.clientX : rect.left,
      y: pointer ? event.clientY : rect.bottom,
      returnFocus: anchor,
    });
  };
  const onKey = (path: string, event: KeyboardEvent<HTMLElement>): void => {
    if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) open(path, event);
  };
  const close = (message?: string): void => {
    request?.returnFocus.focus();
    setRequest(undefined);
    setFeedback(message);
  };
  return {
    open,
    onKey,
    isOpen: request !== undefined,
    openTargetId: request?.path,
    menu:
      request === undefined || actions === undefined || slug === undefined ? null : (
        <HostFileMenu
          key={request.path}
          actions={actions}
          slug={slug}
          request={request}
          t={t}
          onClose={close}
        />
      ),
    feedback:
      feedback === undefined ? null : (
        <div className="bh-note bh-file-action-feedback" role="status">
          {feedback}
        </div>
      ),
  };
}

export function HostFileActionButton({
  actions,
  slug,
  path,
  text,
  className,
  t,
}: {
  actions: HostFileCommands;
  slug: string;
  path: string;
  text?: string;
  className?: string;
  t: BotHarnessTranslate;
}): ReactElement {
  const menu = useHostFileMenu(actions, slug, t);
  const button = (
    <button
      type="button"
      className={
        text === undefined
          ? 'bh-memory-view-icon-button'
          : ['bh-file-path-button', className].filter(Boolean).join(' ')
      }
      aria-label={t('fileAction.menu') + ': ' + (text ?? path)}
      aria-haspopup="menu"
      aria-expanded={menu.isOpen}
      title={text}
      onClick={(event) => menu.open(path, event)}
      onContextMenu={(event) => menu.open(path, event)}
      onKeyDown={(event) => menu.onKey(path, event)}
    >
      {text ?? <IconEllipsisOutlineRegular size={16} />}
    </button>
  );
  return (
    <>
      {text === undefined ? (
        <Tooltip label={t('fileAction.menu')} side="bottom" delayMs={500}>
          {button}
        </Tooltip>
      ) : (
        button
      )}
      {menu.menu}
      {menu.feedback}
    </>
  );
}
