import { useRef, useState, type ReactElement } from 'react';

import { Button, Input, Tag } from '@deepseek-ai/dsh-client-ui-primitives';

import type { MarketplaceEntry } from '../../../core/src/marketplace/client.js';
import type { BridgeActions } from './actions.js';
import { PersonaBotAvatar } from './avatar.js';
import { BridgeCallError, errorMessage } from './bridge.js';
import type { BotHarnessKey, BotHarnessTranslate } from './locale.js';
import { Modal } from './modal.js';
import { useMountedResource } from './mounted-resource.js';
import { personaBotCreateError } from './persona-bot-create.js';

const marketplaceErrorKeys: Record<string, BotHarnessKey> = {
  'marketplace-unavailable': 'market.error.unavailable',
  'invalid-repository-url': 'market.error.invalidUrl',
  'repository-not-found': 'market.error.notFound',
  'repository-private': 'market.error.private',
  'repository-archived': 'market.error.archived',
  'repository-missing-topic': 'market.error.missingTopic',
  'repository-blocked': 'market.error.blocked',
  'upstream-unavailable': 'market.error.upstream',
};

export function marketplaceError(error: unknown, t: BotHarnessTranslate): string {
  if (error instanceof BridgeCallError) {
    const key = marketplaceErrorKeys[error.code];
    if (key !== undefined) return t(key);
  }
  return errorMessage(error);
}

export function shortSha(sha: string): string {
  return sha.slice(0, 7);
}

function day(value: string): string {
  return value.slice(0, 10);
}

type ListState =
  | { status: 'loading' }
  | { status: 'error'; cause: unknown }
  | { status: 'ready'; bots: MarketplaceEntry[]; nextCursor?: string; loadingMore: boolean };

function mergeBots(current: MarketplaceEntry[], next: MarketplaceEntry[]): MarketplaceEntry[] {
  const seen = new Set(next.map((bot) => bot.id));
  return [...current.filter((bot) => !seen.has(bot.id)), ...next];
}

function MarketplaceRow({
  bot,
  t,
  onInstall,
}: {
  bot: MarketplaceEntry;
  t: BotHarnessTranslate;
  onInstall: () => void;
}): ReactElement {
  return (
    <div className="bh-market-row" role="listitem" data-market-bot={bot.fullName}>
      <PersonaBotAvatar personaBotId="" name={bot.name} size={36} indicator={false} t={t} />
      <span className="bh-market-copy">
        <span className="bh-market-name">
          <span>{bot.name}</span>
          <span className="bh-market-owner">{bot.owner}</span>
        </span>
        {bot.description === null ? null : (
          <span className="bh-market-description">{bot.description}</span>
        )}
        <span className="bh-market-meta">
          <span>{t('market.stars', { count: String(bot.stars) })}</span>
          <span>{t('market.updated', { date: day(bot.pushedAt) })}</span>
          {bot.topics.map((topic) => (
            <Tag key={topic} tone="neutral">
              {topic}
            </Tag>
          ))}
        </span>
      </span>
      <Button variant="outline" onClick={onInstall}>
        {t('market.install')}
      </Button>
    </div>
  );
}

function InstallConfirmation({
  bot,
  t,
  cause,
}: {
  bot: MarketplaceEntry;
  t: BotHarnessTranslate;
  cause: unknown | undefined;
}): ReactElement {
  return (
    <div className="bh-market-confirm">
      <div className="bh-market-confirm-head">
        <PersonaBotAvatar personaBotId="" name={bot.name} size={44} indicator={false} t={t} />
        <span className="bh-market-copy">
          <span className="bh-market-name">
            <span>{bot.name}</span>
            <span className="bh-market-owner">{bot.owner}</span>
          </span>
          {bot.description === null ? null : (
            <span className="bh-market-description">{bot.description}</span>
          )}
        </span>
      </div>
      <dl className="bh-market-facts">
        <div>
          <dt>{t('market.confirm.source')}</dt>
          <dd>
            <a href={bot.htmlUrl} target="_blank" rel="noreferrer">
              {bot.fullName}
            </a>
          </dd>
        </div>
        <div>
          <dt>{t('market.confirm.commit')}</dt>
          <dd data-market-commit>
            {bot.headCommit === null
              ? t('market.confirm.noCommit')
              : t('market.confirm.commitValue', {
                  sha: shortSha(bot.headCommit.sha),
                  date: day(bot.headCommit.committedAt),
                })}
          </dd>
        </div>
      </dl>
      <div className="bh-market-risk" role="note">
        <strong>{t('market.confirm.riskTitle')}</strong>
        <span>{t('market.confirm.risk')}</span>
        <span>{t('market.confirm.newer')}</span>
      </div>
      {cause === undefined ? null : (
        <div className="bh-modal-error" role="alert">
          {t('market.install.failed', { error: personaBotCreateError(cause, t) })}
        </div>
      )}
    </div>
  );
}

