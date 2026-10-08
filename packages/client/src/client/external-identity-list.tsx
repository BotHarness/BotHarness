import { CreateAppForm } from './create-app-form.js';
import type { ProviderAppSetup } from './provider-app-setup.js';
import { externalPlatformLabel } from './bridge-source-label.js';
import { useRef, useState, type ReactElement } from 'react';
import {
  Button,
  Input,
  Switch,
  Tag,
  Tooltip,
  IconPlusOutlineRegular,
  IconRefreshOutlineRegular,
  IconRightUpOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives';
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
import { openExternalBindingSettings } from './bot-settings-open.js';
import { useMountedResource } from './mounted-resource.js';

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
  refresh,
  channels,
  botName = (slug) => slug,
  bindDialog,
  appSetup,
}: {
  snapshot: MessagingSnapshot | undefined;
  t: BotHarnessTranslate;
  mutate(input: MessagingIdentityInput): Promise<void>;
  conversation(input: MessagingConversationInput): Promise<void>;
  rules(grantId: string, input: GroupReceptionInput): Promise<void>;
  refresh(): Promise<void>;
  channels?: { id: string; name: string }[];
  botName?(slug: string): string;
  appSetup?: { client: ProviderAppSetup; botSlug: string } | undefined;
  bindDialog?: { onClose(): void; dismissLabel: string; description: string };
}): ReactElement {
  const [mode, setMode] = useState<'bind' | 'bound' | 'edit' | 'reconnect' | 'unbind' | undefined>(
    bindDialog ? 'bind' : undefined,
  );
  const [selected, setSelected] = useState<MessagingIdentityView>();
  const [creatingApp, setCreatingApp] = useState(false);
  const [accountKey, setAccountKey] = useState('');
  const [name, setName] = useState('');
  const [inheritEnabled, setInheritEnabled] = useState(false);
  const [typingEnabled, setTypingEnabled] = useState(true);
  const [inheritTyping, setInheritTyping] = useState(false);
  const [newConversations, setNewConversations] = useState<'auto' | 'ask' | 'inherit'>('inherit');
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const active = useRef(false);
  const refreshSequence = useRef(0);
  const settingsCleanup = useRef<(() => void) | undefined>(undefined);
  const mount = useMountedResource<HTMLSpanElement>(() => {
    active.current = true;
    if (bindDialog) void refreshApps();
    return () => {
      active.current = false;
      refreshSequence.current++;
      settingsCleanup.current?.();
    };
  }, []);
  const refreshApps = async () => {
    const sequence = ++refreshSequence.current;
    const current = () => active.current && refreshSequence.current === sequence;
    setRefreshing(true);
    setError('');
    try {
      await refresh();
    } catch {
      if (current()) setError(t('identity.refreshFailed'));
    } finally {
      if (current()) setRefreshing(false);
    }
  };
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
    settingsCleanup.current?.();
    refreshSequence.current++;
    setRefreshing(false);
    setError('');
    setMode(next);
    setCreatingApp(false);
    setSelected(row);
    setName(row?.name ?? '');
    setInheritEnabled(row?.enabledInheritance === 'inherit');
    setTypingEnabled(row?.typingEnabled !== false);
    setInheritTyping(row?.typingInheritance === 'inherit');
    setNewConversations(
      row?.newConversationsInheritance === 'custom' ? row.newConversations : 'inherit',
    );
    setAccountKey('');
    if (next === 'bind') void refreshApps();
  };
  const close = () => {
    if (!busy) {
      refreshSequence.current++;
      setRefreshing(false);
      settingsCleanup.current?.();
      setMode(undefined);
      bindDialog?.onClose();
    }
  };
  const openAppSettings = () => {
    setMode(undefined);
    settingsCleanup.current?.();
    settingsCleanup.current = openExternalBindingSettings(
      document,
      () => {
        if (!active.current) return;
        setMode('bind');
        void refreshApps();
      },
      () => {
        if (!active.current) return;
        setMode('bind');
        setError(t('identity.settingsUnavailable'));
      },
    );
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
            : code === 'defaults-stale'
              ? 'defaults.stale'
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
              ...(selected.platform === 'weixin' ? { typingEnabled, inheritTyping } : {}),
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
      <span hidden ref={mount} />
      {error && !mode ? (
        <p role="alert" className="bh-error">
          {error}
        </p>
      ) : null}
      {bindDialog ? null : (
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
                chips={
                  <>
                    <Tag tone="neutral">{t(AVAILABILITY[row.availability])}</Tag>
                    {row.platform === 'weixin' ? (
                      <span className="bh-bridge-secondary" role="status">
                        {t(
                          !row.typing?.supported
                            ? 'identity.typing.unavailable'
                            : !row.typingEnabled
                              ? 'identity.typing.off'
                              : row.typing.phase === 'cleanup-unconfirmed'
                                ? 'identity.typing.cleanup'
                                : row.typing.phase === 'unavailable'
                                  ? 'identity.typing.refused'
                                  : row.typing.phase === 'accepted'
                                    ? 'identity.typing.accepted'
                                    : row.typing.phase === 'requesting'
                                      ? 'identity.typing.requesting'
                                      : 'identity.typing.ready',
                        )}
                      </span>
                    ) : null}
                  </>
                }
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
      )}
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
                {bindDialog?.dismissLabel ?? t('common.cancel')}
              </Button>
            )}
            {mode === 'bound' ? (
              <Button variant="primary" onClick={close}>
                {t('identity.done')}
              </Button>
            ) : creatingApp ? null : (
              <Button
                variant="primary"
                className={mode === 'unbind' ? 'bh-im-danger' : undefined}
                disabled={
                  busy ||
                  (mode === 'bind' &&
                    (refreshing ||
                      !selectedAccount ||
                      !selectedAccount.connected ||
                      !!selectedAccount.boundBotSlug ||
                      !!selectedAccount.unsupported)) ||
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
          {bindDialog ? <p className="bh-note">{bindDialog.description}</p> : null}
          {error ? (
            <p role="alert" className="bh-error">
              {error}
            </p>
          ) : null}
          {mode === 'bind' && creatingApp && appSetup ? (
            <CreateAppForm
              client={appSetup.client}
              botSlug={appSetup.botSlug}
              descriptors={snapshot?.appSetups ?? []}
              t={t}
              onBack={() => setCreatingApp(false)}
              onCreated={async () => {
                const input = appSetup.client.binding(appSetup.botSlug);
                await mutate(input);
                await refresh();
                if (input.kind === 'bind') setAccountKey(input.providerId + ':' + input.accountRef);
                appSetup.client.forget(appSetup.botSlug);
                setCreatingApp(false);
                setMode('bound');
              }}
            />
          ) : mode === 'bind' ? (
            <>
              <nav className="bh-im-field" aria-label={t('identity.tutorials')}>
                <span className="bh-muted">{t('identity.tutorials')}</span>
                <div className="bh-im-tutorials">
                  {(['lark', 'slack', 'wechat', 'more'] as const).map((guide) => (
                    <a
                      key={guide}
                      href={t(`identity.tutorial.${guide}Url`)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {t(`identity.tutorial.${guide}`)}
                      <IconRightUpOutlineRegular size={14} />
                    </a>
                  ))}
                </div>
              </nav>
              <div className="bh-im-field">
                <div className="bh-im-app-heading">
                  <span>{t('identity.app')}</span>
                  {appSetup && snapshot?.appSetups?.length ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy || refreshing}
                      onClick={() => setCreatingApp(true)}
                    >
                      {t('appSetup.create')}
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy || refreshing}
                    onClick={openAppSettings}
                  >
                    <IconPlusOutlineRegular size={16} />
                    {t('identity.manageApps')}
                  </Button>
                </div>
                <div className="bh-im-app-picker">
                  <Combobox
                    label={t('identity.app')}
                    toggleLabel={t('identity.app')}
                    placeholder={t(accounts.length ? 'im.select' : 'identity.noApps')}
                    emptyLabel={t('identity.noApps')}
                    disabled={busy}
                    value={accountKey}
                    onSelect={setAccountKey}
                    action={{
                      label: t('identity.manageApps'),
                      onSelect: openAppSettings,
                      disabled: busy || refreshing,
                    }}
                    options={accounts
                      .filter(
                        (account) =>
                          !identities.some(
                            (i) =>
                              i.providerId === account.providerId && i.accountRef === account.ref,
                          ),
                      )
                      .sort(
                        (a, b) =>
                          Number(a.boundBotSlug !== undefined || !a.connected || !!a.unsupported) -
                            Number(
                              b.boundBotSlug !== undefined || !b.connected || !!b.unsupported,
                            ) ||
                          platform(a.platform).localeCompare(platform(b.platform)) ||
                          a.name.localeCompare(b.name),
                      )
                      .map((account) => ({
                        value: account.providerId + ':' + account.ref,
                        label: account.name,
                        hint:
                          account.boundBotSlug !== undefined
                            ? t('identity.appUsedBy', {
                                platform: platform(account.platform),
                                name: botName(account.boundBotSlug),
                              })
                            : account.unsupported
                              ? t('identity.appUnsupported', {
                                  platform: platform(account.platform),
                                })
                              : account.connected
                                ? platform(account.platform)
                                : t('identity.appOffline', {
                                    platform: platform(account.platform),
                                  }),
                        disabled:
                          !account.connected ||
                          account.boundBotSlug !== undefined ||
                          !!account.unsupported,
                      }))}
                  />
                  <Tooltip label={t('identity.refreshApps')} portal side="bottom" delayMs={250}>
                    <button
                      type="button"
                      className="bh-icon-btn bh-im-app-refresh"
                      aria-label={t('identity.refreshApps')}
                      aria-busy={refreshing}
                      disabled={busy || refreshing}
                      onClick={() => void refreshApps()}
                    >
                      <IconRefreshOutlineRegular size={16} />
                    </button>
                  </Tooltip>
                </div>
              </div>
              {appSetup && !snapshot?.appSetups?.length ? (
                <p className="bh-note">{t('appSetup.fallback')}</p>
              ) : null}
              {refreshing ? <p role="status">{t('identity.refreshing')}</p> : null}
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
                        onSelect={(value) =>
                          setNewConversations(
                            value === 'ask' || value === 'auto' ? value : 'inherit',
                          )
                        }
                        options={[
                          {
                            value: 'inherit',
                            label:
                              selected.newConversationsInheritance === 'custom'
                                ? t('identity.newConversations.inheritPlain')
                                : t('identity.newConversations.inherit', {
                                    value: t(
                                      selected.newConversations === 'ask'
                                        ? 'identity.newConversations.ask'
                                        : 'identity.newConversations.auto',
                                    ),
                                  }),
                          },
                          { value: 'auto', label: t('identity.newConversations.auto') },
                          { value: 'ask', label: t('identity.newConversations.ask') },
                        ]}
                      />
                    </div>
                  )}
                </>
              ) : null}
              {mode === 'edit' && selected.platform === 'weixin' ? (
                <div className="bh-im-field">
                  <span>{t('identity.typing.label')}</span>
                  <Combobox
                    searchable={false}
                    label={t('defaults.typingOrigin')}
                    toggleLabel={t('defaults.typingOrigin')}
                    value={inheritTyping ? 'inherit' : 'custom'}
                    disabled={busy}
                    onSelect={(value) => setInheritTyping(value === 'inherit')}
                    options={[
                      { value: 'inherit', label: t('defaults.inherited') },
                      { value: 'custom', label: t('defaults.custom') },
                    ]}
                  />
                  {inheritTyping ? (
                    <span className="bh-bridge-secondary">{t('defaults.typingInheritHint')}</span>
                  ) : (
                    <Switch
                      label={t('identity.typing.label')}
                      checked={typingEnabled}
                      disabled={busy}
                      onChange={setTypingEnabled}
                    />
                  )}
                  <span className="bh-bridge-secondary">{t('identity.typing.hint')}</span>
                  {!selected.typing?.supported ? (
                    <span className="bh-bridge-secondary">{t('identity.typing.unavailable')}</span>
                  ) : null}
                </div>
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
