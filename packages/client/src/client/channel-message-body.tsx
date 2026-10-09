import { SidebarCardList, SidebarCardRow } from './sidebar-card.js';
import { OnboardingWelcome } from './onboarding-view.js';
import { BridgeImage } from './bridge-image.js';
import { ExternalMessageText } from './external-message-text.js';
import { MessageAttachment } from './message-attachment.js';
import { createContext, useContext, useMemo, useRef, useState, type ReactElement } from 'react';

import {
  Button,
  Input,
  MarkdownText,
  StateDot,
  type MarkdownLabels,
} from '@deepseek-ai/dsh-client-ui-primitives';

import { errorMessage, type ToolApprovalExecutionState } from './bridge.js';
import { PersonaBotAvatar } from './avatar.js';
import { openModelsSettings } from './bot-settings-open.js';
import { currentMentionLabel } from './actor-names.js';
import type { ChannelHumanMember } from './store.js';
import { referenceRuns } from './channel-refs.js';
import type { BridgeActions, HostDirectoryListing } from './actions.js';
import { FolderBrowser } from './workspace-grants-entry.js';
import { WORKSPACE_GRANTS_CHANGED } from './workspace-grant-events.js';
import type { BotHarnessTranslate } from './locale.js';
import { store, type BotSummary, type ChannelMessage } from './store.js';
import { useMountedResource } from './mounted-resource.js';

const ChannelMarkdownText = MarkdownText as unknown as (
  props: Parameters<typeof MarkdownText>[0],
) => ReactElement;

export type NativeChatFailureText = (key: 'message.turnError' | 'message.failure.auth') => string;

function failureSummary(
  failure: NonNullable<ChannelMessage['sessionFailure']>,
  t: BotHarnessTranslate,
  nativeChatT?: NativeChatFailureText,
): string {
  switch (failure.code) {
    case 'AUTH':
      return nativeChatT?.('message.failure.auth') ?? t('failure.auth');
    case 'MISSING_CREDENTIAL':
      return t('failure.missingCredential');
    case 'INVALID_CREDENTIAL':
      return t('failure.invalidCredential');
    case 'QUOTA':
      return t('failure.quota');
    case 'RATE_LIMIT':
      return t('failure.rateLimit');
    case 'TRANSPORT':
      return t('failure.transport');
    case 'TIMEOUT':
      return t('failure.timeout');
    case 'SERVER':
      return t('failure.server');
    default:
      return t('failure.generic');
  }
}

function SessionFailureNotice({
  message,
  channelId,
  actions,
  t,
  nativeChatT,
}: {
  message: ChannelMessage;
  channelId?: string | undefined;
  actions?: BridgeActions | undefined;
  t: BotHarnessTranslate;
  nativeChatT?: NativeChatFailureText | undefined;
}): ReactElement {
  const failure = message.sessionFailure!;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const title = nativeChatT?.('message.turnError') ?? t('failure.title');
  const needsModels = ['AUTH', 'MISSING_CREDENTIAL', 'INVALID_CREDENTIAL', 'QUOTA'].includes(
    failure.code ?? '',
  );
  return (
    <div className="bh-session-failure-row" role="alert">
      <div className="bh-session-failure-heading">
        <StateDot state="error" />
        <span className="bh-session-failure-title">{title}</span>
        <span className="bh-session-failure-summary">
          {failureSummary(failure, t, nativeChatT)}
        </span>
        {failure.code === undefined ? null : (
          <code className="bh-session-failure-code">{failure.code}</code>
        )}
      </div>
      {failure.context === undefined ? null : (
        <div className="bh-session-failure-context">
          {t('failure.assignmentContext', { context: failure.context })}
        </div>
      )}
      {needsModels ? (
        <Button variant="outline" onClick={() => openModelsSettings()}>
          {t('failure.openModels')}
        </Button>
      ) : null}
      {failure.requestMessageId && actions && channelId ? (
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            setError(undefined);
            void actions
              .retryMessage(channelId, failure.requestMessageId!)
              .catch((cause) => setError(errorMessage(cause)))
              .finally(() => setBusy(false));
          }}
        >
          {t('onboarding.retryMessage')}
        </Button>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
      <details className="bh-session-failure-details">
        <summary>{t('failure.details')}</summary>
        <div>
          {t('failure.role', {
            role:
              failure.role === 'assignment' ? t('approval.assignment') : t('approval.orchestrator'),
          })}
        </div>
        {failure.status === undefined ? null : <div>HTTP {failure.status}</div>}
        <div className="bh-session-failure-raw">{failure.detail}</div>
        <code>{failure.sessionId}</code>
      </details>
    </div>
  );
}

