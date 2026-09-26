import { useEffect, useMemo, useState, type ReactElement } from 'react';

import {
  Button,
  Input,
  MarkdownText,
  StateDot,
  type MarkdownLabels,
} from '@deepseek-ai/dsh-client-ui-primitives';

import { channelAttachmentUrl, errorMessage } from './bridge.js';
import { PersonaBotAvatar } from './avatar.js';
import { openModelsSettings } from './bot-settings-open.js';
import { referenceRuns } from './channel-refs.js';
import type { BridgeActions, HostDirectoryListing } from './actions.js';
import { FolderBrowser, WORKSPACE_GRANTS_CHANGED } from './workspace-grants-entry.js';
import type { BotHarnessTranslate } from './locale.js';
import { store, type BotSummary, type ChannelMessage } from './store.js';

// DSH's memoized primitive carries React 19 types; this Client still uses React 18 types.
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
  t,
  nativeChatT,
}: {
  message: ChannelMessage;
  t: BotHarnessTranslate;
  nativeChatT?: NativeChatFailureText | undefined;
}): ReactElement {
  const failure = message.sessionFailure!;
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
  const botSlug = message.author.kind === 'bot' ? message.author.slug : undefined;
  const [status, setStatus] = useState<'loading' | 'pending' | 'expired' | 'decided'>(
    decision === undefined ? 'loading' : 'decided',
  );
  const [busy, setBusy] = useState(false);
  const [confirmAll, setConfirmAll] = useState(false);
  const [error, setError] = useState<string | undefined>();
  useEffect(() => {
    if (decision !== undefined) {
      setStatus('decided');
      return;
    }
    if (botSlug === undefined) return;
    let active = true;
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
    refreshStatus();
    window.addEventListener(WORKSPACE_GRANTS_CHANGED, onGrantChanged);
    return () => {
      active = false;
      window.removeEventListener(WORKSPACE_GRANTS_CHANGED, onGrantChanged);
    };
  }, [actions, botSlug, decision, message.id]);
  const decide = (
    outcome: 'allowed-once' | 'allowed-always-exact' | 'allowed-always-all' | 'rejected',
  ): void => {
    if (botSlug === undefined || busy || status !== 'pending') return;
    setBusy(true);
    setError(undefined);
    const channelId = 'dm-' + botSlug;
    if (store.getSnapshot().conversation.channel?.id !== channelId) {
      setError(t('approval.channelChanged'));
      setBusy(false);
      return;
    }
    void actions
      .decideToolApproval(channelId, message.id, outcome)
      .then(
        () => setStatus('decided'),
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
    <div className="bh-tool-approval-card">
      <div className="bh-grant-request-title">{t('approval.requestTitle')}</div>
      <div className="bh-note">
        {request.role === 'assignment' ? t('approval.assignment') : t('approval.orchestrator')}
        {' · '}
        {request.toolName}
      </div>
      <div className="bh-note">{t('approval.cwd', { path: request.cwd })}</div>
      <pre className="bh-tool-approval-input">{request.input}</pre>
      <div className="bh-note">{t('approval.risk')}</div>
      {decision !== undefined ? (
        <div role="status" className="bh-note">
          {decision === 'rejected'
            ? t('approval.rejected')
            : decision === 'allowed-once'
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
      {error === undefined ? null : (
        <div className="bh-error" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}

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
  const request = message.userQuestionRequest!;
  const botSlug = message.author.kind === 'bot' ? message.author.slug : undefined;
  const [status, setStatus] = useState<
    'loading' | 'pending' | 'expired' | 'answered' | 'cancelled'
  >(resolution ?? 'loading');
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [custom, setCustom] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [statusError, setStatusError] = useState(false);
  const [statusRetry, setStatusRetry] = useState(0);

  useEffect(() => {
    if (resolution !== undefined) {
      setStatus(resolution);
      return;
    }
    if (botSlug === undefined) return;
    let active = true;
    setStatusError(false);
    void actions.userQuestionStatus('dm-' + botSlug, message.id).then(
      (value) => {
        if (active) setStatus(value);
      },
      () => {
        if (active) setStatusError(true);
      },
    );
    return () => {
      active = false;
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
    if (store.getSnapshot().conversation.channel?.id !== channelId) {
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
        () => setStatus('answered'),
        (cause: unknown) => {
          setError(errorMessage(cause));
          setStatus('loading');
          setStatusRetry((current) => current + 1);
        },
      )
      .finally(() => setBusy(false));
  };

  return (
    <div className="bh-question-card">
      <div className="bh-grant-request-title">{t('question.title')}</div>
      <details className="bh-question-source">
        <summary>{t('question.source')}</summary>
        <code>{request.sessionId}</code>
      </details>
      {request.questions.map((question) => (
        <div className="bh-question-item" key={question.id}>
          {question.header === undefined ? null : <div className="bh-note">{question.header}</div>}
          <div className="bh-question-prompt">{question.question}</div>
          {question.detail === undefined ? null : <div className="bh-note">{question.detail}</div>}
          {question.options?.map((option) => (
            <Button
              key={option.label}
              variant={(selected[question.id] ?? []).includes(option.label) ? 'primary' : 'outline'}
              disabled={status !== 'pending' || busy}
              aria-pressed={(selected[question.id] ?? []).includes(option.label)}
              onClick={() => choose(question.id, option.label, question.multiSelect === true)}
            >
              <span className="bh-question-option">
                <span>{option.label}</span>
                {option.description === undefined ? null : <small>{option.description}</small>}
              </span>
            </Button>
          ))}
          <label
            className="bh-question-custom"
            htmlFor={'bh-question-' + message.id + '-' + question.id}
          >
            {t('question.custom')}
          </label>
          <Input
            id={'bh-question-' + message.id + '-' + question.id}
            value={custom[question.id] ?? ''}
            disabled={status !== 'pending' || busy}
            maxLength={2000}
            placeholder={t('question.customPlaceholder')}
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

function GrantRequestCard({
  message,
  actions,
  resolved,
  t,
}: {
  message: ChannelMessage;
  actions: BridgeActions;
  resolved: boolean;
  t: BotHarnessTranslate;
}): ReactElement {
  const [listing, setListing] = useState<HostDirectoryListing | undefined>();
  const [busy, setBusy] = useState(false);
  const [opening, setOpening] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const botSlug = message.author.kind === 'bot' ? message.author.slug : undefined;
  const open = (): void => {
    if (botSlug === undefined || busy || opening) return;
    setOpening(true);
    setError(undefined);
    void actions
      .listHostFolders()
      .then(setListing, (cause: unknown) => {
        setError(errorMessage(cause));
      })
      .finally(() => setOpening(false));
  };
  const approve = (path: string): void => {
    if (botSlug === undefined || busy) return;
    setBusy(true);
    setError(undefined);
    void (async () => {
      try {
        const expectedChannel = `dm-${botSlug}`;
        if (store.getSnapshot().conversation.channel?.id !== expectedChannel) {
          throw new Error(t('grant.requestChannelChanged'));
        }
        const grant = await actions.authorizeWorkspacePath(botSlug, path);
        window.dispatchEvent(
          new CustomEvent(WORKSPACE_GRANTS_CHANGED, { detail: { slug: botSlug } }),
        );
        if (store.getSnapshot().conversation.channel?.id !== expectedChannel) {
          throw new Error(t('grant.requestChannelChanged'));
        }
        const sent = await actions.send(
          t('grant.requestApprovedMessage', { name: grant.workspaceTitle }),
          message.id,
        );
        if (!sent) throw new Error(t('grant.requestContinueFailed'));
        setCompleted(true);
        setListing(undefined);
      } catch (cause) {
        setError(errorMessage(cause));
      } finally {
        setBusy(false);
      }
    })();
  };
  return (
    <div className="bh-grant-request-card">
      <div className="bh-grant-request-title">{t('grant.requestTitle')}</div>
      <div className="bh-grant-request-reason">{message.body}</div>
      {resolved || completed ? (
        <div className="bh-note" role="status">
          {t('grant.requestResolved')}
        </div>
      ) : (
        <Button variant="primary" disabled={busy || opening} onClick={open}>
          {opening ? t('grant.loading') : t('grant.requestChoose')}
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
      mentions: NonNullable<ChannelMessage['mentions']>;
      text: string;
    }
  | undefined {
  if (message.author.kind !== 'bot' || !message.mentions?.length) return undefined;
  const mentions = [...message.mentions].sort((left, right) => left.start - right.start);
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
  t,
  actions,
  bots = [],
  grantRequestResolved = false,
  toolApprovalDecision,
  userQuestionResolution,
  nativeChatT,
}: {
  message: ChannelMessage;
  t: BotHarnessTranslate;
  actions?: BridgeActions;
  bots?: readonly BotSummary[];
  grantRequestResolved?: boolean;
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
  if (message.sessionFailure !== undefined)
    return <SessionFailureNotice message={message} t={t} nativeChatT={nativeChatT} />;
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
      <GrantRequestCard message={message} actions={actions} resolved={grantRequestResolved} t={t} />
    );
  }
  const leading = format === 'markdown' ? leadingBotMentions(message) : undefined;
  const renderMention = (mention: NonNullable<ChannelMessage['mentions']>[number], key: number) => {
    const bot = bots.find((candidate) => candidate.slug === mention.botSlug);
    const badge = (
      <>
        <span className="bh-inline-mention-avatar" aria-hidden="true">
          <PersonaBotAvatar
            personaBotId={mention.botSlug}
            name={bot?.displayName ?? mention.label}
            src={bot?.avatar}
            size={16}
            indicator={false}
            t={t}
          />
        </span>
        <span>{mention.label}</span>
      </>
    );
    if (actions === undefined)
      return (
        <span
          key={key}
          className="bh-inline-mention bh-inline-mention-sent"
          data-bot-id={mention.botSlug}
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
        aria-label={t('message.mention.openDm', { bot: mention.label })}
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
    if (actions === undefined)
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
          {referenceRuns(message.body, message.mentions ?? [], message.channelRefs ?? []).map(
            (run, index) =>
              run.mention !== undefined ? (
                renderMention(run.mention, index)
              ) : run.channelRef !== undefined ? (
                renderChannelRef(run.channelRef, index)
              ) : (
                <span key={index}>{run.text}</span>
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
          {message.attachments.map((ref, index) => {
            const url = channelAttachmentUrl(ref);
            return ['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(ref.mime) ? (
              <a
                className="bh-message-image-link"
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                key={`${ref.hash}-${index}`}
              >
                <img className="bh-message-image" src={url} alt={ref.name} loading="lazy" />
              </a>
            ) : (
              <a
                className="bh-message-file"
                href={url}
                download={ref.name}
                key={`${ref.hash}-${index}`}
              >
                <span aria-hidden="true">▤</span> {ref.name} ·{' '}
                {Math.max(1, Math.round(ref.size / 1024))} KB
              </a>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
