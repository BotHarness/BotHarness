import { useId, useState, type ReactElement } from 'react';
import { Button, Tag } from '@deepseek-ai/dsh-client-ui-primitives';
import type { ApprovalMessagingSnapshot } from '../../../core/src/messaging/approval-messaging.js';
import type { BotHarnessTranslate } from './locale.js';

export function ApprovalSettings({
  snapshot,
  busy,
  failed,
  save,
  test,
  retry,
  refresh,
  openSession,
  t,
}: {
  snapshot?: ApprovalMessagingSnapshot;
  busy: boolean;
  failed: boolean;
  save(pairingId: string | null, revision: number): Promise<void>;
  test(): Promise<void>;
  retry(id: string): Promise<void>;
  refresh(): Promise<void>;
  openSession(sessionId: string): void;
  t: BotHarnessTranslate;
}): ReactElement {
  const id = useId();
  const [selected, setSelected] = useState(snapshot?.route?.pairingId ?? '');
  return (
    <section className="bh-im-pairing" aria-label={t('approvalIm.title')}>
      <div className="bh-im-actions">
        <strong>{t('approvalIm.title')}</strong>
        <Button size="sm" variant="toolbar" disabled={busy} onClick={() => void refresh()}>
          {t('approvalIm.refresh')}
        </Button>
      </div>
      <p className="bh-muted">{t('approvalIm.hint')}</p>
      {failed ? (
        <p role="alert" className="bh-error">
          {t('approvalIm.error')}
        </p>
      ) : null}
      <label className="bh-im-field" htmlFor={id}>
        <span>{t('approvalIm.destination')}</span>
        <select
          id={id}
          value={selected}
          disabled={busy || !snapshot}
          onChange={(event) => setSelected(event.target.value)}
        >
          <option value="">{t('approvalIm.off')}</option>
          {snapshot?.destinations.map((destination) => (
            <option
              key={destination.pairingId}
              value={destination.pairingId}
              disabled={!destination.ready}
            >
              {destination.name} · {destination.accountName}
            </option>
          ))}
        </select>
      </label>
      {snapshot?.destinations.length === 0 ? (
        <p className="bh-muted">{t('approvalIm.empty')}</p>
      ) : null}
      <div className="bh-im-actions">
        <Button
          size="sm"
          disabled={busy || !snapshot || selected === (snapshot.route?.pairingId ?? '')}
          onClick={() => void save(selected || null, snapshot?.routeRevision ?? 0)}
        >
          {t('approvalIm.save')}
        </Button>
        <Button
          size="sm"
          variant="toolbar"
          disabled={busy || !snapshot?.route}
          onClick={() => void test()}
        >
          {t('approvalIm.test')}
        </Button>
      </div>
      <p className="bh-muted">{t('approvalIm.once')}</p>
      {snapshot?.deliveries.map((delivery) => (
        <article key={delivery.id} className="bh-im-pairing-request">
          <div className="bh-im-actions">
            <strong>
              {delivery.status === 'test' ? t('approvalIm.testLabel') : t('approvalIm.request')}
            </strong>
            <Tag>{t(`approvalIm.delivery.${delivery.delivery}`)}</Tag>
            <Tag>{t(`approvalIm.status.${delivery.status}`)}</Tag>
          </div>
          <p>
            <time dateTime={delivery.createdAt}>
              {new Date(delivery.createdAt).toLocaleString()}
            </time>
          </p>
          {delivery.actor ? (
            <p>
              {t('approvalIm.actor')}: <code>{delivery.actor.actorId}</code>
            </p>
          ) : null}
          {delivery.sessionId ? (
            <Button size="sm" variant="toolbar" onClick={() => openSession(delivery.sessionId!)}>
              {t('approvalIm.openSession')}
            </Button>
          ) : null}
          {delivery.resultSeq !== undefined ? (
            <p>
              {t('approvalIm.result')}: {delivery.resultSeq}
            </p>
          ) : null}
          {delivery.update === 'failed' || delivery.update === 'unknown-outcome' ? (
            <p role="status">{t('approvalIm.updateUnconfirmed')}</p>
          ) : null}
          {delivery.delivery === 'unknown-outcome' ? (
            <p role="status">{t('approvalIm.unknownHint')}</p>
          ) : null}
          {delivery.delivery === 'failed' && delivery.attempts < 3 ? (
            <Button
              size="sm"
              variant="toolbar"
              disabled={busy || !['pending', 'test'].includes(delivery.status)}
              onClick={() => void retry(delivery.id)}
            >
              {t('approvalIm.retry')}
            </Button>
          ) : null}
          <details>
            <summary>{t('approvalIm.details')}</summary>
            <dl>
              <div>
                <dt>{t('approvalIm.request')}</dt>
                <dd>
                  <code>{delivery.requestMessageId ?? delivery.id}</code>
                </dd>
              </div>
              <div>
                <dt>{t('approvalIm.attempts')}</dt>
                <dd>{delivery.attempts} / 3</dd>
              </div>
              {delivery.reason ? (
                <div>
                  <dt>{t('approvalIm.reason')}</dt>
                  <dd>
                    <code>{delivery.reason}</code>
                  </dd>
                </div>
              ) : null}
            </dl>
          </details>
        </article>
      ))}
    </section>
  );
}
