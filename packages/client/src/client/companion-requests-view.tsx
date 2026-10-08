import { useRef, type ReactElement, type CSSProperties } from 'react';
import type { CompanionRequest } from '../../../core/src/companions/feed.js';
import type { BridgeActions } from './actions.js';
import type { BotHarnessTranslate } from './locale.js';
import { ToolApprovalCard } from './tool-approval-card.js';
import { UserQuestionCard } from './user-question-card.js';
import { useMountedResource } from './mounted-resource.js';

function PendingRequest({
  request,
  actions,
  live,
  t,
  onReleaseFocus,
}: {
  request: CompanionRequest;
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
      {actions && request.kind === 'tool-approval' ? (
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
      ) : actions && request.kind === 'user-question' ? (
        <UserQuestionCard
          message={{
            id: request.messageId,
            at: '',
            author: { kind: 'bot', slug: request.botSlug },
            body: '',
            userQuestionRequest: request,
          }}
          actions={actions}
          t={t}
          companionTarget={{
            channelId: request.channelId,
            botSlug: request.botSlug,
            sessionId: request.sessionId,
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
  requests: readonly CompanionRequest[];
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
          <PendingRequest
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