export function MarketplaceModal({
  actions,
  t,
  onClose,
  onInstalled,
}: {
  actions: BridgeActions;
  t: BotHarnessTranslate;
  onClose: () => void;
  onInstalled: () => void;
}): ReactElement {
  const [list, setList] = useState<ListState>({ status: 'loading' });
  const [url, setUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitCause, setSubmitCause] = useState<unknown | undefined>(undefined);
  const [submitted, setSubmitted] = useState<string | undefined>(undefined);
  const [selected, setSelected] = useState<MarketplaceEntry | undefined>(undefined);
  const [installing, setInstalling] = useState(false);
  const [installCause, setInstallCause] = useState<unknown | undefined>(undefined);
  const generation = useRef(0);

  const load = (): void => {
    const ticket = ++generation.current;
    setList({ status: 'loading' });
    void actions.marketplaceList().then(
      (page) => {
        if (ticket !== generation.current) return;
        setList({
          status: 'ready',
          bots: page.bots,
          ...(page.nextCursor === undefined ? {} : { nextCursor: page.nextCursor }),
          loadingMore: false,
        });
      },
      (cause: unknown) => {
        if (ticket === generation.current) setList({ status: 'error', cause });
      },
    );
  };

  const loadOnMount = useMountedResource<HTMLDivElement>(() => {
    load();
    return () => {
      generation.current += 1;
    };
  }, []);

  const loadMore = (): void => {
    if (list.status !== 'ready' || list.nextCursor === undefined || list.loadingMore) return;
    const ticket = generation.current;
    const current = list;
    setList({ ...current, loadingMore: true });
    void actions.marketplaceList(current.nextCursor).then(
      (page) => {
        if (ticket !== generation.current) return;
        setList({
          status: 'ready',
          bots: mergeBots(current.bots, page.bots),
          ...(page.nextCursor === undefined ? {} : { nextCursor: page.nextCursor }),
          loadingMore: false,
        });
      },
      (cause: unknown) => {
        if (ticket === generation.current) setList({ status: 'error', cause });
      },
    );
  };

  const submit = (): void => {
    const trimmed = url.trim();
    if (trimmed.length === 0 || submitting) return;
    setSubmitting(true);
    setSubmitCause(undefined);
    setSubmitted(undefined);
    void actions.marketplaceSubmit(trimmed).then(
      (bot) => {
        setSubmitting(false);
        setUrl('');
        setSubmitted(bot.fullName);
        setList((current) =>
          current.status === 'ready'
            ? { ...current, bots: [bot, ...current.bots.filter((item) => item.id !== bot.id)] }
            : { status: 'ready', bots: [bot], loadingMore: false },
        );
      },
      (cause: unknown) => {
        setSubmitting(false);
        setSubmitCause(cause);
      },
    );
  };

  const install = (): void => {
    if (selected === undefined || installing) return;
    setInstalling(true);
    setInstallCause(undefined);
    void actions
      .createBot({
        displayName: selected.name,
        gitUrl: selected.cloneUrl,
        roles: [],
        ...(selected.description === null ? {} : { description: selected.description }),
      })
      .then(
        () => {
          setInstalling(false);
          onInstalled();
        },
        (cause: unknown) => {
          setInstalling(false);
          setInstallCause(cause);
        },
      );
  };

  if (selected !== undefined) {
    return (
      <Modal
        open
        onClose={() => {
          if (!installing) onClose();
        }}
        closeLabel={t('common.close')}
        title={t('market.confirm.title', { name: selected.name })}
        className="bh-market-modal"
        footer={
          <>
            <Button
              variant="outline"
              disabled={installing}
              onClick={() => {
                setSelected(undefined);
                setInstallCause(undefined);
              }}
            >
              {t('market.back')}
            </Button>
            <Button variant="primary" disabled={installing} onClick={install}>
              {installing ? t('market.confirm.installing') : t('market.confirm.install')}
            </Button>
          </>
        }
      >
        <InstallConfirmation bot={selected} t={t} cause={installCause} />
      </Modal>
    );
  }

  return (
    <Modal
      open
      onClose={onClose}
      closeLabel={t('common.close')}
      title={t('market.title')}
      description={t('market.description')}
      className="bh-market-modal"
      footer={
        <Button variant="outline" onClick={onClose}>
          {t('common.close')}
        </Button>
      }
    >
      <div className="bh-market" ref={loadOnMount}>
        <div className="bh-market-submit">
          <Input
            aria-label={t('market.submit.label')}
            placeholder={t('market.submit.placeholder')}
            autoCapitalize="none"
            autoComplete="off"
            spellCheck={false}
            value={url}
            disabled={submitting}
            onChange={(event) => setUrl(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return;
              event.preventDefault();
              submit();
            }}
          />
          <Button
            variant="primary"
            disabled={submitting || url.trim().length === 0}
            onClick={submit}
          >
            {submitting ? t('market.submit.busy') : t('market.submit.action')}
          </Button>
        </div>
        <span className="bh-market-hint">
          {submitted === undefined
            ? t('market.submit.hint')
            : t('market.submit.done', { name: submitted })}
        </span>
        {submitCause === undefined ? null : (
          <div className="bh-modal-error" role="alert">
            {marketplaceError(submitCause, t)}
          </div>
        )}
        {list.status === 'loading' ? (
          <div className="bh-market-state" role="status">
            {t('market.loading')}
          </div>
        ) : null}
        {list.status === 'error' ? (
          <div className="bh-market-state" role="alert">
            <span>{t('market.error.load', { error: marketplaceError(list.cause, t) })}</span>
            <Button variant="outline" onClick={load}>
              {t('market.retry')}
            </Button>
          </div>
        ) : null}
        {list.status === 'ready' && list.bots.length === 0 ? (
          <div className="bh-market-state">{t('market.empty')}</div>
        ) : null}
        {list.status === 'ready' && list.bots.length > 0 ? (
          <div className="bh-market-list" role="list" aria-label={t('market.title')}>
            {list.bots.map((bot) => (
              <MarketplaceRow
                key={bot.id}
                bot={bot}
                t={t}
                onInstall={() => {
                  setSelected(bot);
                  setInstallCause(undefined);
                }}
              />
            ))}
          </div>
        ) : null}
        {list.status === 'ready' && list.nextCursor !== undefined ? (
          <Button variant="outline" disabled={list.loadingMore} onClick={loadMore}>
            {list.loadingMore ? t('market.loadingMore') : t('market.loadMore')}
          </Button>
        ) : null}
      </div>
    </Modal>
  );
}
