import type {
  GroupReceptionInput,
  GroupReceptionPolicy,
} from '../../../core/src/messaging/group-policy.js';
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
    | 'messagingGroupPolicy'
    | 'messagingReceive'
    | 'messagingChannelTarget'
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
                {grant.canReceive === true || grant.receiveScope !== undefined ? (
                  <>
                    <label className="bh-im-field">
                      <span>{t('im.localTarget')}</span>
                      <select
                        aria-label={t('im.localTarget')}
                        value={grant.receiveTargetChannelId ?? ''}
                        disabled={busy}
                        onChange={(event) => {
                          const channelId = event.target.value || null;
                          void operate(() =>
                            actions.messagingChannelTarget(slug, grant.id, channelId),
                          );
                        }}
                      >
                        <option value="">{t('im.inboxTarget')}</option>
                        {grant.receiveTargetChannelId &&
                        !snapshot.channelTargets?.some(
                          (target) => target.id === grant.receiveTargetChannelId,
                        ) ? (
                          <option value={grant.receiveTargetChannelId}>
                            {t('im.targetUnavailable')}
                          </option>
                        ) : null}
                        {(snapshot.channelTargets ?? []).map((target) => (
                          <option key={target.id} value={target.id}>
                            {target.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <p>
                      {grant.receiveTargetChannelId
                        ? t('im.channelTargetHint')
                        : t('im.receiveHint')}
                    </p>
                    <p>{t(`im.reception.${grant.reception ?? 'off'}`)}</p>
                    {grant.receiveScope && grant.groupPolicy ? (
                      <GroupReceptionSettings
                        key={`${grant.id}:${grant.groupPolicy.revision}`}
                        policy={grant.groupPolicy}
                        verified={grant.ordinaryDelivery === 'verified'}
                        busy={busy}
                        t={t}
                        save={(input) =>
                          operate(() => actions.messagingGroupPolicy(slug, grant.id, input))
                        }
                      />
                    ) : null}
                    <Button
                      disabled={
                        busy ||
                        (grant.receiveScope === undefined && grant.availability !== 'available')
                      }
                      onClick={() =>
                        void operate(async () => {
                          await actions.messagingReceive(
                            slug,
                            grant.id,
                            grant.receiveScope === undefined,
                          );
                        })
                      }
                    >
                      {t(
                        grant.receiveScope === undefined ? 'im.receiveEnable' : 'im.receiveDisable',
                      )}
                    </Button>
                  </>
                ) : null}
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

function GroupReceptionSettings({
  policy,
  verified,
  busy,
  t,
  save,
}: {
  policy: GroupReceptionPolicy;
  verified: boolean;
  busy: boolean;
  t: BotHarnessTranslate;
  save(input: GroupReceptionInput): Promise<void>;
}): ReactElement {
  const [collection, setCollection] = useState(policy.collection);
  const [wake, setWake] = useState(policy.wake);
  const [count, setCount] = useState(String(policy.count));
  const [seconds, setSeconds] = useState(String(policy.intervalSeconds));
  const numericCount = Number(count),
    numericSeconds = Number(seconds);
  const valid =
    Number.isInteger(numericCount) &&
    numericCount >= 1 &&
    numericCount <= 100 &&
    Number.isInteger(numericSeconds) &&
    numericSeconds >= 1 &&
    numericSeconds <= 86400;
  const changed =
    collection !== policy.collection ||
    wake !== policy.wake ||
    numericCount !== policy.count ||
    numericSeconds !== policy.intervalSeconds;
  return (
    <section className="bh-im-group-policy" aria-label={t('im.groupPolicy')}>
      <strong>{t('im.groupPolicy')}</strong>
      <label className="bh-im-field">
        <span>{t('im.collection')}</span>
        <select
          aria-label={t('im.collection')}
          value={collection}
          disabled={busy}
          onChange={(event) =>
            setCollection(event.target.value as GroupReceptionInput['collection'])
          }
        >
          <option value="mentions">{t('im.collection.mentions')}</option>
          <option value="all" disabled={!verified}>
            {t('im.collection.all')}
          </option>
        </select>
      </label>
      <p>{t(verified ? 'im.ordinaryVerified' : 'im.ordinaryUnverified')}</p>
      <label className="bh-im-field">
        <span>{t('im.ordinaryWake')}</span>
        <select
          aria-label={t('im.ordinaryWake')}
          value={wake}
          disabled={busy || collection !== 'all'}
          onChange={(event) => setWake(event.target.value as GroupReceptionInput['wake'])}
        >
          {(['digest', 'immediate', 'mentions', 'silent'] as const).map((mode) => (
            <option key={mode} value={mode}>
              {t(`im.wake.${mode}`)}
            </option>
          ))}
        </select>
      </label>
      {wake === 'digest' ? (
        <div className="bh-im-digest-fields">
          <label className="bh-im-field">
            <span>{t('im.digestCount')}</span>
            <input
              aria-label={t('im.digestCount')}
              type="number"
              min="1"
              max="100"
              value={count}
              disabled={busy || collection !== 'all'}
              onChange={(event) => setCount(event.target.value)}
            />
          </label>
          <label className="bh-im-field">
            <span>{t('im.digestSeconds')}</span>
            <input
              aria-label={t('im.digestSeconds')}
              type="number"
              min="1"
              max="86400"
              value={seconds}
              disabled={busy || collection !== 'all'}
              onChange={(event) => setSeconds(event.target.value)}
            />
          </label>
        </div>
      ) : null}
      <p>{t('im.wakeHint')}</p>
      <p>
        {t('im.policyRevision', {
          revision: String(policy.revision),
          editor: t(
            policy.editor.kind === 'bot'
              ? 'im.policyBot'
              : policy.editor.kind === 'human'
                ? 'im.policyHuman'
                : 'im.policyDefault',
          ),
        })}
      </p>
      <Button
        disabled={busy || !valid || !changed || (collection === 'all' && !verified)}
        onClick={() =>
          void save({ collection, wake, count: numericCount, intervalSeconds: numericSeconds })
        }
      >
        {t('im.policySave')}
      </Button>
    </section>
  );
}
