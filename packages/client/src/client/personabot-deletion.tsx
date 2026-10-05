import { useState, type ReactElement } from 'react';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';

import type { PersonaBotDeletionPreview } from '../../../core/src/bots/deletion.js';
import type { BridgeActions } from './actions.js';
import type { HostFileOptions } from './host-file-actions.js';
import type { BotHarnessTranslate } from './locale.js';
import { Modal } from './modal.js';
import { useMountedResource } from './mounted-resource.js';

export function PersonaBotDeletionView({
  slug,
  actions,
  t,
  onClose,
  history = false,
}: {
  slug: string;
  actions: BridgeActions;
  t: BotHarnessTranslate;
  onClose(): void;
  history?: boolean;
}): ReactElement {
  const [preview, setPreview] = useState<PersonaBotDeletionPreview>();
  const [erase, setErase] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [handlers, setHandlers] = useState<HostFileOptions>();
  const mount = useMountedResource<HTMLDivElement>(() => {
    let active = true;
    setErase(false);
    void actions.deletionPreview(slug).then(
      (next) => {
        if (active) setPreview(next);
      },
      (failure) => {
        if (active) setError(failure instanceof Error ? failure.message : String(failure));
      },
    );
    return () => {
      active = false;
    };
  }, [actions, slug]);
  const perform = async (operation: () => Promise<void>): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    try {
      await operation();
    } catch (failure) {
      setErase(false);
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setBusy(false);
    }
  };
  const state = preview?.deletion;
  const content = (
    <div ref={mount} className="bh-bot-deletion">
      {preview === undefined ? (
        <p>{t('deletion.loading')}</p>
      ) : (
        <>
          <p>
            {preview.displayName} · {slug}
          </p>
          <p>{t(state === undefined ? 'deletion.description' : 'deletion.history')}</p>
          <p className="bh-bot-deletion-path">{preview.memoryDir}</p>
          <p>{t('deletion.hostFolder')}</p>
          <div className="bh-bot-deletion-actions">
            <Button
              variant="outline"
              disabled={busy || state?.memory === 'erased'}
              onClick={() => void perform(() => actions.deletionFolderOpen(slug))}
            >
              {t('deletion.openFolder')}
            </Button>
            <Button
              variant="ghost"
              disabled={busy || state?.memory === 'erased'}
              onClick={() =>
                void perform(async () => {
                  const options = await actions.deletionFolderApplications(slug);
                  setHandlers(options);
                  if (!options.available) throw new Error(t('deletion.noHandler'));
                })
              }
            >
              {t('deletion.otherApp')}
            </Button>
            {handlers?.applications.map((app) => (
              <Button
                key={app.id}
                variant="ghost"
                disabled={busy}
                onClick={() =>
                  void perform(() => actions.deletionFolderOpen(slug, { application: app.id }))
                }
              >
                {app.name}
              </Button>
            ))}
          </div>
          <details>
            <summary>{t('deletion.dependencies')}</summary>
            <dl>
              <dt>{t('deletion.sessions')}</dt>
              <dd>{preview.dependencies.sessions.length}</dd>
              <dt>{t('deletion.authorizations')}</dt>
              <dd>{preview.dependencies.grants.length + preview.dependencies.identities.length}</dd>
              <dt>{t('deletion.channels')}</dt>
              <dd>{preview.dependencies.channels.length}</dd>
              <dt>{t('deletion.workspaces')}</dt>
              <dd>{preview.dependencies.workspaces.join('\n') || '—'}</dd>
            </dl>
          </details>
          {state === undefined ? (
            <>
              <label className="bh-bot-deletion-choice">
                <input
                  type="checkbox"
                  checked={erase}
                  disabled={busy || !preview.eraseAvailable}
                  onChange={(event) => setErase(event.target.checked)}
                />
                {t('deletion.eraseMemory')}
              </label>
              {preview.refusal === undefined ? null : <p>{preview.refusal}</p>}
              <p>{t(erase ? 'deletion.eraseScope' : 'deletion.retainScope')}</p>
            </>
          ) : (
            <>
              <p>
                {t(
                  state.memory === 'erased'
                    ? 'deletion.erased'
                    : state.memory === 'pending'
                      ? 'deletion.pending'
                      : 'deletion.retained',
                )}
              </p>
              {state.failure === undefined ? null : (
                <p className="bh-modal-error" role="alert">
                  {state.failure}
                </p>
              )}
              {state.phase !== 'complete' ? (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    void perform(async () => {
                      await actions.deletionRetry(slug);
                      setPreview(await actions.deletionPreview(slug));
                    })
                  }
                >
                  {t('deletion.retry')}
                </Button>
              ) : null}
            </>
          )}
        </>
      )}
      {error === undefined ? null : (
        <p className="bh-modal-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
  if (history)
    return (
      <section className="bh-profile-section">
        <h2>{t('deletion.deleted')}</h2>
        {content}
      </section>
    );
  return (
    <Modal
      open
      onClose={() => {
        if (!busy) onClose();
      }}
      title={t('deletion.title')}
      closeLabel={t('common.cancel')}
      footer={
        <>
          <Button variant="outline" disabled={busy} onClick={onClose}>
            {t('common.cancel')}
          </Button>
          {state === undefined ? (
            <Button
              variant="primary"
              className="bh-bot-deletion-confirm"
              disabled={busy || preview === undefined || (erase && !preview.eraseAvailable)}
              onClick={() =>
                void perform(async () => {
                  if (preview === undefined) return;
                  await actions.deletionConfirm(slug, preview.token, erase);
                  setErase(false);
                  setPreview(await actions.deletionPreview(slug));
                })
              }
            >
              {t(erase ? 'deletion.confirmErase' : 'deletion.confirmRetain')}
            </Button>
          ) : null}
        </>
      }
    >
      {content}
    </Modal>
  );
}
