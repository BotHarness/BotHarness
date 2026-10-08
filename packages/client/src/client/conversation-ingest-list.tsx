import { useRef, useState, type ReactElement } from 'react';
import { Button, Switch, Tag } from '@deepseek-ai/dsh-client-ui-primitives';

import type {
  ConversationIngestRow,
  ConversationIngestSnapshot,
  ConversationIngestWake,
} from '../../../core/src/messaging/conversation-ingest.js';
import type { BridgeActions } from './actions.js';
import { externalPlatformLabel } from './bridge-source-label.js';
import { Combobox } from './combobox.js';
import { formatRelativeTime } from './labels.js';
import type { BotHarnessTranslate } from './locale.js';
import { Modal } from './modal.js';
import { useMountedResource } from './mounted-resource.js';
import { SidebarCardRow } from './sidebar-card.js';

const WAKE: Record<ConversationIngestWake['mode'], ConversationIngestWake> = {
  mentions: { mode: 'mentions', count: 10, intervalSeconds: 300 },
  digest: { mode: 'digest', count: 10, intervalSeconds: 300 },
  all: { mode: 'all', count: 1, intervalSeconds: 10 },
};

export function ConversationIngestRows({
  channelId,
  botNames,
  actions,
  t,
}: {
  channelId: string;
  botNames: ReadonlyMap<string, string>;
  actions: Pick<BridgeActions, 'channelIngests' | 'channelIngest'>;
  t: BotHarnessTranslate;
}): ReactElement {
  const [snapshot, setSnapshot] = useState<ConversationIngestSnapshot>();
  const [mode, setMode] = useState<'add' | 'edit' | 'delete'>();
  const [selected, setSelected] = useState<ConversationIngestRow>();
  const [bindingId, setBindingId] = useState('');
  const [conversationId, setConversationId] = useState('');
  const [wake, setWake] = useState<ConversationIngestWake['mode']>('mentions');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const mounted = useRef(false);
  const generation = useRef(0);
  const refresh = async () => {
    const version = generation.current;
    const next = await actions.channelIngests(channelId);
    if (mounted.current && version === generation.current) setSnapshot(next);
  };
  const mount = useMountedResource<HTMLLIElement>(() => {
    mounted.current = true;
    ++generation.current;
    void refresh().catch(() => {
      if (mounted.current) setError(t('ingest.failed'));
    });
    return () => {
      mounted.current = false;
      ++generation.current;
    };
  }, [channelId, actions]);
  const operate = async (operation: () => Promise<void>, close = false) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await operation();
      await refresh();
      if (close && mounted.current) setMode(undefined);
    } catch (err) {
      await refresh().catch(() => undefined);
      const code = err instanceof Error && 'code' in err ? err.code : '';
      if (mounted.current)
        setError(t(code === 'ingest-exists' ? 'ingest.exists' : 'ingest.failed'));
    } finally {
      if (mounted.current) setBusy(false);
    }
  };
  const open = (next: typeof mode, row?: ConversationIngestRow) => {
    setMode(next);
    setSelected(row);
    setBindingId('');
    setConversationId('');
    setWake(row?.wake.mode ?? 'mentions');
    setError('');
  };
  const candidate = snapshot?.candidates.find((item) => item.bindingId === bindingId);
  const connected = (id: string) =>
    snapshot?.ingests.some(
      (row) =>
        row.conversation.id === id &&
        candidate !== undefined &&
        row.platform === candidate.platform &&
        row.accountName === candidate.accountName,
    ) ?? false;
  const update = (
    row: ConversationIngestRow,
    patch: { enabled?: boolean; wake?: ConversationIngestWake },
  ) =>
    actions.channelIngest(channelId, {
      kind: 'update',
      ingestId: row.id,
      expectedRevision: row.revision,
      ...patch,
    });
  const save = async () => {
    if (mode === 'add')
      await actions.channelIngest(channelId, {
        kind: 'add',
        bindingId,
        conversation: { kind: 'group', id: conversationId },
        wake: WAKE[wake],
      });
    else if (mode === 'delete' && selected)
      await actions.channelIngest(channelId, {
        kind: 'delete',
        ingestId: selected.id,
        expectedRevision: selected.revision,
      });
    else if (selected) await update(selected, { wake: WAKE[wake] });
  };
  const close = () => {
    if (!busy) setMode(undefined);
  };
  const stateTone = (row: ConversationIngestRow) =>
    row.state === 'receiving' ? 'success' : row.state === 'unavailable' ? 'warning' : 'neutral';
  return (
    <>
      {snapshot?.ingests.map((row) => (
        <SidebarCardRow
          key={row.id}
          icon="messages-square"
          title={row.conversation.name}
          chips={<Tag tone={stateTone(row)}>{t(`ingest.state.${row.state}`)}</Tag>}
          meta={[
            externalPlatformLabel(row.platform, t),
            row.accountName,
            t(`ingest.wake.${row.wake.mode}`),
            ...(row.lastMessageAt
              ? [
                  t('ingest.lastMessage', {
                    time: formatRelativeTime(Date.parse(row.lastMessageAt), Date.now(), t),
                  }),
                ]
              : []),
          ].join(' · ')}
          muted={!row.enabled}
          hint={t('ingest.edit', { name: row.conversation.name })}
          dialog
          disabled={busy}
          onClick={() => open('edit', row)}
          trailing={
            <Switch
              checked={row.enabled}
              disabled={busy}
              label={t('ingest.enableFor', { name: row.conversation.name })}
              onChange={(checked) => void operate(() => update(row, { enabled: checked }))}
            />
          }
        />
      ))}
      <li ref={mount} className="bh-card-row" hidden />
      <SidebarCardRow
        anchor="conversation-ingest-add"
        icon="plus"
        title={t('ingest.add')}
        muted
        dialog
        disabled={busy || !snapshot}
        onClick={() => open('add')}
      />
      {error && !mode ? (
        <li className="bh-card-row bh-card-note">
          <span className="bh-error" role="alert">
            {error}
          </span>
        </li>
      ) : null}
      <Modal
        className="bh-sidebar-modal"
        open={mode !== undefined}
        onClose={close}
        title={
          mode === 'add'
            ? t('ingest.addTitle')
            : mode === 'delete'
              ? t('ingest.delete')
              : t('ingest.edit', { name: selected?.conversation.name ?? '' })
        }
        {...(mode === 'add' ? { description: t('ingest.summary') } : {})}
        closeLabel={t('common.close')}
        footer={
          <div className="bh-modal-footer">
            {mode === 'edit' && selected ? (
              <>
                <Button
                  variant="outline"
                  className="bh-im-danger-outline"
                  disabled={busy}
                  onClick={() => setMode('delete')}
                >
                  {t('common.delete')}
                </Button>
                <span className="bh-modal-footer-gap" />
              </>
            ) : null}
            <Button variant="outline" disabled={busy} onClick={close}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="primary"
              className={mode === 'delete' ? 'bh-im-danger' : undefined}
              disabled={busy || (mode === 'add' && (!candidate || !conversationId))}
              onClick={() => void operate(save, true)}
            >
              {t(
                busy
                  ? 'identity.pending'
                  : mode === 'delete'
                    ? 'ingest.confirmDelete'
                    : mode === 'add'
                      ? 'ingest.save'
                      : 'ingest.update',
              )}
            </Button>
          </div>
        }
      >
        <div className="bh-sidebar-modal-form">
          {error ? (
            <p role="alert" className="bh-error">
              {error}
            </p>
          ) : null}
          {mode === 'add' ? (
            <>
              <label className="bh-im-field">
                <span>{t('ingest.app')}</span>
                <Combobox
                  searchable={false}
                  label={t('ingest.app')}
                  toggleLabel={t('ingest.app')}
                  placeholder={t('im.select')}
                  emptyLabel={t('ingest.noApps')}
                  value={bindingId}
                  disabled={busy}
                  onSelect={(value) => {
                    setBindingId(value);
                    setConversationId('');
                  }}
                  options={(snapshot?.candidates ?? []).map((item) => ({
                    value: item.bindingId,
                    label: item.accountName,
                    hint: t('ingest.appHint', {
                      platform: externalPlatformLabel(item.platform, t),
                      bot: botNames.get(item.botSlug) ?? item.botSlug,
                    }),
                  }))}
                />
              </label>
              {snapshot && !snapshot.candidates.length ? (
                <p className="bh-muted">{t('ingest.noApps')}</p>
              ) : null}
              {candidate ? (
                <label className="bh-im-field">
                  <span>{t('ingest.conversation')}</span>
                  <Combobox
                    label={t('ingest.conversation')}
                    toggleLabel={t('ingest.conversation')}
                    placeholder={t('im.select')}
                    emptyLabel={t('ingest.noConversations')}
                    value={conversationId}
                    disabled={busy}
                    onSelect={setConversationId}
                    options={candidate.conversations.map((item) => ({
                      value: item.id,
                      label: item.name,
                      ...(item.name === item.id ? {} : { hint: item.id }),
                      disabled: connected(item.id),
                    }))}
                  />
                </label>
              ) : null}
              {candidate && !candidate.conversations.length ? (
                <p className="bh-muted">{t('ingest.noConversations')}</p>
              ) : null}
            </>
          ) : null}
          {mode === 'delete' ? (
            <p>{t('ingest.deleteImpact')}</p>
          ) : mode === undefined ? null : (
            <>
              <div className="bh-im-field">
                <span>{t('ingest.wake')}</span>
                <Combobox
                  searchable={false}
                  label={t('ingest.wake')}
                  toggleLabel={t('ingest.wake')}
                  value={wake}
                  disabled={busy}
                  onSelect={(value) =>
                    setWake(value === 'all' ? 'all' : value === 'digest' ? 'digest' : 'mentions')
                  }
                  options={(['mentions', 'digest', 'all'] as const).map((value) => ({
                    value,
                    label: t(`ingest.wake.${value}`),
                  }))}
                />
              </div>
              <p className="bh-muted">{t('ingest.wakeHint')}</p>
              <p className="bh-muted">{t('ingest.requirement')}</p>
            </>
          )}
        </div>
      </Modal>
    </>
  );
}
