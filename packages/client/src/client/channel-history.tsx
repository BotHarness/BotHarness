import { useState, type ReactElement } from 'react';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import type {
  ChannelHistoryItem,
  PurgePreview,
  PurgeSource,
} from '../../../core/src/purge/contracts.js';
import type { BridgeActions } from './actions.js';
import type { BotHarnessTranslate } from './locale.js';
import { Modal } from './modal.js';
import { useMountedResource } from './mounted-resource.js';
import { MessagingHelp } from './messaging-help.js';

export function ChannelHistory({
  actions,
  t,
  onClose,
}: {
  actions: BridgeActions;
  t: BotHarnessTranslate;
  onClose(): void;
}): ReactElement {
  const [channels, setChannels] = useState<ChannelHistoryItem[]>();
  const [channel, setChannel] = useState<ChannelHistoryItem>();
  const [sources, setSources] = useState<PurgeSource[]>([]);
  const [before, setBefore] = useState<string>();
  const [selected, setSelected] = useState<string[]>([]);
  const [preview, setPreview] = useState<PurgePreview>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [complete, setComplete] = useState(false);
  const date = (at: string): string => new Date(at).toLocaleString();
  const boundaries = [
    t('purge.noFiles'),
    t('purge.derivatives'),
    t('purge.disclosure'),
    t('purge.offline'),
  ].join('\n\n');
  const mount = useMountedResource<HTMLDivElement>(() => {
    let active = true;
    void actions.channelHistory().then(
      (items) => {
        if (active) setChannels(items);
      },
      (failure) => {
        if (active) setError(String(failure));
      },
    );
    return () => {
      active = false;
    };
  }, [actions]);
  const perform = async (operation: () => Promise<void>): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    try {
      await operation();
    } catch (failure) {
      setPreview(undefined);
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setBusy(false);
    }
  };
  const open = async (item: ChannelHistoryItem, older?: string): Promise<void> => {
    const page = await actions.channelHistorySources(item.id, older);
    setChannel(item);
    setSources(page.sources);
    setBefore(page.before);
    setSelected([]);
    setPreview(undefined);
    setComplete(false);
  };
  return (
    <Modal
      open
      onClose={() => {
        if (!busy) onClose();
      }}
      closeLabel={t('common.close')}
      title={t('purge.history')}
      className="bh-channel-history-dialog"
      contentClassName="bh-channel-history"
      footer={
        <>
          {preview ? (
            <>
              <Button variant="outline" disabled={busy} onClick={() => setPreview(undefined)}>
                {t('common.cancel')}
              </Button>
              <Button
                variant="primary"
                disabled={busy}
                onClick={() =>
                  void perform(async () => {
                    await actions.channelPurgeConfirm(
                      preview.channelId,
                      preview.sourceEventIds,
                      preview.token,
                    );
                    await open(channel!);
                    setComplete(true);
                  })
                }
              >
                {t('purge.confirm')}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" disabled={busy} onClick={onClose}>
                {t('common.close')}
              </Button>
              {channel ? (
                <Button
                  variant="primary"
                  disabled={busy || !selected.length}
                  onClick={() =>
                    void perform(async () => {
                      setPreview(await actions.channelPurgePreview(channel.id, selected));
                      setComplete(false);
                    })
                  }
                >
                  {t('purge.preview')}
                </Button>
              ) : null}
            </>
          )}
        </>
      }
    >
      <div ref={mount}>
        {error ? (
          <p className="bh-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="bh-channel-history-toolbar">
          <span className="bh-channel-history-hint">{t('purge.historySummary')}</span>
          <MessagingHelp
            title={t('purge.history')}
            text={[t('purge.historyHint'), t('purge.slice')].join('\n\n')}
            t={t}
          />
        </div>
        {complete ? (
          <p className="bh-channel-history-status" role="status">
            {t('purge.complete')}
          </p>
        ) : null}
        {preview ? (
          <>
            <div className="bh-channel-history-toolbar">
              <h3>{t('purge.scope', { count: preview.sourceEventIds.length })}</h3>
              <MessagingHelp
                title={t('purge.scopeDetails')}
                text={t('purge.expiry', { at: date(preview.expiresAt) })}
                t={t}
              />
            </div>
            <ul className="bh-channel-history-selected">
              {sources
                .filter((source) => preview.sourceEventIds.includes(source.sourceEventId))
                .map((source) => (
                  <li key={source.sourceEventId}>{source.body}</li>
                ))}
            </ul>
            <h3>{t('purge.placements')}</h3>
            <div className="bh-channel-history-placements">
              {preview.placements.map((p) => (
                <div key={p.channelId + p.messageId} className="bh-channel-history-toolbar">
                  <span>{p.name}</span>
                  <MessagingHelp title={p.name} text={p.channelId + '\n' + p.messageId} t={t} />
                </div>
              ))}
            </div>
            {preview.admissions.length ? (
              <>
                <h3>{t('purge.admissions')}</h3>
                <ul>
                  {preview.admissions.map((a, i) => (
                    <li key={i}>
                      {a.botSlug} · {a.state}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="bh-channel-history-hint">{t('purge.noAdmissions')}</p>
            )}
            <div className="bh-channel-history-toolbar">
              <p>{t('purge.irreversible')}</p>
              <MessagingHelp title={t('purge.boundaries')} text={boundaries} t={t} />
            </div>
          </>
        ) : channel ? (
          <>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setChannel(undefined);
                setSources([]);
                setSelected([]);
                setComplete(false);
              }}
            >
              {t('purge.back')}
            </Button>
            <h3>{channel.name}</h3>
            <p className="bh-channel-history-hint">
              {t('purge.endedAt', { at: date(channel.deletedAt) })}
            </p>
            <div className="bh-channel-history-sources">
              {sources.map((source) => (
                <div key={source.sourceEventId} className="bh-channel-history-source">
                  <label>
                    <input
                      type="checkbox"
                      checked={selected.includes(source.sourceEventId)}
                      disabled={busy || !!source.purgedAt || !!source.refusal}
                      onChange={(event) =>
                        setSelected(
                          event.target.checked
                            ? [...selected, source.sourceEventId]
                            : selected.filter((id) => id !== source.sourceEventId),
                        )
                      }
                    />
                    <span>
                      <small>{date(source.at)}</small>
                      <span className="bh-channel-history-body">
                        {source.purgedAt ? t('purge.purged') : source.body}
                      </span>
                      {source.refusal ? <small>{t('purge.unsupported')}</small> : null}
                    </span>
                  </label>
                  <MessagingHelp
                    title={t('purge.messageDetails')}
                    text={
                      source.messageId +
                      (source.purgedAt
                        ? '\n' +
                          t('purge.tombstone', { at: date(source.purgedAt) }) +
                          '\n\n' +
                          boundaries
                        : '')
                    }
                    t={t}
                  />
                </div>
              ))}
            </div>
            {!sources.length ? <p>{t('purge.empty')}</p> : null}
            {before ? (
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => void perform(() => open(channel, before))}
              >
                {t('purge.older')}
              </Button>
            ) : null}
          </>
        ) : (
          <>
            {channels === undefined ? (
              <p>{t('deletion.loading')}</p>
            ) : !channels.length ? (
              <p>{t('purge.noChannels')}</p>
            ) : (
              channels.map((item) => (
                <div key={item.id} className="bh-hidden-row" data-history-channel-id={item.id}>
                  <span className="bh-hidden-copy">
                    <span className="bh-hidden-name">{item.name}</span>
                    <span className="bh-hidden-meta">
                      {t('purge.endedAt', { at: date(item.deletedAt) })}
                    </span>
                  </span>
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => void perform(() => open(item))}
                  >
                    {t('purge.open')}
                  </Button>
                </div>
              ))
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
