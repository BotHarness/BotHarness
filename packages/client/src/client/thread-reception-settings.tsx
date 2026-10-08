import { useState, type ReactElement } from 'react';
import { Combobox } from './combobox.js';
import { Button, Input, Tag } from '@deepseek-ai/dsh-client-ui-primitives';
import type {
  ThreadReceptionInput,
  ThreadReceptionView,
} from '../../../core/src/messaging/thread-policy.js';
import type { BotHarnessTranslate } from './locale.js';
import { Modal } from './modal.js';
import { MessagingHelp } from './messaging-help.js';

export function ThreadReceptionSettings({
  policies,
  busy,
  t,
  save,
}: {
  policies: ThreadReceptionView[];
  busy: boolean;
  t: BotHarnessTranslate;
  save(sourceEventId: string, input: ThreadReceptionInput): Promise<boolean>;
}): ReactElement {
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState<ThreadReceptionView>();
  const [mode, setMode] = useState<ThreadReceptionInput['mode']>('inherit');
  const [wake, setWake] = useState<'inherit' | NonNullable<ThreadReceptionInput['wake']>['wake']>(
    'inherit',
  );
  const [count, setCount] = useState(5);
  const [seconds, setSeconds] = useState(30);
  const open = (row: ThreadReceptionView) => {
    setFailed(false);
    setSelected(row);
    setMode(row.mode);
    setWake(row.wake?.wake ?? 'inherit');
    setCount(row.wake?.count ?? 5);
    setSeconds(row.wake?.intervalSeconds ?? 30);
  };
  return (
    <section className="bh-im-threads" aria-label={t('im.threads')}>
      <div className="bh-im-heading">
        <strong>{t('im.threads')}</strong>
        <MessagingHelp title={t('im.threads')} text={t('im.threadHint')} t={t} />
      </div>
      <table className="bh-source-policy-table" aria-label={t('im.threads')}>
        <thead>
          <tr>
            <th>{t('im.thread')}</th>
            <th>{t('im.threadParticipation')}</th>
            <th>{t('im.threadEditor')}</th>
            <th>{t('im.threadManage')}</th>
          </tr>
        </thead>
        <tbody>
          {policies.map((row) => (
            <tr key={row.threadId}>
              <td>
                <span className="bh-im-thread-preview">{row.preview ?? row.threadId}</span>
                <details>
                  <summary>{t('im.threadDetails')}</summary>
                  <code>{row.threadId}</code>
                </details>
              </td>
              <td>
                <Tag tone="neutral">{t(`im.threadMode.${row.mode}`)}</Tag>
              </td>
              <td>
                {t(
                  row.editor.kind === 'human'
                    ? 'im.policyHuman'
                    : row.editor.kind === 'bot'
                      ? 'im.policyBot'
                      : 'im.policyDefault',
                )}
              </td>
              <td>
                <Button size="sm" variant="primary" disabled={busy} onClick={() => open(row)}>
                  {t('im.threadManage')}
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <Modal
        open={selected !== undefined}
        onClose={() => {
          if (!busy) setSelected(undefined);
        }}
        title={t('im.threadManage')}
        closeLabel={t('common.close')}
      >
        {selected ? (
          <>
            <p>{selected.preview ?? selected.threadId}</p>
            {failed ? <p role="alert">{t('im.error')}</p> : null}
            <div className="bh-im-field">
              <span className="bh-im-heading">
                <span>{t('im.threadParticipation')}</span>
                <MessagingHelp
                  title={t('im.threadParticipation')}
                  text={t('im.threadHumanOverride')}
                  t={t}
                />
              </span>
              <Combobox
                searchable={false}
                label={t('im.threadParticipation')}
                toggleLabel={t('im.threadParticipation')}
                value={mode}
                disabled={busy}
                onSelect={(value) => setMode(value as ThreadReceptionInput['mode'])}
                options={(['inherit', 'follow', 'exclude'] as const).map((value) => ({
                  value,
                  label: t(`im.threadMode.${value}`),
                }))}
              />
            </div>
            <div className="bh-im-field">
              <span>{t('im.ordinaryWake')}</span>
              <Combobox
                searchable={false}
                label={t('im.ordinaryWake')}
                toggleLabel={t('im.ordinaryWake')}
                value={wake}
                disabled={busy || mode !== 'follow'}
                onSelect={(value) => setWake(value as typeof wake)}
                options={(['inherit', 'immediate', 'digest', 'mentions', 'silent'] as const).map(
                  (value) => ({
                    value,
                    label: value === 'inherit' ? t('im.threadInheritWake') : t(`im.wake.${value}`),
                  }),
                )}
              />
            </div>
            {wake === 'digest' && mode === 'follow' ? (
              <>
                <label className="bh-im-field">
                  <span>{t('im.digestCount')}</span>
                  <Input
                    type="number"
                    min={1}
                    max={100}
                    value={count}
                    disabled={busy}
                    onChange={(e) => setCount(Number(e.target.value))}
                  />
                </label>
                <label className="bh-im-field">
                  <span>{t('im.digestSeconds')}</span>
                  <Input
                    type="number"
                    min={1}
                    max={86400}
                    value={seconds}
                    disabled={busy}
                    onChange={(e) => setSeconds(Number(e.target.value))}
                  />
                </label>
              </>
            ) : null}
            {selected.ordinaryDelivery !== 'verified' ? <p>{t('im.threadUnverified')}</p> : null}
            <Button
              size="sm"
              variant="primary"
              disabled={
                busy ||
                (mode === 'follow' && selected.ordinaryDelivery !== 'verified') ||
                (wake === 'digest' &&
                  (!Number.isInteger(count) ||
                    count < 1 ||
                    count > 100 ||
                    !Number.isInteger(seconds) ||
                    seconds < 1 ||
                    seconds > 86400))
              }
              onClick={() =>
                void (async () => {
                  if (
                    await save(selected.anchorSourceEventId, {
                      mode,
                      expectedRevision: selected.revision,
                      wake:
                        mode === 'follow' && wake !== 'inherit'
                          ? { wake, count, intervalSeconds: seconds }
                          : null,
                    })
                  )
                    setSelected(undefined);
                  else setFailed(true);
                })()
              }
            >
              {t('im.threadSave')}
            </Button>
          </>
        ) : null}
      </Modal>
    </section>
  );
}
