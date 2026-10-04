import { useId, useState, type ReactElement } from 'react';
import { Button, Switch, Tag } from '@deepseek-ai/dsh-client-ui-primitives';
import type { MessagingSnapshot } from '../../../core/src/messaging/outbound.js';
import type {
  MessagingIdentityInput,
  MessagingIdentityView,
} from '../../../core/src/messaging/identity.js';
import type { BotHarnessTranslate } from './locale.js';
import { Modal } from './modal.js';
import { MessagingHelp } from './messaging-help.js';

export function ExternalIdentityTable({
  snapshot,
  t,
  mutate,
  refresh,
}: {
  snapshot: MessagingSnapshot | undefined;
  t: BotHarnessTranslate;
  mutate(input: MessagingIdentityInput): Promise<void>;
  refresh(): Promise<void>;
}): ReactElement {
  const defaultsId = useId();
  const [mode, setMode] = useState<'bind' | 'edit' | 'reconnect' | 'unbind'>();
  const [selected, setSelected] = useState<MessagingIdentityView>();
  const [accountKey, setAccountKey] = useState('');
  const [name, setName] = useState('');
  const [inheritEnabled, setInheritEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const identities = snapshot?.identities ?? [];
  const accounts = snapshot?.accounts ?? [];
  const selectedAccount = accounts.find((a) => a.providerId + ':' + a.ref === accountKey);
  const platform = (value: string) => (value === 'feishu' ? 'Lark / 飞书' : value);
  const open = (next: typeof mode, row?: MessagingIdentityView) => {
    setError('');
    setMode(next);
    setSelected(row);
    setName(row?.name ?? '');
    setInheritEnabled(row?.enabledInheritance === 'inherit');
    setAccountKey('');
  };
  const operate = async (operation: () => Promise<void>, close = false) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await operation();
      if (close) setMode(undefined);
    } catch (error) {
      const code =
        error instanceof Error && 'code' in error && typeof error.code === 'string'
          ? error.code
          : '';
      setError(
        t(
          code === 'identity-stale' || code === 'identity-changed'
            ? 'identity.stale'
            : 'identity.failed',
        ),
      );
    } finally {
      setBusy(false);
    }
  };
  const save = async () => {
    if (mode === 'bind' && selectedAccount) {
      await mutate({
        kind: 'bind',
        providerId: selectedAccount.providerId,
        accountRef: selectedAccount.ref,
        fingerprint: selectedAccount.fingerprint,
      });
    } else if (selected && mode && mode !== 'bind') {
      await mutate(
        mode === 'edit'
          ? {
              kind: 'update',
              id: selected.id,
              expectedRevision: selected.revision,
              name,
              enabled: selected.enabled,
              inheritEnabled,
              ...(selected.defaultRevision !== undefined
                ? { expectedDefaultRevision: selected.defaultRevision }
                : {}),
            }
          : { kind: mode, id: selected.id, expectedRevision: selected.revision },
      );
    }
  };
  return (
    <section className="bh-profile-section bh-identity-section" aria-label={t('identity.title')}>
      <header className="bh-identity-header">
        <div className="bh-im-heading">
          <strong>{t('identity.title')}</strong>
          <MessagingHelp title={t('identity.title')} text={t('identity.summary')} t={t} />
        </div>
        <div className="bh-identity-actions">
          <Button size="sm" variant="toolbar" disabled={busy} onClick={() => void operate(refresh)}>
            {t('im.refresh')}
          </Button>
          <Button
            size="sm"
            variant="primary"
            disabled={busy || !snapshot}
            onClick={() => open('bind')}
          >
            {t('identity.bind')}
          </Button>
        </div>
      </header>
      {error && !mode ? (
        <p role="alert" className="bh-error">
          {error}
        </p>
      ) : null}
      {!snapshot ? (
        <p>{t('im.loading')}</p>
      ) : !identities.length ? (
        <p>{t('identity.empty')}</p>
      ) : (
        <table
          className="bh-source-policy-table bh-identity-table"
          aria-label={t('identity.title')}
        >
          <thead>
            <tr>
              <th scope="col">{t('identity.platform')}</th>
              <th scope="col">{t('identity.name')}</th>
              <th scope="col">{t('identity.status')}</th>
              <th scope="col">{t('identity.enabled')}</th>
              <th scope="col">{t('identity.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {identities.map((row) => (
              <tr key={row.id}>
                <th scope="row">{platform(row.platform)}</th>
                <td>
                  <span>{row.name}</span>
                </td>
                <td>
                  <Tag tone="neutral">
                    {t(
                      (
                        {
                          available: 'identity.state.available',
                          paused: 'identity.state.paused',
                          unavailable: 'identity.state.unavailable',
                          'rebind-required': 'identity.state.rebind-required',
                        } as const
                      )[row.availability],
                    )}
                  </Tag>
                </td>
                <td>
                  <Switch
                    label={t('identity.enableFor', { name: row.name })}
                    checked={row.enabled}
                    disabled={busy}
                    onChange={(enabled) =>
                      void operate(() =>
                        mutate({
                          kind: 'update',
                          id: row.id,
                          expectedRevision: row.revision,
                          name: row.name,
                          enabled,
                        }),
                      )
                    }
                  />
                  <span className="bh-bridge-secondary">
                    {t(
                      row.enabledInheritance === 'inherit'
                        ? 'defaults.inherited'
                        : 'defaults.custom',
                    )}
                    {row.enabledInheritance === 'inherit' ? ` · v${row.defaultRevision ?? 0}` : ''}
                  </span>
                </td>
                <td>
                  <div className="bh-identity-actions">
                    <Button
                      type="button"
                      size="sm"
                      variant="primary"
                      disabled={busy}
                      aria-label={t('identity.editFor', { name: row.name })}
                      onClick={() => open('edit', row)}
                    >
                      {t('identity.edit')}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="primary"
                      disabled={busy}
                      aria-label={t('identity.reconnectFor', { name: row.name })}
                      onClick={() => open('reconnect', row)}
                    >
                      {t('identity.reconnect')}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="primary"
                      disabled={busy}
                      className="bh-im-danger"
                      aria-label={t('identity.unbindFor', { name: row.name })}
                      onClick={() => open('unbind', row)}
                    >
                      {t('identity.unbind')}
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <Modal
        open={mode !== undefined}
        onClose={() => {
          if (!busy) setMode(undefined);
        }}
        title={t(
          mode === 'bind'
            ? 'identity.bind'
            : mode === 'unbind'
              ? 'identity.unbind'
              : mode === 'reconnect'
                ? 'identity.reconnect'
                : 'identity.edit',
        )}
        closeLabel={t('common.close')}
      >
        {error ? (
          <p role="alert" className="bh-error">
            {error}
          </p>
        ) : null}
        {mode === 'bind' ? (
          <>
            <p>{t('identity.providerHint')}</p>
            <label className="bh-im-field">
              <span>{t('im.account')}</span>
              <select
                disabled={busy}
                value={accountKey}
                onChange={(e) => setAccountKey(e.target.value)}
              >
                <option value="">{t('im.select')}</option>
                {accounts.map((account) => (
                  <option
                    key={account.providerId + ':' + account.ref}
                    value={account.providerId + ':' + account.ref}
                    disabled={
                      !account.connected || identities.some((i) => i.platform === account.platform)
                    }
                  >
                    {platform(account.platform)} · {account.name}
                  </option>
                ))}
              </select>
            </label>
            {!accounts.length ? <p>{t('im.setup')}</p> : null}
            <p>{t('identity.bindHint')}</p>
          </>
        ) : selected ? (
          <>
            <p>
              {platform(selected.platform)} · {selected.name}
            </p>
            {mode === 'edit' ? (
              <label className="bh-im-field">
                <span>{t('identity.displayName')}</span>
                <input
                  value={name}
                  disabled={busy}
                  maxLength={120}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
            ) : null}
            {mode === 'edit' ? (
              <div className="bh-im-field">
                <span className="bh-im-heading">
                  <label htmlFor={defaultsId}>{t('defaults.identity')}</label>
                  <MessagingHelp
                    title={t('defaults.identity')}
                    text={t('defaults.restoreHint')}
                    t={t}
                  />
                </span>
                <select
                  id={defaultsId}
                  aria-label={t('defaults.identityOrigin')}
                  value={inheritEnabled ? 'inherit' : 'custom'}
                  disabled={busy}
                  onChange={(e) => setInheritEnabled(e.target.value === 'inherit')}
                >
                  <option value="inherit">{t('defaults.inherited')}</option>
                  <option value="custom">{t('defaults.custom')}</option>
                </select>
              </div>
            ) : null}
            {mode === 'reconnect' ? <p>{t('identity.reconnectHint')}</p> : null}
            {mode === 'unbind' ? (
              <>
                <p>{t('identity.impact', { count: selected.grantCount })}</p>
                <ul>
                  {selected.scopes.map((scope, index) => (
                    <li key={index}>{scope}</li>
                  ))}
                </ul>
                <p>{t('identity.unbindHint')}</p>
              </>
            ) : null}
          </>
        ) : null}
        <Button
          size="sm"
          variant="primary"
          className={mode === 'unbind' ? 'bh-im-danger' : undefined}
          disabled={
            busy ||
            (mode === 'bind' && (!selectedAccount || !selectedAccount.connected)) ||
            (mode === 'edit' && !name.trim())
          }
          onClick={() => void operate(save, true)}
        >
          {t(
            busy
              ? 'identity.pending'
              : mode === 'unbind'
                ? 'identity.confirmUnbind'
                : mode === 'bind'
                  ? 'identity.bind'
                  : mode === 'reconnect'
                    ? 'identity.reconnect'
                    : 'identity.save',
          )}
        </Button>
      </Modal>
    </section>
  );
}
