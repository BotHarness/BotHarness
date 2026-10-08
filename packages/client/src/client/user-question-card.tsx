import { useId, useRef, useState, type ReactElement } from 'react';
import { Button, Input } from '@deepseek-ai/dsh-client-ui-primitives';
import { errorMessage } from './bridge.js';
import type { BridgeActions } from './actions.js';
import type { BotHarnessTranslate } from './locale.js';
import { store, type ChannelMessage } from './store.js';
import { useMountedResource } from './mounted-resource.js';
import type { CompanionRequestTarget } from './companion-requests.js';

export function UserQuestionCard({
  message,
  actions,
  resolution,
  t,
  companionTarget,
}: {
  message: ChannelMessage;
  actions: BridgeActions;
  resolution?: 'answered' | 'cancelled' | undefined;
  t: BotHarnessTranslate;
  companionTarget?: CompanionRequestTarget | undefined;
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
  const inputId = useId();
  const target = useRef(companionTarget);
  target.current = companionTarget;
  const mounted = useRef(false);
  const submitting = useRef(false);
  const qualified = (): boolean => {
    const current = target.current;
    return (
      current !== undefined &&
      current.live &&
      current.botSlug === botSlug &&
      current.channelId === 'dm-' + botSlug &&
      current.sessionId === request.sessionId
    );
  };

  const questionMount = useMountedResource<HTMLDivElement>(() => {
    mounted.current = true;
    let active = true;
    if (resolution !== undefined) {
      setStatus(resolution);
    } else if (botSlug !== undefined) {
      if (companionTarget) setStatus('loading');
      setStatusError(false);
      void actions.userQuestionStatus('dm-' + botSlug, message.id).then(
        (value) => {
          if (active) setStatus(value);
        },
        () => {
          if (active) setStatusError(true);
        },
      );
    }
    return () => {
      active = false;
      mounted.current = false;
    };
  }, [actions, botSlug, message.id, resolution, statusRetry, companionTarget?.live]);

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
    if (botSlug === undefined || submitting.current || status !== 'pending') return;
    if (companionTarget && !qualified()) return;
    const channelId = 'dm-' + botSlug;
    if (
      !companionTarget &&
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
    submitting.current = true;
    setError(undefined);
    const submitAnswer = async (): Promise<void> => {
      if (companionTarget) {
        const current = await actions.userQuestionStatus(channelId, message.id);
        if (!mounted.current || !qualified()) return;
        if (current !== 'pending') {
          setStatus(current);
          return;
        }
      }
      await actions.answerUserQuestion(channelId, message.id, answers);
      if (mounted.current) setStatus('answered');
    };
    void submitAnswer()
      .then(
        () => undefined,
        (cause: unknown) => {
          if (!mounted.current) return;
          setError(errorMessage(cause));
          setStatus('loading');
          setStatusRetry((current) => current + 1);
        },
      )
      .finally(() => {
        submitting.current = false;
        if (mounted.current) setBusy(false);
      });
  };
  const disabled = status !== 'pending' || busy || (companionTarget !== undefined && !qualified());

  return (
    <div ref={questionMount} className="bh-question-card">
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
              disabled={disabled}
              aria-pressed={(selected[question.id] ?? []).includes(option.label)}
              onClick={() => choose(question.id, option.label, question.multiSelect === true)}
            >
              <span className="bh-question-option">
                <span>{option.label}</span>
                {option.description === undefined ? null : <small>{option.description}</small>}
              </span>
            </Button>
          ))}
          <label className="bh-question-custom" htmlFor={inputId + '-' + question.id}>
            {t('question.custom')}
          </label>
          <Input
            id={inputId + '-' + question.id}
            value={custom[question.id] ?? ''}
            disabled={disabled}
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
        <Button variant="primary" disabled={disabled} onClick={submit}>
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
                <Button
                  variant="outline"
                  disabled={companionTarget !== undefined && !qualified()}
                  onClick={() => setStatusRetry((current) => current + 1)}
                >
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
