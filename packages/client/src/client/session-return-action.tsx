import { useEffect, useState, type ReactElement } from 'react';

import { Button, MenuItemButton } from '@deepseek-ai/dsh-client-ui-primitives';
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';

import { PersonaBotAvatar } from './avatar.js';
import { BotIcon } from './bot-icon.js';
import type { SessionBotOwner } from './bridge.js';
import { LOCALE_NS } from './locale.js';

export interface SessionReturnInjected {
  resolveOwner: (sessionId: string, signal: AbortSignal) => Promise<SessionBotOwner | undefined>;
  returnToBot: (botSlug: string) => Promise<void>;
}

export type SessionReturnActionProps = PropsRuntime<'conversation.session.header.actions'> &
  PropsLocale<typeof LOCALE_NS> &
  InjectFace<SessionReturnInjected>;

export type SessionReturnMenuItemProps = PropsRuntime<'sidebar.workspaces.session.menu.item'> &
  PropsLocale<typeof LOCALE_NS> &
  InjectFace<SessionReturnInjected>;

function useSessionOwner(
  sessionId: string,
  resolveOwner: SessionReturnInjected['resolveOwner'],
): SessionBotOwner | undefined {
  const [resolved, setResolved] = useState<{ sessionId: string; owner?: SessionBotOwner }>();
  useEffect(() => {
    const controller = new AbortController();
    void resolveOwner(sessionId, controller.signal)
      .then((owner) => {
        if (!controller.signal.aborted)
          setResolved(owner === undefined ? { sessionId } : { sessionId, owner });
      })
      .catch(() => {
        if (!controller.signal.aborted) setResolved({ sessionId });
      });
    return () => controller.abort();
  }, [sessionId, resolveOwner]);
  return resolved?.sessionId === sessionId ? resolved.owner : undefined;
}

/** A Session-scoped navigation action; unknown and Subagent Sessions render no entry. */
export function SessionReturnAction({
  sessionId,
  resolveOwner,
  returnToBot,
  t,
}: SessionReturnActionProps): ReactElement | null {
  const owner = useSessionOwner(sessionId, resolveOwner);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [sessionId]);

  if (owner === undefined) return null;
  const open = async (): Promise<void> => {
    setBusy(true);
    setFailed(false);
    try {
      await returnToBot(owner.botSlug);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button
      variant="ghost"
      size="sm"
      className="bh-session-return-action"
      icon={
        <PersonaBotAvatar
          personaBotId={owner.botSlug}
          name={owner.displayName}
          src={owner.avatar}
          size={20}
          indicator={false}
          t={t}
        />
      }
      disabled={busy}
      onClick={() => void open()}
    >
      {failed
        ? t('sessions.return.failed')
        : t('sessions.return.action', { name: owner.displayName })}
    </Button>
  );
}

/** Native Session row menu entry, visible only for owned root Sessions. */
export function SessionReturnMenuItem({
  sessionId,
  useMenuOpenState,
  resolveOwner,
  returnToBot,
  t,
}: SessionReturnMenuItemProps): ReactElement | null {
  const owner = useSessionOwner(sessionId, resolveOwner);
  const [, setMenuOpen] = useMenuOpenState();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [sessionId]);
  if (owner === undefined) return null;

  return (
    <MenuItemButton
      icon={<BotIcon icon="bot" size={16} />}
      disabled={busy}
      separatorBefore
      onSelect={() => {
        setBusy(true);
        setFailed(false);
        void returnToBot(owner.botSlug)
          .then(() => setMenuOpen(false))
          .catch(() => setFailed(true))
          .finally(() => setBusy(false));
      }}
    >
      {failed ? t('sessions.return.failed') : t('sessions.return.label')}
    </MenuItemButton>
  );
}
