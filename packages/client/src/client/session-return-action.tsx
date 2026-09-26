import { useEffect, useState, type ReactElement } from 'react';

import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';

import { PersonaBotAvatar } from './avatar.js';
import type { SessionBotOwner } from './bridge.js';
import { LOCALE_NS } from './locale.js';

export interface SessionReturnInjected {
  resolveOwner: (sessionId: string, signal: AbortSignal) => Promise<SessionBotOwner | undefined>;
  returnToBot: (botSlug: string) => Promise<void>;
}

export type SessionReturnActionProps = PropsRuntime<'conversation.session.header.actions'> &
  PropsLocale<typeof LOCALE_NS> &
  InjectFace<SessionReturnInjected>;

/** A Session-scoped navigation action; unknown and Subagent Sessions render no entry. */
export function SessionReturnAction({
  sessionId,
  resolveOwner,
  returnToBot,
  t,
}: SessionReturnActionProps): ReactElement | null {
  const [owner, setOwner] = useState<SessionBotOwner>();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setOwner(undefined);
    setFailed(false);
    void resolveOwner(sessionId, controller.signal)
      .then((found) => {
        if (!controller.signal.aborted) setOwner(found);
      })
      .catch(() => {
        if (!controller.signal.aborted) setOwner(undefined);
      });
    return () => controller.abort();
  }, [sessionId, resolveOwner]);

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
