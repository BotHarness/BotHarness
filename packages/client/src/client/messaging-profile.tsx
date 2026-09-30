import { useRef, useState, type ReactElement } from 'react';
import { Button, IconChevronRightOutlineRegular, Tag } from '@deepseek-ai/dsh-client-ui-primitives';
import type { MessagingSnapshot, OutboxState } from '../../../core/src/messaging/outbound.js';
import type { MessagingTarget } from '../../../core/src/messaging/provider.js';
import type { BridgeActions } from './actions.js';
import type { BotHarnessTranslate } from './locale.js';
import { useMountedResource } from './mounted-resource.js';

export function MessagingProfile({
  slug,
  actions,
  t,
}: {
  slug: string;
  actions: Pick<
    BridgeActions,
    | 'messagingSnapshot'
    | 'messagingTargets'
    | 'messagingAuthorize'
    | 'messagingRevoke'
    | 'messagingSend'
  >;
  t: BotHarnessTranslate;
}): ReactElement {
  const [snapshot, setSnapshot] = useState<MessagingSnapshot>();
  const [accountKey, setAccountKey] = useState('');
  const [targets, setTargets] = useState<MessagingTarget[]>([]);
  const [targetRef, setTargetRef] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const generation = useRef(0);
  const mounted = useRef(false);
  const request = useRef<{ id: string; grantId: string; text: string }>();
  const account = snapshot?.accounts.find(
    (item) => `${item.providerId}:${item.ref}` === accountKey,
  );
  const grant = snapshot?.grants.find((item) => item.revokedAt === undefined);
  const refresh = async () => {
    const version = generation.current;
    const value = await actions.messagingSnapshot(slug);
    if (mounted.current && version === generation.current) setSnapshot(value);
  };
  const mount = useMountedResource<HTMLDivElement>(() => {
    mounted.current = true;
    ++generation.current;
    void refresh().catch(() => {
      if (mounted.current) setFailed(true);
    });
    return () => {
      mounted.current = false;
      ++generation.current;
    };
  }, [actions, slug]);
  const operate = async (operation: () => Promise<void>) => {
    if (busy) return;
    const version = generation.current;
    setBusy(true);
    setFailed(false);
    try {
      await operation();
      await refresh();
    } catch {
      if (mounted.current && version === generation.current) setFailed(true);
    } finally {
      if (mounted.current && version === generation.current) setBusy(false);
    }
  };
  const chooseAccount = async (key: string) => {
    setAccountKey(key);
    setTargetRef('');
    setTargets([]);
    const selected = snapshot?.accounts.find((item) => `${item.providerId}:${item.ref}` === key);
    if (!selected) return;
    const version = ++generation.current;
    await operate(async () => {
      const values = await actions.messagingTargets(selected.providerId, selected.ref);
      if (mounted.current && version === generation.current) setTargets(values);
    });
  };
  const authorize = () =>
    operate(async () => {
      const target = targets.find((item) => item.ref === targetRef);
      if (!account || !target) return;
      await actions.messagingAuthorize({
        botSlug: slug,
        providerId: account.providerId,
        accountRef: account.ref,
        fingerprint: account.fingerprint,
        targetRef: target.ref,
        targetDigest: target.digest,
      });
    });
  const send = () =>
    operate(async () => {
      if (!grant || !text.trim()) return;
      if (
        !request.current ||
        request.current.grantId !== grant.id ||
        request.current.text !== text
      ) {
        request.current = { id: crypto.randomUUID(), grantId: grant.id, text };
      }
      await actions.messagingSend(slug, grant.id, request.current.id, text);
      if (mounted.current) setText('');
      request.current = undefined;
    });
  const stateLabel = (state: OutboxState) => {
    switch (state) {
      case 'provider-accepted':
        return t('im.accepted');
      case 'unknown-outcome':
        return t('im.unknown');
      case 'pending':
      case 'in-flight':
        return t('im.sending');
      case 'grant-revoked':
        return t('im.revoked');
      case 'cancelled':
        return t('im.cancelled');
      case 'failed':
        return t('im.failed');
    }
  };
  return (
    <section className="bh-profile-section bh-profile-policy-section" aria-label={t('im.title')}>
      <details className="bh-profile-policy-details">
        <summary className="bh-profile-policy-summary">
          <span className="bh-profile-policy-summary-text">
            <strong>{t('im.title')}</strong>
            <span>{t('im.summary')}</span>
          </span>
          <IconChevronRightOutlineRegular />
        </summary>
        <div ref={mount} className="bh-profile-cards">
          <section className="bh-profile-card">
            {failed ? (
              <p className="bh-error" role="alert">
                {t('im.error')}
              </p>
            ) : null}
            <Button disabled={busy} onClick={() => void operate(async () => undefined)}>
              {t('im.refresh')}
            </Button>
            {snapshot === undefined ? (
              <p>{t('im.loading')}</p>
            ) : grant ? (
              <>
                <p>
                  {grant.accountName} · {grant.targetName}{' '}
                  <Tag tone="neutral">
                    {grant.availability === 'available'
                      ? t('im.bound')
                      : grant.availability === 'rebind-required'
                        ? t('im.rebind')
                        : t('im.unavailable')}
                  </Tag>
                </p>
                <Button
                  disabled={busy}
                  onClick={() =>
                    void operate(async () => {
                      await actions.messagingRevoke(slug, grant.id);
                    })
                  }
                >
                  {t('im.revoke')}
                </Button>
                <label className="bh-im-field">
                  <span>{t('im.message')}</span>
                  <textarea
                    aria-label={t('im.message')}
                    value={text}
                    maxLength={4000}
                    disabled={busy}
                    onChange={(event) => setText(event.target.value)}
                  />
                </label>
                <Button
                  disabled={busy || !text.trim() || grant.availability !== 'available'}
                  onClick={() => void send()}
                >
                  {t('im.send')}
                </Button>
              </>
            ) : snapshot.accounts.length === 0 ? (
              <p>{t('im.setup')}</p>
            ) : (
              <>
                <label className="bh-im-field">
                  <span>{t('im.account')}</span>
                  <select
                    aria-label={t('im.account')}
                    value={accountKey}
                    disabled={busy}
                    onChange={(event) => void chooseAccount(event.target.value)}
                  >
                    <option value="">{t('im.select')}</option>
                    {snapshot.accounts.map((item) => (
                      <option
                        key={`${item.providerId}:${item.ref}`}
                        value={`${item.providerId}:${item.ref}`}
                        disabled={!item.connected}
                      >
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="bh-im-field">
                  <span>{t('im.target')}</span>
                  <select
                    aria-label={t('im.target')}
                    value={targetRef}
                    disabled={busy || !account}
                    onChange={(event) => setTargetRef(event.target.value)}
                  >
                    <option value="">{t('im.select')}</option>
                    {targets.map((item) => (
                      <option key={item.ref} value={item.ref}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
                <p>{t('im.grant')}</p>
                <Button disabled={busy || !account || !targetRef} onClick={() => void authorize()}>
                  {t('im.authorize')}
                </Button>
              </>
            )}
          </section>
          {snapshot?.intents.length ? (
            <section className="bh-profile-card">
              <header className="bh-profile-card-head">
                <span className="bh-profile-card-label">{t('im.history')}</span>
              </header>
              {snapshot.intents.slice(0, 5).map((intent) => (
                <div key={intent.id} className="bh-im-outcome">
                  <Tag tone="neutral">{stateLabel(intent.state)}</Tag>
                  <span>{intent.text}</span>
                  {intent.state === 'unknown-outcome' ? <p>{t('im.noRetry')}</p> : null}
                </div>
              ))}
            </section>
          ) : null}
        </div>
      </details>
    </section>
  );
}
