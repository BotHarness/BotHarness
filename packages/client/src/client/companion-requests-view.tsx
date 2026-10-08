import { useRef, type ReactElement, type CSSProperties } from 'react';
import type { CompanionApproval } from '../../../core/src/companions/feed.js';
import type { BridgeActions } from './actions.js';
import type { BotHarnessTranslate } from './locale.js';
import { ToolApprovalCard } from './tool-approval-card.js';
import { useMountedResource } from './mounted-resource.js';

function PendingApproval({
  request,
  actions,
  live,
  t,
  onReleaseFocus,
}: {
  request: CompanionApproval;
  actions: BridgeActions | undefined;
  live: boolean;
  t: BotHarnessTranslate;
  onReleaseFocus(): void;
}): ReactElement {
  const release = useRef(onReleaseFocus);
  release.current = onReleaseFocus;
  const mounted = useMountedResource<HTMLLIElement>(
    (node) => () => {
      if (node.contains(document.activeElement)) queueMicrotask(() => release.current());
    },
    [request.messageId],
  );
  return (
    <li ref={mounted}>
      <div className="bh-companion-request-source">
        {t('companion.source', { name: request.channelName })}
      </div>
      {actions ? (
        <ToolApprovalCard
          message={{
            id: request.messageId,
            at: request.expiresAt,
            author: { kind: 'bot', slug: request.botSlug },
            body: '',
            toolApprovalRequest: request,
          }}
          actions={actions}
          t={t}
          companionTarget={{
            channelId: request.channelId,
            botSlug: request.botSlug,
            sessionId: request.sessionId,
            callId: request.callId,
            live,
          }}
        />
      ) : null}
    </li>
  );
}

export function CompanionRequests({
  requests,
  actions,
  live,
  t,
  style,
  restoreFocus,
  messageCount,
}: {
  requests: readonly CompanionApproval[];
  actions: BridgeActions | undefined;
  live: boolean;
  t: BotHarnessTranslate;
  style: CSSProperties;
  restoreFocus(): void;
  messageCount: number;
}): ReactElement {
  const root = useRef<HTMLElement>(null);
  const release = (): void => {
    const next = root.current?.querySelector<HTMLButtonElement>('button:not(:disabled)');
    if (next?.isConnected) next.focus();
    else restoreFocus();
  };
  return (
    <section
      ref={root}
      className="bh-companion-pending"
      aria-label={t('companion.requests')}
      style={style}
    >
      <header>
        {t('companion.requestCount', { count: requests.length })}
        {messageCount ? <div>{t('companion.messagesWaiting', { count: messageCount })}</div> : null}
      </header>
      <ol tabIndex={0} aria-label={t('companion.requestList')}>
        {requests.map((request) => (
          <PendingApproval
            key={request.messageId}
            request={request}
            actions={actions}
            live={live}
            t={t}
            onReleaseFocus={release}
          />
        ))}
      </ol>
    </section>
  );
}