function ToolApprovalCard({
  message,
  actions,
  decision,
  t,
}: {
  message: ChannelMessage;
  actions: BridgeActions;
  decision?:
    | 'allowed-once'
    | 'allowed-always-exact'
    | 'allowed-always-all'
    | 'rejected'
    | undefined;
  t: BotHarnessTranslate;
}): ReactElement {
  const request = message.toolApprovalRequest!;
  const [acceptedDecision, setAcceptedDecision] = useState<typeof decision>();
  const effectiveDecision = decision ?? acceptedDecision;
  const botSlug = message.author.kind === 'bot' ? message.author.slug : undefined;
  const [status, setStatus] = useState<'loading' | 'pending' | 'expired' | 'decided'>(
    decision === undefined ? 'loading' : 'decided',
  );
  const [busy, setBusy] = useState(false);
  const [confirmAll, setConfirmAll] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [executionState, setExecutionState] = useState<ToolApprovalExecutionState | undefined>();
  const approvalMount = useMountedResource<HTMLDivElement>(() => {
    if (effectiveDecision !== undefined) setStatus('decided');
    if (botSlug === undefined) return;
    let active = true;
    let poll: ReturnType<typeof setTimeout> | undefined;
    const refreshExecution = (): void => {
      if (request.role !== 'assignment' || actions.toolApprovalExecutionState === undefined) return;
      void actions.toolApprovalExecutionState('dm-' + botSlug, message.id).then(
        (value) => {
          if (!active) return;
          setExecutionState(value);
          if (
            value === 'waiting-human' ||
            value === 'waiting-capacity' ||
            (value === 'running' && effectiveDecision === undefined)
          )
            poll = setTimeout(refreshExecution, 1000);
        },
        () => {
          if (!active) return;
          setExecutionState(undefined);
          poll = setTimeout(refreshExecution, 2000);
        },
      );
    };
    const refreshStatus = (): void => {
      void actions.toolApprovalStatus('dm-' + botSlug, message.id).then(
        (value) => {
          if (active) {
            setStatus((current) =>
              current === 'expired' || current === 'decided' ? current : value,
            );
          }
        },
        () => {
          if (active) setStatus('expired');
        },
      );
    };
    const onGrantChanged = (event: Event): void => {
      if ((event as CustomEvent<{ slug: string }>).detail?.slug === botSlug) refreshStatus();
    };
    if (effectiveDecision === undefined) refreshStatus();
    refreshExecution();
    window.addEventListener(WORKSPACE_GRANTS_CHANGED, onGrantChanged);
    return () => {
      active = false;
      clearTimeout(poll);
      window.removeEventListener(WORKSPACE_GRANTS_CHANGED, onGrantChanged);
    };
  }, [actions, botSlug, effectiveDecision, message.id, request.role]);
  const decide = (
    outcome: 'allowed-once' | 'allowed-always-exact' | 'allowed-always-all' | 'rejected',
  ): void => {
    if (botSlug === undefined || busy || status !== 'pending') return;
    setBusy(true);
    setError(undefined);
    const channelId = 'dm-' + botSlug;
    if (
      store.getSnapshot().selection?.kind !== 'inbox' &&
      store.getSnapshot().conversation.channel?.id !== channelId
    ) {
      setError(t('approval.channelChanged'));
      setBusy(false);
      return;
    }
    void actions
      .decideToolApproval(channelId, message.id, outcome)
      .then(
        () => {
          setAcceptedDecision(outcome);
          setStatus('decided');
        },
        (cause: unknown) => {
          return actions.toolApprovalStatus(channelId, message.id).then(
            (latest) => {
              setStatus(latest);
              setError(latest === 'pending' ? errorMessage(cause) : undefined);
            },
            () => {
              setStatus('expired');
              setError(errorMessage(cause));
            },
          );
        },
      )
      .finally(() => setBusy(false));
  };
  return (
    <div ref={approvalMount} className="bh-tool-approval-card">
      <div className="bh-grant-request-title">{t('approval.requestTitle')}</div>
      <div className="bh-note">
        {request.role === 'assignment' ? t('approval.assignment') : t('approval.orchestrator')}
        {' · '}
        {request.toolName}
      </div>
      <div className="bh-note">{t('approval.cwd', { path: request.cwd })}</div>
      <pre className="bh-tool-approval-input">{request.input}</pre>
      <div className="bh-note">
        {t(
          request.toolName === 'channel_attachment_open'
            ? 'approval.originalRisk'
            : 'approval.risk',
        )}
      </div>
      {effectiveDecision !== undefined ? (
        <div role="status" className="bh-note">
          {effectiveDecision === 'rejected'
            ? t('approval.rejected')
            : effectiveDecision === 'allowed-once'
              ? t('approval.approved')
              : t('approval.ruleSaved')}
        </div>
      ) : status === 'pending' && !confirmAll ? (
        <div className="bh-tool-approval-actions">
          <Button variant="primary" disabled={busy} onClick={() => decide('allowed-once')}>
            {t('approval.allowOnce')}
          </Button>
          <Button variant="outline" disabled={busy} onClick={() => decide('allowed-always-exact')}>
            {t('approval.allowExact')}
          </Button>
          <Button variant="outline" disabled={busy} onClick={() => setConfirmAll(true)}>
            {t('approval.allowAll')}
          </Button>
          <Button variant="outline" disabled={busy} onClick={() => decide('rejected')}>
            {t('approval.reject')}
          </Button>
        </div>
      ) : confirmAll && status === 'pending' ? null : (
        <div role="status" className="bh-note">
          {status === 'loading' ? t('approval.loading') : t('approval.expired')}
        </div>
      )}
      {confirmAll && status === 'pending' ? (
        <div className="bh-tool-approval-confirm" role="group" aria-label={t('approval.allowAll')}>
          <div className="bh-note">{t('approval.allowAllRisk')}</div>
          <Button variant="primary" disabled={busy} onClick={() => decide('allowed-always-all')}>
            {t('approval.confirmAll')}
          </Button>
          <Button variant="outline" disabled={busy} onClick={() => setConfirmAll(false)}>
            {t('approval.cancel')}
          </Button>
        </div>
      ) : null}
      {executionState === 'waiting-human' ||
      executionState === 'waiting-capacity' ||
      executionState === 'needs-repair' ? (
        <div role="status" className="bh-note">
          {t(
            executionState === 'waiting-human'
              ? 'approval.waitingHumanCapacity'
              : executionState === 'waiting-capacity'
                ? 'approval.waitingCapacity'
                : 'approval.needsRepair',
          )}
        </div>
      ) : null}
      {error === undefined ? null : (
        <div className="bh-error" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}

export const MessageDeveloperMode = createContext(false);

function UserQuestionCard({
  message,
  actions,
  resolution,
  t,
}: {
  message: ChannelMessage;
  actions: BridgeActions;
  resolution?: 'answered' | 'cancelled' | undefined;
  t: BotHarnessTranslate;
}): ReactElement {
  const developerMode = useContext(MessageDeveloperMode);
  const request = message.userQuestionRequest!;
  const botSlug = message.author.kind === 'bot' ? message.author.slug : undefined;
  const [status, setStatus] = useState<
    'loading' | 'pending' | 'submitted' | 'expired' | 'answered' | 'cancelled'
  >(resolution ?? 'loading');
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [custom, setCustom] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [statusError, setStatusError] = useState(false);
  const [statusRetry, setStatusRetry] = useState(0);

  const questionMount = useMountedResource<HTMLDivElement>(() => {
    if (resolution !== undefined) {
      setStatus(resolution);
      return;
    }
    if (botSlug === undefined) return;
    let active = true;
    let retry: ReturnType<typeof setTimeout> | undefined;
    setStatusError(false);
    const refresh = (): void => {
      void actions.userQuestionStatus('dm-' + botSlug, message.id).then(
        (value) => {
          if (active) {
            setStatus(value);
            if (value === 'submitted') retry = setTimeout(refresh, 800);
          }
        },
        () => {
          if (active) setStatusError(true);
        },
      );
    };
    refresh();
    return () => {
      active = false;
      clearTimeout(retry);
    };
  }, [actions, botSlug, message.id, resolution, statusRetry]);

  const choose = (id: string, label: string, multiSelect: boolean): void => {
    setSelected((current) => {
      const prior = current[id] ?? [];
      const next = multiSelect
        ? prior.includes(label)
          ? prior.filter((entry) => entry !== label)
          : [...prior, label]
        : [label];
      return { ...current, [id]: next };
    });
    if (!multiSelect) setCustom((current) => ({ ...current, [id]: '' }));
  };
  const submit = (): void => {
    if (botSlug === undefined || busy || status !== 'pending') return;
    const channelId = 'dm-' + botSlug;
    if (
      store.getSnapshot().selection?.kind !== 'inbox' &&
      store.getSnapshot().conversation.channel?.id !== channelId
    ) {
      setError(t('question.channelChanged'));
      return;
    }
    const answers = request.questions.map((question) => {
      const text = (custom[question.id] ?? '').trim();
      return {
        id: question.id,
        selected:
          text.length > 0 && question.multiSelect !== true ? [] : (selected[question.id] ?? []),
        ...(text.length > 0 ? { custom: text } : {}),
      };
    });
    if (answers.some((answer) => answer.selected.length === 0 && answer.custom === undefined)) {
      setError(t('question.required'));
      return;
    }
    setBusy(true);
    setError(undefined);
    void actions
      .answerUserQuestion(channelId, message.id, answers)
      .then(
        () => {
          if (request.callId === undefined) setStatus('answered');
          else {
            setStatus('submitted');
            setStatusRetry((current) => current + 1);
          }
        },
        (cause: unknown) => {
          setError(errorMessage(cause));
          setStatus('loading');
          setStatusRetry((current) => current + 1);
        },
      )
      .finally(() => setBusy(false));
  };

  return (
    <div ref={questionMount} className="bh-question-card">
      <div className="bh-grant-request-title">{t('question.title')}</div>
      {developerMode ? (
        <details className="bh-question-source">
          <summary>{t('question.source')}</summary>
          <code>{request.sessionId}</code>
        </details>
      ) : null}
      {request.questions.map((question) => (
        <div className="bh-question-item" key={question.id}>
          {developerMode && question.header !== undefined ? (
            <div className="bh-note">{question.header}</div>
          ) : null}
          <div className="bh-question-prompt">{question.question}</div>
          {question.detail === undefined ? null : <div className="bh-note">{question.detail}</div>}
          {question.options?.length ? (
            <SidebarCardList label={question.question} className="bh-message-card-list">
              {question.options.map((option) => (
                <SidebarCardRow
                  key={option.label}
                  title={option.label}
                  meta={option.description}
                  selection={{
                    checked: (selected[question.id] ?? []).includes(option.label),
                    multiple: question.multiSelect === true,
                  }}
                  disabled={status !== 'pending' || busy}
                  onClick={() => choose(question.id, option.label, question.multiSelect === true)}
                />
              ))}
            </SidebarCardList>
          ) : null}
          {question.options?.length ? null : (
            <label
              className="bh-question-custom"
              htmlFor={'bh-question-' + message.id + '-' + question.id}
            >
              {t('question.custom')}
            </label>
          )}
          <Input
            id={'bh-question-' + message.id + '-' + question.id}
            aria-label={t('question.custom')}
            value={custom[question.id] ?? ''}
            disabled={status !== 'pending' || busy}
            maxLength={2000}
            placeholder={t(
              question.options?.length ? 'question.otherPlaceholder' : 'question.customPlaceholder',
            )}
            onChange={(event) => {
              const value = event.target.value;
              setCustom((current) => ({ ...current, [question.id]: value }));
              if (question.multiSelect !== true && value.trim().length > 0) {
                setSelected((current) => ({ ...current, [question.id]: [] }));
              }
            }}
          />
        </div>
      ))}
      {status === 'pending' ? (
        <Button variant="primary" disabled={busy} onClick={submit}>
          {t('question.submit')}
        </Button>
      ) : (
        <div className="bh-note" role="status">
          {status === 'answered' ? (
            t('question.answered')
          ) : status === 'submitted' ? (
            t('question.submitted')
          ) : status === 'cancelled' ? (
            t('question.cancelled')
          ) : status === 'loading' ? (
            statusError ? (
              <>
                {t('question.statusUnavailable')}
                <Button variant="outline" onClick={() => setStatusRetry((current) => current + 1)}>
                  {t('question.retry')}
                </Button>
              </>
            ) : (
              t('approval.loading')
            )
          ) : (
            t('question.expired')
          )}
        </div>
      )}
      {error === undefined ? null : (
        <div className="bh-error" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}

export function GrantRequestCard({
  message,
  actions,
  resolved,
  workspacePickerRequest,
  compact = false,
  beforeOpen,
  t,
}: {
  message: ChannelMessage;
  actions: BridgeActions;
  workspacePickerRequest?: number | undefined;
  resolved: boolean;
  compact?: boolean;
  beforeOpen?: () => Promise<boolean>;
  t: BotHarnessTranslate;
}): ReactElement {
  const [listing, setListing] = useState<HostDirectoryListing | undefined>();
  const [busy, setBusy] = useState(false);
  const [opening, setOpening] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const botSlug = message.author.kind === 'bot' ? message.author.slug : undefined;
  const open = (alreadyChecked = false): void => {
    if (botSlug === undefined || busy || opening || resolved || completed) return;
    setOpening(true);
    setError(undefined);
    void (async () => {
      if (!alreadyChecked && beforeOpen !== undefined && !(await beforeOpen())) return;
      return actions.listHostFolders().then(setListing, async (cause: unknown) => {
        if (
          cause instanceof Error &&
          'rpcError' in cause &&
          typeof cause.rpcError === 'object' &&
          cause.rpcError !== null &&
          'code' in cause.rpcError &&
          cause.rpcError.code === 'directory-picker/unavailable'
        ) {
          const path = await actions.pickWorkspaceFolder();
          if (path !== null) approve(path);
          return;
        }
        setError(errorMessage(cause));
      });
    })()
      .catch((cause: unknown) => setError(errorMessage(cause)))
      .finally(() => setOpening(false));
  };
  const approve = (path: string): void => {
    if (botSlug === undefined || busy) return;
    setBusy(true);
    setError(undefined);
    void (async () => {
      try {
        await actions.resolveWorkspaceGrantRequest(botSlug, message.id, path, (name) =>
          t('grant.requestApprovedMessage', { name }),
        );
        setCompleted(true);
        setListing(undefined);
      } catch (cause) {
        setError(errorMessage(cause));
      } finally {
        setBusy(false);
      }
    })();
  };
  const openedRequest = useRef<number>();
  const pickerTrigger = useMountedResource<HTMLDivElement>(() => {
    if (
      workspacePickerRequest !== undefined &&
      workspacePickerRequest !== openedRequest.current &&
      !resolved &&
      !completed
    ) {
      openedRequest.current = workspacePickerRequest;
      open(true);
    }
  }, [workspacePickerRequest]);
  return (
    <div
      className={compact ? 'bh-human-inbox-grant-action' : 'bh-grant-request-card'}
      ref={pickerTrigger}
    >
      {compact ? null : (
        <>
          <div className="bh-grant-request-title">{t('grant.requestTitle')}</div>
          <div className="bh-grant-request-reason">{message.body}</div>
        </>
      )}
      {resolved || completed ? (
        <div className="bh-note" role="status">
          {t('grant.requestResolved')}
        </div>
      ) : (
        <Button
          variant="primary"
          size={compact ? 'sm' : 'md'}
          disabled={busy || opening}
          onClick={() => open()}
        >
          {opening
            ? t('grant.loading')
            : t(compact ? 'humanInbox.grant.handle' : 'grant.requestChoose')}
        </Button>
      )}
      {error === undefined ? null : (
        <div className="bh-error" role="alert">
          {error}
        </div>
      )}
      {listing === undefined ? null : (
        <FolderBrowser
          initial={listing}
          actions={actions}
          onCancel={() => setListing(undefined)}
          onChoose={approve}
          busy={busy}
          t={t}
        />
      )}
    </div>
  );
}

function leadingBotMentions(message: ChannelMessage):
  | {
      mentions: (
        | NonNullable<ChannelMessage['mentions']>[number]
        | NonNullable<ChannelMessage['humanMentions']>[number]
      )[];
      text: string;
    }
  | undefined {
  if (message.author.kind !== 'bot') return undefined;
  const mentions = [...(message.mentions ?? []), ...(message.humanMentions ?? [])].sort(
    (left, right) => left.start - right.start,
  );
  if (mentions.length === 0) return undefined;
  let cursor = 0;
  for (const mention of mentions) {
    if (
      mention.start !== cursor ||
      message.body.slice(mention.start, mention.end) !== '@' + mention.label
    )
      return undefined;
    cursor = mention.end;
    if (message.body[cursor] === ' ') cursor += 1;
    else if (cursor < message.body.length) return undefined;
  }
  return { mentions, text: message.body.slice(cursor) };
}

export function ChannelMessageBody({
  message,
  channelId,
  t,
  actions,
  bots = [],
  humanMembers = [],
  grantRequestResolved = false,
  workspacePickerRequest,
  toolApprovalDecision,
  userQuestionResolution,
  nativeChatT,
}: {
  message: ChannelMessage;
  channelId?: string | undefined;
  t: BotHarnessTranslate;
  actions?: BridgeActions;
  bots?: readonly BotSummary[];
  humanMembers?: readonly ChannelHumanMember[];
  grantRequestResolved?: boolean;
  workspacePickerRequest?: number | undefined;
  nativeChatT?: NativeChatFailureText | undefined;
  toolApprovalDecision?:
    | 'allowed-once'
    | 'allowed-always-exact'
    | 'allowed-always-all'
    | 'rejected'
    | undefined;
  userQuestionResolution?: 'answered' | 'cancelled' | undefined;
}): ReactElement {
  const labels = useMemo<MarkdownLabels>(
    () => ({
      code: {
        copyLabel: t('message.code.copy'),
        copiedLabel: t('message.code.copied'),
      },
      footnotes: t('message.footnotes'),
    }),
    [t],
  );
  const format = message.format ?? (message.author.kind === 'human' ? 'text' : 'markdown');
  if (message.contentPurged) return <div className="bh-bubble-body">{t('purge.purged')}</div>;
  if (message.onboardingWelcome !== undefined && actions !== undefined && channelId !== undefined)
    return <OnboardingWelcome actions={actions} channelId={channelId} t={t} />;
  if (message.sessionFailure !== undefined)
    return (
      <SessionFailureNotice
        message={message}
        channelId={channelId}
        actions={actions}
        t={t}
        nativeChatT={nativeChatT}
      />
    );
  if (message.toolApprovalRequest !== undefined && actions !== undefined) {
    return (
      <ToolApprovalCard message={message} actions={actions} decision={toolApprovalDecision} t={t} />
    );
  }
  if (message.userQuestionRequest !== undefined && actions !== undefined) {
    return (
      <UserQuestionCard
        message={message}
        actions={actions}
        resolution={userQuestionResolution}
        t={t}
      />
    );
  }
  if (message.grantRequest === true && actions !== undefined) {
    return (
      <GrantRequestCard
        message={message}
        actions={actions}
        resolved={grantRequestResolved || message.grantRequestResolved === true}
        workspacePickerRequest={workspacePickerRequest}
        t={t}
      />
    );
  }
  if (message.bridgeMedia && message.bridgeOrigin && channelId) {
    const media = message.bridgeMedia;
    const renderImage = (id: string, index: number) => {
      const item = media.items.find((image) => image.id === id);
      return item ? (
        <BridgeImage
          key={index}
          channelId={channelId}
          sourceEventId={message.bridgeOrigin!.sourceEventId}
          attachmentId={id}
          name={item.name}
          t={t}
        />
      ) : null;
    };
    return (
      <div className="bh-bubble-content bh-bridge-media-content">
        {media.parts ? (
          media.parts.map((part, index) =>
            part.kind === 'text' ? (
              <span key={index} className="bh-bubble-body">
                <ExternalMessageText
                  text={part.text}
                  mentions={message.bridgeOrigin!.mentions ?? []}
                  chip
                />
              </span>
            ) : (
              renderImage(part.id, index)
            ),
          )
        ) : (
          <>
            {message.body ? (
              <div className="bh-bubble-body">
                <ExternalMessageText
                  text={message.body}
                  mentions={message.bridgeOrigin!.mentions ?? []}
                  chip
                />
              </div>
            ) : null}
            {media.items.map((image, index) => renderImage(image.id, index))}
          </>
        )}
      </div>
    );
  }
  const leading = format === 'markdown' ? leadingBotMentions(message) : undefined;
  const renderMention = (
    mention:
      | NonNullable<ChannelMessage['mentions']>[number]
      | NonNullable<ChannelMessage['humanMentions']>[number],
    key: number,
  ) => {
    const label = currentMentionLabel(mention, bots, humanMembers);
    if ('humanId' in mention)
      return (
        <span
          key={key}
          className="bh-inline-mention bh-inline-mention-sent"
          data-human-id={mention.humanId}
          title={t('message.mention.humanType')}
        >
          @{label}
        </span>
      );
    const bot = bots.find((candidate) => candidate.slug === mention.botSlug);
    const badge = (
      <>
        <span className="bh-inline-mention-avatar" aria-hidden="true">
          <PersonaBotAvatar
            personaBotId={mention.botSlug}
            name={bot?.displayName ?? mention.label}
            src={bot?.avatar}
            appearance={bot?.appearance}
            avatarSeed={bot?.avatarSeed}
            size={16}
            indicator={false}
            t={t}
          />
        </span>
        <span>{label}</span>
      </>
    );
    if (actions === undefined)
      return (
        <span
          key={key}
          className="bh-inline-mention bh-inline-mention-sent"
          data-bot-id={mention.botSlug}
          title={t('message.mention.botType')}
        >
          {badge}
        </span>
      );
    return (
      <button
        key={key}
        type="button"
        className="bh-inline-mention bh-inline-mention-sent bh-inline-mention-link"
        data-bot-id={mention.botSlug}
        aria-label={t('message.mention.openDm', { bot: label })}
        onClick={() => void actions.openBot(mention.botSlug)}
      >
        {badge}
      </button>
    );
  };
  const renderChannelRef = (
    ref: NonNullable<ChannelMessage['channelRefs']>[number],
    key: number,
  ) => {
    const badge = <span>#{ref.label}</span>;
    if (
      actions === undefined ||
      !store.getSnapshot().channels.some((channel) => channel.id === ref.channelId)
    )
      return (
        <span key={key} className="bh-inline-mention bh-inline-mention-sent">
          {badge}
        </span>
      );
    return (
      <button
        key={key}
        type="button"
        className="bh-inline-mention bh-inline-mention-sent bh-inline-mention-link"
        data-channel-id={ref.channelId}
        aria-label={`Open channel ${ref.label}`}
        onClick={() => void actions.openChannel(ref.channelId)}
      >
        {badge}
      </button>
    );
  };
  return (
    <div className="bh-bubble-content">
      {message.body.length === 0 ? null : format === 'text' ? (
        <div className="bh-bubble-body">
          {referenceRuns(
            message.body,
            message.mentions ?? [],
            message.channelRefs ?? [],
            message.humanMentions ?? [],
          ).map((run, index) =>
            run.mention !== undefined ? (
              renderMention(run.mention, index)
            ) : run.humanMention !== undefined ? (
              renderMention(run.humanMention, index)
            ) : run.channelRef !== undefined ? (
              renderChannelRef(run.channelRef, index)
            ) : (
              <span key={index}>
                {message.author.kind === 'bridged' ? (
                  <ExternalMessageText
                    chip
                    text={run.text}
                    mentions={message.bridgeOrigin?.mentions ?? []}
                  />
                ) : (
                  run.text
                )}
              </span>
            ),
          )}
        </div>
      ) : (
        <div
          className={`bh-bubble-body bh-bubble-body-markdown${leading === undefined ? '' : ' bh-bubble-body-bot-mentions'}`}
        >
          {leading === undefined ? null : (
            <span className="bh-bot-mention-prefix">
              {leading.mentions.map((mention, index) => renderMention(mention, index))}
              {leading.text.length > 0 ? ' ' : null}
            </span>
          )}
          {leading === undefined || leading.text.length > 0 ? (
            <ChannelMarkdownText
              text={leading?.text ?? message.body}
              streaming={message.streaming === true}
              labels={labels}
            />
          ) : null}
        </div>
      )}
      {message.attachments?.length ? (
        <div className="bh-message-attachments">
          {message.attachments.map((ref, index) => (
            <MessageAttachment
              key={`${ref.fileId ?? ref.hash}-${index}`}
              attachment={ref}
              channelId={channelId}
              messageId={message.id}
              actions={actions}
              t={t}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
