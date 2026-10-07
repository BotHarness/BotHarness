import { externalPlatformLabel } from './bridge-source-label.js';
import { useState, type ReactElement } from 'react';
import { Button, Input, Switch, Tag } from '@deepseek-ai/dsh-client-ui-primitives';
import type { MessagingSnapshot } from '../../../core/src/messaging/outbound.js';
import type {
  MessagingIdentityInput,
  MessagingIdentityView,
} from '../../../core/src/messaging/identity.js';
import { Combobox } from './combobox.js';
import { ExternalConversations } from './external-conversations.js';
import type { MessagingConversationInput } from '../../../core/src/messaging/conversations.js';
import type { GroupReceptionInput } from '../../../core/src/messaging/group-policy.js';
import type { BotHarnessTranslate } from './locale.js';
import { Modal } from './modal.js';
import { MessagingHelp } from './messaging-help.js';
import { SidebarCardList, SidebarCardRow } from './sidebar-card.js';
import { openImSettings } from './bot-settings-open.js';

const AVAILABILITY = {
  available: 'identity.state.available',
  paused: 'identity.state.paused',
  unavailable: 'identity.state.unavailable',
  'rebind-required': 'identity.state.rebind-required',
} as const;

export function ExternalIdentityList({
  snapshot,
  t,
  mutate,
  conversation,
  rules,
  channels,
  botName = (slug) => slug,
}: {
  snapshot: MessagingSnapshot | undefined;
  t: BotHarnessTranslate;
  mutate(input: MessagingIdentityInput): Promise<void>;
  conversation(input: MessagingConversationInput): Promise<void>;
  rules(grantId: string, input: GroupReceptionInput): Promise<void>;
  channels?: { id: string; name: string }[];
  botName?(slug: string): string;
}): ReactElement {
  const [mode, setMode] = useState<'bind' | 'bound' | 'edit' | 'reconnect' | 'unbind'>();
  const [selected, setSelected] = useState<MessagingIdentityView>();
  const [accountKey, setAccountKey] = useState('');
  const [name, setName] = useState('');
  const [inheritEnabled, setInheritEnabled] = useState(false);
  const [newConversations, setNewConversations] = useState<'auto' | 'ask'>('auto');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const identities = snapshot?.identities ?? [];
  const accounts = snapshot?.accounts ?? [];
  const selectedAccount = accounts.find((a) => a.providerId + ':' + a.ref === accountKey);
  const bound = identities.find(
    (i) => selectedAccount && i.providerId + ':' + i.accountRef === accountKey,
  );
  const platform = (value: string) => externalPlatformLabel(value, t);
  const conversations = (row: MessagingIdentityView) =>
    (snapshot?.grants ?? []).filter(
      (g) => g.bindingId === row.id && !g.revokedAt && g.receiveScope !== undefined,
    );
  const open = (next: typeof mode, row?: MessagingIdentityView) => {
    setError('');
    setMode(next);
    setSelected(row);
    setName(row?.name ?? '');
    setInheritEnabled(row?.enabledInheritance === 'inherit');
    setNewConversations(row?.newConversations ?? 'auto');
    setAccountKey('');
  };
  const close = () => {
    if (!busy) setMode(undefined);
  };
  const operate = async (operation: () => Promise<void>, done = false) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await operation();
      if (done) setMode(undefined);
    } catch (error) {
      const code =
        error instanceof Error && 'code' in error && typeof error.code === 'string'
          ? error.code
          : '';
      setError(
        t(
          code === 'identity-stale' || code === 'identity-changed' || code === 'conversation-stale'
            ? 'identity.stale'
            : code === 'conversation-limit'
              ? 'conversation.limit'
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
      setMode('bound');
    } else if (selected && mode && mode !== 'bind' && mode !== 'bound') {
      await mutate(
        mode === 'edit'
          ? {
              kind: 'update',
              id: selected.id,
              expectedRevision: selected.revision,
              name,
              enabled: selected.enabled,
              inheritEnabled,
              newConversations,
              ...(selected.defaultRevision !== undefined
                ? { expectedDefaultRevision: selected.defaultRevision }
                : {}),
            }
          : { kind: mode, id: selected.id, expectedRevision: selected.revision },
      );
    }
  };
  return (
    <>
      {error && !mode ? (
        <p role="alert" className="bh-error">
          {error}
        </p>
      ) : null}
      <SidebarCardList label={t('identity.title')}>
        {[...identities]
          .sort(
            (a, b) =>
              platform(a.platform).localeCompare(platform(b.platform)) ||
              a.createdAt.localeCompare(b.createdAt),
          )
          .map((row) => (
            <SidebarCardRow
              key={row.id}
              icon="id-card"
              title={row.name}
              meta={`${platform(row.platform)} · ${t('identity.conversationCount', {
                count: conversations(row).length,
              })}`}
              chips={<Tag tone="neutral">{t(AVAILABILITY[row.availability])}</Tag>}
              muted={!row.enabled}
              hint={t('identity.editFor', { name: row.name })}
              dialog
              disabled={busy}
              onClick={() => open('edit', row)}
              trailing={
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
              }
            />
          ))}
        <SidebarCardRow
          anchor="lark-bind"
          icon="plus"
          title={t('identity.bind')}
          meta={
            !snapshot ? t('im.loading') : identities.length ? undefined : t('identity.emptyShort')
          }
          muted
          dialog
          disabled={busy || !snapshot}
          onClick={() => open('bind')}
        />
      </SidebarCardList>
      <Modal
        className="bh-sidebar-modal"
        open={mode !== undefined}
        onClose={close}
        title={t(
          mode === 'bind' || mode === 'bound'
            ? 'identity.bind'
            : mode === 'unbind'
              ? 'identity.unbind'
              : mode === 'reconnect'
                ? 'identity.reconnect'
                : 'identity.editTitle',
        )}
        closeLabel={t('common.close')}
        footer={
          <div className="bh-modal-footer">
            {mode === 'edit' ? (
              <>
                <Button
                  variant="outline"
                  disabled={busy}
                  aria-label={selected && t('identity.reconnectFor', { name: selected.name })}
                  onClick={() => setMode('reconnect')}
                >
                  {t('identity.reconnect')}
                </Button>
                <Button
                  variant="outline"
                  className="bh-im-danger-outline"
                  disabled={busy}
                  aria-label={selected && t('identity.unbindFor', { name: selected.name })}
                  onClick={() => setMode('unbind')}
                >
                  {t('identity.unbind')}
                </Button>
                <span className="bh-modal-footer-gap" />
              </>
            ) : mode === 'bound' ? null : (
              <Button variant="outline" disabled={busy} onClick={close}>
                {t('common.cancel')}
              </Button>
            )}
            {mode === 'bound' ? (
              <Button variant="primary" onClick={close}>
                {t('identity.done')}
              </Button>
            ) : (
              <Button
                variant="primary"
                className={mode === 'unbind' ? 'bh-im-danger' : undefined}
                disabled={
                  busy ||
                  (mode === 'bind' && (!selectedAccount || !selectedAccount.connected)) ||
                  (mode === 'edit' && !name.trim())
                }
                onClick={() => void operate(save, mode !== 'bind')}
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
            )}
          </div>
        }
      >
        <div className="bh-sidebar-modal-form">
          {error ? (
            <p role="alert" className="bh-error">
              {error}
            </p>
          ) : null}
          {mode === 'bind' ? (
            <>
              <p>{t('identity.providerHint')}</p>
              <label className="bh-im-field">
                <span>{t('identity.app')}</span>
                <Combobox
                  label={t('identity.app')}
                  toggleLabel={t('identity.app')}
                  placeholder={t('im.select')}
                  emptyLabel={t('im.setup')}
                  disabled={busy}
                  value={accountKey}
                  onSelect={setAccountKey}
                  options={[...accounts]
                    .sort(
                      (a, b) =>
                        Number(a.boundBotSlug !== undefined || !a.connected || !!a.unsupported) -
                          Number(b.boundBotSlug !== undefined || !b.connected || !!b.unsupported) ||
                        platform(a.platform).localeCompare(platform(b.platform)) ||
                        a.name.localeCompare(b.name),
                    )
                    .map((account) => ({
                      value: account.providerId + ':' + account.ref,
                      label: account.name,
                      hint: account.unsupported
                        ? t('identity.appUnsupported', { platform: platform(account.platform) })
                        : account.boundBotSlug === undefined
                          ? account.connected
                            ? platform(account.platform)
                            : t('identity.appOffline', { platform: platform(account.platform) })
                          : identities.some(
                                (i) =>
                                  i.providerId === account.providerId &&
                                  i.accountRef === account.ref,
                              )
                            ? t('identity.appThisBot', { platform: platform(account.platform) })
                            : t('identity.appUsedBy', {
                                platform: platform(account.platform),
                                name: botName(account.boundBotSlug),
                              }),
                      disabled:
                        !account.connected ||
                        account.boundBotSlug !== undefined ||
                        !!account.unsupported,
                    }))}
                />
              </label>
              {!accounts.length ? <p>{t('im.setup')}</p> : null}
              <p className="bh-muted">{t('identity.bindHint')}</p>
              <div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    setMode(undefined);
                    openImSettings(document, () => undefined);
                  }}
                >
                  {t('identity.manageApps')}
                </Button>
              </div>
            </>
          ) : mode === 'bound' && selectedAccount ? (
            <>
              <p className="bh-sidebar-modal-subject">
                {platform(selectedAccount.platform)} · {selectedAccount.name}
              </p>
              <p role="status">
                {t(
                  bound?.reception === 'receiving'
                    ? selectedAccount.platform === 'weixin'
                      ? 'identity.readyWeixin'
                      : 'identity.ready'
                    : bound?.reception === 'connecting' || bound === undefined
                      ? 'identity.connecting'
                      : 'identity.offline',
                  { app: selectedAccount.name },
                )}
              </p>
            </>
          ) : selected ? (
            <>
              <p className="bh-sidebar-modal-subject">
                {platform(selected.platform)} · {selected.name}
              </p>
              {mode === 'edit' ? (
                <>
                  <label className="bh-im-field">
                    <span>{t('identity.displayName')}</span>
                    <Input
                      value={name}
                      disabled={busy}
                      maxLength={120}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </label>
                  <div className="bh-im-field">
                    <span className="bh-im-heading">
                      <span>{t('defaults.identity')}</span>
                      <MessagingHelp
                        title={t('defaults.identity')}
                        text={t('defaults.restoreHint')}
                        t={t}
                      />
                    </span>
                    <Combobox
                      searchable={false}
                      label={t('defaults.identityOrigin')}
                      toggleLabel={t('defaults.identityOrigin')}
                      value={inheritEnabled ? 'inherit' : 'custom'}
                      disabled={busy}
                      onSelect={(value) => setInheritEnabled(value === 'inherit')}
                      options={[
                        { value: 'inherit', label: t('defaults.inherited') },
                        { value: 'custom', label: t('defaults.custom') },
                      ]}
                    />
                  </div>
                  {selected.platform === 'weixin' ? null : (
                    <div className="bh-im-field">
                      <span className="bh-im-heading">
                        <span>{t('identity.newConversations')}</span>
                        <MessagingHelp
                          title={t('identity.newConversations')}
                          text={t('identity.newConversationsHint')}
                          t={t}
                        />
                      </span>
                      <Combobox
                        searchable={false}
                        label={t('identity.newConversations')}
                        toggleLabel={t('identity.newConversations')}
                        value={newConversations}
                        disabled={busy}
                        onSelect={(value) => setNewConversations(value === 'ask' ? 'ask' : 'auto')}
                        options={[
                          { value: 'auto', label: t('identity.newConversations.auto') },
                          { value: 'ask', label: t('identity.newConversations.ask') },
                        ]}
                      />
                    </div>
                  )}
                </>
              ) : null}
              {mode === 'edit' ? (
                <div className="bh-im-field">
                  <span className="bh-im-heading">{t('identity.conversations')}</span>
                  <ExternalConversations
                    identity={selected}
                    snapshot={snapshot}
                    busy={busy}
                    t={t}
                    change={(input) => operate(() => conversation(input))}
                    rules={(grantId, input) => operate(() => rules(grantId, input))}
                    {...(channels ? { channels } : {})}
                  />
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
        </div>
      </Modal>
    </>
  );
}
