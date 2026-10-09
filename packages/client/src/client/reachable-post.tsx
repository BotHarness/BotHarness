import { useRef, useState, type ReactElement } from 'react';
import { Button, Input } from '@deepseek-ai/dsh-client-ui-primitives';
import type { MessagingIdentityView } from '../../../core/src/messaging/identity.js';
import type { MessagingReachablePage } from '../../../core/src/messaging/provider.js';
import type { OutboxIntent } from '../../../core/src/messaging/outbound.js';
import type { BridgeActions } from './actions.js';
import type { BotHarnessTranslate } from './locale.js';
import { Modal } from './modal.js';
import { Combobox } from './combobox.js';
import { useMountedResource } from './mounted-resource.js';

export function ReachablePostDialog({
  slug,
  identity,
  actions,
  t,
  onClose,
  refresh,
}: {
  slug: string;
  identity: MessagingIdentityView;
  actions: Pick<
    BridgeActions,
    'messagingReachable' | 'messagingPostConversation' | 'messagingPostLimit'
  >;
  t: BotHarnessTranslate;
  onClose(): void;
  refresh(): Promise<void>;
}): ReactElement {
  const [groups, setGroups] = useState<MessagingReachablePage['conversations']>([]);
  const [cursor, setCursor] = useState<string>();
  const [group, setGroup] = useState('');
  const [text, setText] = useState('');
  const [limit, setLimit] = useState(
    identity.postLimit === null ? '' : String(identity.postLimit ?? 60),
  );
  const [revision, setRevision] = useState(identity.revision);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<OutboxIntent>();
  const [legacy, setLegacy] = useState(false);
  const live = useRef(false);
  const request = useRef<{ id: string; group: string; text: string }>();
  const load = async (next?: string) => {
    setLoading(true);
    setError('');
    try {
      if (!actions.messagingReachable) {
        setLegacy(true);
        return;
      }
      const page = await actions.messagingReachable(slug, identity.id, next);
      if (!live.current) return;
      setGroups((prior) =>
        [...(next ? prior : []), ...page.conversations].filter(
          (value, index, all) => all.findIndex((other) => other.id === value.id) === index,
        ),
      );
      setCursor(page.hasMore ? page.cursor : undefined);
    } catch (failure) {
      if (!live.current) return;
      const code =
        failure && typeof failure === 'object' && 'code' in failure ? failure.code : undefined;
      if (code === 'capability-unavailable') setLegacy(true);
      else setError(t('proactive.loadError'));
    } finally {
      if (live.current) setLoading(false);
    }
  };
  const mount = useMountedResource<HTMLDivElement>(() => {
    live.current = true;
    void load();
    return () => {
      live.current = false;
    };
  }, [identity.id]);
  const unknown =
    result?.state === 'unknown-outcome' &&
    request.current?.group === group &&
    request.current.text === text;
  const send = async () => {
    if (busy || loading || unknown || !group || !text.trim() || !actions.messagingPostConversation)
      return;
    setBusy(true);
    setError('');
    if (!request.current || request.current.group !== group || request.current.text !== text)
      request.current = { id: crypto.randomUUID(), group, text };
    try {
      const intent = await actions.messagingPostConversation(
        slug,
        identity.id,
        group,
        request.current.id,
        text,
      );
      if (!live.current) return;
      setResult(intent);
      await refresh();
    } catch {
      if (live.current) setError(t('proactive.sendError'));
    } finally {
      if (live.current) setBusy(false);
    }
  };
  const saveLimit = async () => {
    const value = limit.trim() === '' ? null : Number(limit);
    if (
      !actions.messagingPostLimit ||
      busy ||
      (value !== null && (!Number.isInteger(value) || value < 1 || value > 10000))
    )
      return;
    setBusy(true);
    setError('');
    try {
      await actions.messagingPostLimit(slug, identity.id, revision, value);
      if (!live.current) return;
      setRevision((prior) => prior + 1);
      await refresh();
    } catch {
      if (live.current) setError(t('proactive.limitError'));
    } finally {
      if (live.current) setBusy(false);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={t('proactive.title')}
      closeLabel={t('common.close')}
      className="bh-sidebar-modal"
      contentClassName="bh-im-fields"
      footer={
        <div className="bh-modal-footer">
          <Button variant="outline" onClick={onClose}>
            {t('common.close')}
          </Button>
          <Button
            variant="primary"
            disabled={busy || loading || legacy || unknown || !group || !text.trim()}
            onClick={() => void send()}
          >
            {t('proactive.send')}
          </Button>
        </div>
      }
    >
      <div ref={mount} className="bh-im-fields">
        <p className="bh-sidebar-modal-subject">{identity.name}</p>
        <p className="bh-note">{t('proactive.description')}</p>
        {legacy ? (
          <p role="status">{t('proactive.legacy')}</p>
        ) : (
          <>
            <div className="bh-im-field">
              <label>{t('proactive.group')}</label>
              <Combobox
                value={group}
                onSelect={(value) => {
                  setGroup(value);
                  setResult(undefined);
                }}
                label={t('proactive.group')}
                toggleLabel={t('proactive.group')}
                placeholder={t('proactive.chooseGroup')}
                emptyLabel={t('proactive.empty')}
                disabled={loading || busy}
                options={groups.map((value) => ({ value: value.id, label: value.name }))}
              />
            </div>
            {loading ? <p role="status">{t('im.loading')}</p> : null}
            {cursor ? (
              <Button
                variant="outline"
                disabled={busy || loading}
                onClick={() => void load(cursor)}
              >
                {t('proactive.more')}
              </Button>
            ) : null}
            <div className="bh-im-field">
              <label htmlFor="bh-proactive-text">{t('proactive.message')}</label>
              <textarea
                id="bh-proactive-text"
                className="bh-im-textarea"
                value={text}
                maxLength={4000}
                disabled={busy}
                onChange={(event) => {
                  setText(event.currentTarget.value);
                  setResult(undefined);
                }}
              />
            </div>
          </>
        )}
        <div className="bh-im-field">
          <label>{t('proactive.limit')}</label>
          <Input
            aria-label={t('proactive.limit')}
            value={limit}
            onChange={(event) => setLimit(event.currentTarget.value)}
            disabled={busy}
          />
          <p className="bh-note">{t('proactive.limitHint')}</p>
          <Button variant="outline" disabled={busy} onClick={() => void saveLimit()}>
            {t('proactive.saveLimit')}
          </Button>
        </div>
        {error ? (
          <p role="alert" className="bh-error">
            {error}
          </p>
        ) : null}
        {result ? (
          <p role="status">
            {t(
              result.state === 'unknown-outcome'
                ? 'proactive.unknown'
                : result.state === 'provider-accepted'
                  ? 'proactive.accepted'
                  : result.reason === 'post-rate-limited'
                    ? 'proactive.rateLimited'
                    : 'proactive.failed',
            )}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
