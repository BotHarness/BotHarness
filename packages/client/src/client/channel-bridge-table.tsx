import { externalPlatformLabel } from './bridge-source-label.js';
import { subscribeMessagingDefaults } from './messaging-defaults-live.js';
import type {} from '@deepseek-ai/dsh-api-session-controller/client';
import { useRef, useState, type ReactElement } from 'react';
import { Button, Switch, Tag } from '@deepseek-ai/dsh-client-ui-primitives';
import type {
  ChannelBridgeInput,
  ChannelBridgeRow,
  ChannelBridgeSnapshot,
} from '../../../core/src/messaging/channel-bridge.js';
import type { BridgeActions } from './actions.js';
import type { BotHarnessTranslate } from './locale.js';
import { useMountedResource } from './mounted-resource.js';
import { Modal } from './modal.js';

export function ChannelBridgeTable({
  channelId,
  channelName,
  botNames,
  actions,
  t,
}: {
  channelId: string;
  channelName: string;
  botNames: ReadonlyMap<string, string>;
  actions: Pick<BridgeActions, 'channelBridges' | 'channelBridge'>;
  t: BotHarnessTranslate;
}): ReactElement {
  const [snapshot, setSnapshot] = useState<ChannelBridgeSnapshot>();
  const [mode, setMode] = useState<'add' | 'edit' | 'delete'>();
  const [selected, setSelected] = useState<ChannelBridgeRow>();
  const [sourceId, setSourceId] = useState('');
  const [name, setName] = useState('');
  const [delivery, setDelivery] = useState<'channel' | 'inbox'>('channel');
  const [enabled, setEnabled] = useState(true);
  const [collection, setCollection] = useState<'mentions' | 'all' | 'inherit'>('inherit');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const mounted = useRef(false);
  const refreshRequest = useRef(0);
  const generation = useRef(0);
  const source = mode === 'add' ? snapshot?.sources.find((s) => s.grantId === sourceId) : selected;
  const privateSource = source?.platform === 'weixin';
  const alreadyConnected =
    mode === 'add' &&
    snapshot?.bridges.some(
      (row) => row.grantId === sourceId && (row.delivery ?? 'channel') === delivery,
    );
  const refresh = async () => {
    const sequence = ++refreshRequest.current;
    const version = generation.current;
    const next = await actions.channelBridges(channelId);
    if (mounted.current && version === generation.current && sequence === refreshRequest.current)
      setSnapshot(next);
  };
  const mount = useMountedResource<HTMLDivElement>(() => {
    mounted.current = true;
    ++generation.current;
    setSnapshot(undefined);
    void refresh().catch(() => {
      if (mounted.current) setError(t('bridge.failed'));
    });
    const unsubscribeDefaults = subscribeMessagingDefaults(
      () => void refresh().catch(() => undefined),
    );
    return () => {
      unsubscribeDefaults();
      mounted.current = false;
      ++generation.current;
    };
  }, [channelId, actions]);
  const operate = async (operation: () => Promise<void>, close = false) => {
    if (busy) return;
    const version = generation.current;
    setBusy(true);
    setError('');
    try {
      await operation();
      await refresh();
      if (close && mounted.current && version === generation.current) setMode(undefined);
    } catch (err) {
      await refresh().catch(() => undefined);
      const code = err instanceof Error && 'code' in err ? err.code : '';
      if (mounted.current && version === generation.current)
        setError(
          t(
            code === 'bridge-stale'
              ? 'bridge.stale'
              : code === 'ordinary-delivery-unverified'
                ? 'bridge.unverified'
                : 'bridge.failed',
          ),
        );
    } finally {
      if (mounted.current && version === generation.current) setBusy(false);
    }
  };
  const open = (next: typeof mode, row?: ChannelBridgeRow) => {
    setMode(next);
    setDelivery(row?.delivery ?? 'channel');
    setSelected(row);
    setName(row?.name ?? '');
    setSourceId('');
    setEnabled(row?.enabled ?? true);
    setCollection(
      row ? (row.collectionInheritance === 'inherit' ? 'inherit' : row.collection) : 'inherit',
    );
    setError('');
  };
  const update = (row: ChannelBridgeRow, preference: boolean): ChannelBridgeInput => ({
    kind: 'update',
    ...(row.routeId ? { routeId: row.routeId } : {}),
    ...(row.delivery ? { delivery: row.delivery } : {}),
    grantId: row.grantId,
    expectedGrantRevision: row.grantRevision,
    expectedRevision: row.revision,
    name: row.name,
    enabled: preference,
    collection: row.collection,
    ...(row.collectionInheritance ? { collectionInheritance: row.collectionInheritance } : {}),
    ...(row.defaultRevision !== undefined ? { expectedDefaultRevision: row.defaultRevision } : {}),
  });
  const save = async () => {
    if (!source) return;
    const base = {
      grantId: source.grantId,
      expectedGrantRevision: source.grantRevision,
      ...(mode === 'add' || selected?.delivery ? { delivery } : {}),
      ...(selected?.routeId && mode !== 'add' ? { routeId: selected.routeId } : {}),
    };
    const input: ChannelBridgeInput =
      mode === 'delete' && selected
        ? { kind: 'delete', ...base, expectedRevision: selected.revision }
        : mode === 'edit' && selected
          ? {
              kind: 'update',
              ...base,
              expectedRevision: selected.revision,
              name,
              enabled,
              collection: privateSource
                ? 'all'
                : collection === 'inherit'
                  ? selected.collection
                  : collection,
              collectionInheritance: privateSource
                ? 'custom'
                : collection === 'inherit'
                  ? 'inherit'
                  : 'custom',
              ...(selected.defaultRevision !== undefined
                ? { expectedDefaultRevision: selected.defaultRevision }
                : {}),
            }
          : {
              kind: 'add',
              ...base,
              name,
              enabled,
              collection: privateSource
                ? 'all'
                : collection === 'inherit'
                  ? 'mentions'
                  : collection,
              collectionInheritance: privateSource
                ? 'custom'
                : collection === 'inherit'
                  ? 'inherit'
                  : 'custom',
              ...(source.defaultRevision !== undefined
                ? { expectedDefaultRevision: source.defaultRevision }
                : {}),
            };
    await actions.channelBridge(channelId, input);
  };
  return (
    <div
      ref={mount}
      className="bh-profile-section bh-channel-bridges"
      role="region"
      aria-label={t('bridge.title')}
    >
      <header className="bh-identity-header">
        <div>
          <strong>{t('bridge.title')}</strong>
          <p>{t('bridge.summary')}</p>
        </div>
        <div className="bh-identity-actions">
          <Button disabled={busy} onClick={() => void operate(async () => undefined)}>
            {t('im.refresh')}
          </Button>
          <Button disabled={busy || !snapshot} onClick={() => open('add')}>
            {t('bridge.add')}
          </Button>
        </div>
      </header>
      {error && !mode ? (
        <p className="bh-error" role="alert">
          {error}
        </p>
      ) : null}
      {!snapshot ? (
        <p>{t('im.loading')}</p>
      ) : !snapshot.bridges.length ? (
        <p>{t('bridge.empty')}</p>
      ) : (
        <div className="bh-bridge-table-wrap">
          <table className="bh-source-policy-table bh-bridge-table" aria-label={t('bridge.title')}>
            <thead>
              <tr>
                {(
                  [
                    'bridge.source',
                    'bridge.conversation',
                    'bridge.condition',
                    'bridge.account',
                    'bridge.state',
                    'bridge.enabled',
                    'bridge.actions',
                  ] as const
                ).map((key) => (
                  <th scope="col" key={key}>
                    {t(key)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {snapshot.bridges.map((row) => (
                <tr key={row.routeId ?? row.grantId}>
                  <th scope="row">
                    {row.name}
                    {row.delivery === 'inbox' ? (
                      <span className="bh-bridge-secondary">{t('bridge.inboxOnly')}</span>
                    ) : null}
                    <span className="bh-bridge-secondary">
                      {externalPlatformLabel(row.platform, t)}
                    </span>
                  </th>
                  <td>{row.conversationName}</td>
                  <td>
                    {t(
                      row.platform === 'weixin'
                        ? 'bridge.ownerDM'
                        : row.collection === 'all'
                          ? 'bridge.all'
                          : 'bridge.mentions',
                    )}
                    {row.platform !== 'weixin' ? (
                      <span className="bh-bridge-secondary">
                        {t(
                          row.collectionInheritance === 'inherit'
                            ? 'defaults.inherited'
                            : 'defaults.custom',
                        )}
                        {row.collectionInheritance === 'inherit'
                          ? ` · v${row.defaultRevision ?? 0}`
                          : ''}
                      </span>
                    ) : null}
                    {row.platform !== 'weixin' &&
                    row.collection === 'all' &&
                    row.ordinaryDelivery !== 'verified' ? (
                      <span className="bh-bridge-secondary">{t('bridge.unverified')}</span>
                    ) : null}
                  </td>
                  <td>
                    {row.accountName}
                    <span className="bh-bridge-secondary">
                      {botNames.get(row.botSlug) ?? row.botSlug}
                    </span>
                  </td>
                  <td>
                    <Tag tone="neutral">
                      {t(
                        !row.enabled
                          ? 'bridge.state.off'
                          : row.availability !== 'available'
                            ? 'bridge.state.unavailable'
                            : row.reception === 'receiving'
                              ? 'bridge.state.receiving'
                              : row.reception === 'connecting'
                                ? 'bridge.state.connecting'
                                : 'bridge.state.unavailable',
                      )}
                    </Tag>
                  </td>
                  <td>
                    <Switch
                      checked={row.enabled}
                      disabled={busy}
                      label={t('bridge.enableFor', { name: row.name })}
                      onChange={(checked) =>
                        void operate(() => actions.channelBridge(channelId, update(row, checked)))
                      }
                    />
                  </td>
                  <td>
                    <div className="bh-identity-actions">
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        aria-label={t('bridge.editFor', { name: row.name })}
                        onClick={() => open('edit', row)}
                      >
                        {t('identity.edit')}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        aria-label={t('bridge.deleteFor', { name: row.name })}
                        onClick={() => open('delete', row)}
                      >
                        {t('common.delete')}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="bh-bridge-secondary">{t('bridge.wakeHint')}</p>
      <Modal
        open={mode !== undefined}
        onClose={() => {
          if (!busy) setMode(undefined);
        }}
        title={t(
          mode === 'add' ? 'bridge.add' : mode === 'delete' ? 'bridge.delete' : 'bridge.edit',
        )}
        closeLabel={t('common.close')}
      >
        {error ? (
          <p role="alert" className="bh-error">
            {error}
          </p>
        ) : null}
        {mode === 'add' ? (
          <>
            <label className="bh-im-field">
              <span>{t('bridge.authorizedSource')}</span>
              <select
                value={sourceId}
                disabled={busy}
                onChange={(e) => {
                  setSourceId(e.target.value);
                  const chosen = snapshot?.sources.find((s) => s.grantId === e.target.value);
                  setName(chosen?.conversationName ?? '');
                }}
              >
                <option value="">{t('im.select')}</option>
                {snapshot?.sources.map((s) => (
                  <option
                    key={s.grantId}
                    value={s.grantId}
                    disabled={snapshot.bridges.some(
                      (row) =>
                        row.grantId === s.grantId && (row.delivery ?? 'channel') === delivery,
                    )}
                  >
                    {s.conversationName} · {s.accountName}
                  </option>
                ))}
              </select>
            </label>
            {!snapshot?.sources.length ? <p>{t('bridge.noSources')}</p> : null}
            <p>{t('bridge.addHint')}</p>
          </>
        ) : null}
        {source ? (
          <>
            <p>
              {externalPlatformLabel(source.platform, t)} · {source.conversationName}
            </p>
            <p>{t('bridge.receiver', { name: source.accountName })}</p>
          </>
        ) : null}
        {mode === 'add' && snapshot?.canTargetInbox ? (
          <label className="bh-im-field">
            <span>{t('bridge.destination')}</span>
            <select
              value={delivery}
              disabled={busy}
              onChange={(e) => setDelivery(e.target.value === 'inbox' ? 'inbox' : 'channel')}
            >
              <option value="channel">{t('bridge.dmTarget', { name: channelName })}</option>
              <option value="inbox">{t('bridge.inboxOnly')}</option>
            </select>
          </label>
        ) : (
          <p>
            {delivery === 'inbox'
              ? t('bridge.inboxOnly')
              : t('bridge.target', { name: channelName })}
          </p>
        )}
        {delivery === 'inbox' ? <p>{t('bridge.inboxOnlyHint')}</p> : null}
        {mode === 'delete' ? (
          <>
            <p>{t('bridge.deleteImpact')}</p>
            <p>{t('bridge.retainHint')}</p>
          </>
        ) : (
          <>
            <label className="bh-im-field">
              <span>{t('bridge.name')}</span>
              <input
                value={name}
                disabled={busy}
                maxLength={120}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label className="bh-im-field">
              <span>{t('bridge.condition')}</span>
              {privateSource ? (
                <p>{t('bridge.ownerDM')}</p>
              ) : (
                <select
                  value={collection}
                  disabled={busy}
                  onChange={(e) =>
                    setCollection(
                      e.target.value === 'inherit'
                        ? 'inherit'
                        : e.target.value === 'all'
                          ? 'all'
                          : 'mentions',
                    )
                  }
                >
                  <option value="inherit">{t('defaults.inherited')}</option>
                  <option value="mentions">{t('bridge.mentions')}</option>
                  <option value="all" disabled={source?.ordinaryDelivery !== 'verified'}>
                    {t('bridge.all')}
                  </option>
                </select>
              )}
            </label>
            {privateSource ? <p>{t('bridge.wechatDMHint')}</p> : null}
            {!privateSource && source?.ordinaryDelivery !== 'verified' ? (
              <p>{t('bridge.unverified')}</p>
            ) : null}
            <Switch
              checked={enabled}
              disabled={busy}
              label={t('bridge.enableDraft')}
              onChange={setEnabled}
            />
            {!privateSource ? <p>{t('bridge.providerHint')}</p> : null}
          </>
        )}
        <Button
          disabled={busy || !source || alreadyConnected || (mode !== 'delete' && !name.trim())}
          onClick={() => void operate(save, true)}
        >
          {t(
            busy ? 'identity.pending' : mode === 'delete' ? 'bridge.confirmDelete' : 'bridge.save',
          )}
        </Button>
      </Modal>
    </div>
  );
}
