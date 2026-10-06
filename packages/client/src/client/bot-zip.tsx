import { useRef, useState, type ReactElement } from 'react';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';

import type { BridgeActions } from './actions.js';
import { BridgeCallError } from './bridge.js';
import type { BotHarnessTranslate } from './locale.js';
import { Modal } from './modal.js';
import { personaBotCreateError } from './persona-bot-create.js';
import type { BotSummary } from './store.js';

export function botZipError(error: unknown, t: BotHarnessTranslate): string {
  if (error instanceof BridgeCallError) {
    switch (error.code) {
      case 'invalid-zip':
        return t('botZip.error.invalid');
      case 'unsafe-path':
        return t('botZip.error.unsafe');
      case 'too-large':
        return t('botZip.error.tooLarge');
      case 'empty':
        return t('botZip.error.empty');
    }
  }
  return personaBotCreateError(error, t);
}

export function ImportBotZipModal({
  actions,
  sectionId,
  sectionName,
  t,
  onCancel,
  onImported,
}: {
  actions: BridgeActions;
  sectionId?: string;
  sectionName?: string;
  t: BotHarnessTranslate;
  onCancel: () => void;
  onImported: () => void;
}): ReactElement {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File>();
  const [importing, setImporting] = useState(false);
  const [cause, setCause] = useState<unknown>();

  const submit = (): void => {
    if (file === undefined || importing) return;
    setImporting(true);
    setCause(undefined);
    void actions.importBotZip(file, sectionId).then(
      () => {
        setImporting(false);
        onImported();
      },
      (rejection: unknown) => {
        setImporting(false);
        setCause(rejection);
      },
    );
  };

  return (
    <Modal
      open
      onClose={() => {
        if (!importing) onCancel();
      }}
      closeLabel={t('common.close')}
      title={
        sectionName === undefined
          ? t('botZip.import.title')
          : t('botZip.import.inSection', { name: sectionName })
      }
      description={t('botZip.import.description')}
      footer={
        <>
          <Button variant="outline" disabled={importing} onClick={onCancel}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" disabled={file === undefined || importing} onClick={submit}>
            {importing ? t('botZip.import.importing') : t('botZip.import.submit')}
          </Button>
        </>
      }
    >
      <div className="bh-personabot-form bh-bot-zip-import">
        <div className="bh-bot-zip-file">
          <span className="bh-bot-zip-file-name" data-empty={file === undefined || undefined}>
            {file?.name ?? t('botZip.import.none')}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={importing}
            onClick={() => input.current?.click()}
          >
            {file === undefined ? t('botZip.import.choose') : t('botZip.import.change')}
          </Button>
          <input
            ref={input}
            type="file"
            accept=".zip,application/zip"
            hidden
            onChange={(event) => {
              const chosen = event.currentTarget.files?.[0];
              event.currentTarget.value = '';
              if (chosen !== undefined) {
                setFile(chosen);
                setCause(undefined);
              }
            }}
          />
        </div>
        <div className="bh-market-risk" role="note">
          <strong>{t('botZip.import.riskTitle')}</strong>
          <span>{t('botZip.import.risk')}</span>
        </div>
        {cause === undefined ? null : (
          <div className="bh-modal-error" role="alert">
            {t('create.failed', { error: botZipError(cause, t) })}
          </div>
        )}
      </div>
    </Modal>
  );
}

export function BotZipExportSection({
  bot,
  actions,
  t,
}: {
  bot: BotSummary;
  actions: BridgeActions;
  t: BotHarnessTranslate;
}): ReactElement {
  const [open, setOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [cause, setCause] = useState<unknown>();

  const submit = (): void => {
    if (exporting) return;
    setExporting(true);
    setCause(undefined);
    void actions.exportBotZip(bot.slug, bot.displayName).then(
      () => {
        setExporting(false);
        setOpen(false);
      },
      (rejection: unknown) => {
        setExporting(false);
        setCause(rejection);
      },
    );
  };

  return (
    <section
      className="bh-profile-section bh-profile-policy-section bh-bot-zip-export"
      aria-label={t('botZip.export.title')}
    >
      <h2 className="bh-profile-section-title">{t('botZip.export.title')}</h2>
      <p className="bh-settings-row-desc">{t('botZip.export.description')}</p>
      <div className="bh-standing-limits-actions">
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          {t('botZip.export.button')}
        </Button>
      </div>
      {open ? (
        <Modal
          open
          onClose={() => {
            if (!exporting) setOpen(false);
          }}
          closeLabel={t('common.close')}
          title={t('botZip.export.confirmTitle', { name: bot.displayName })}
          description={t('botZip.export.confirmBody')}
          footer={
            <>
              <Button variant="outline" disabled={exporting} onClick={() => setOpen(false)}>
                {t('common.cancel')}
              </Button>
              <Button variant="primary" disabled={exporting} onClick={submit}>
                {exporting ? t('botZip.export.exporting') : t('botZip.export.submit')}
              </Button>
            </>
          }
        >
          <div className="bh-personabot-form">
            <div className="bh-market-risk" role="note">
              <strong>{t('botZip.export.warningTitle')}</strong>
              <span>{t('botZip.export.warning')}</span>
            </div>
            {cause === undefined ? null : (
              <div className="bh-modal-error" role="alert">
                {t('botZip.export.failed', { error: botZipError(cause, t) })}
              </div>
            )}
          </div>
        </Modal>
      ) : null}
    </section>
  );
}
