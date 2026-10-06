import { useMemo, useState, useSyncExternalStore, type ReactElement } from 'react';

import { Button, MarkdownText, type MarkdownLabels } from '@deepseek-ai/dsh-client-ui-primitives';
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';

import type { ReleaseNote } from '../../../core/src/release/notes.js';
import type { BotHarnessKey, BotHarnessTranslate } from './locale.js';
import { Modal } from './modal.js';
import { useMountedResource } from './mounted-resource.js';
import type { ReleaseNotesController, ReleaseNotesSnapshot } from './release-notes.js';

const SECTION_KEYS: Record<string, BotHarnessKey> = {
  Added: 'releaseNotes.section.added',
  Changed: 'releaseNotes.section.changed',
  Fixed: 'releaseNotes.section.fixed',
  Documentation: 'releaseNotes.section.documentation',
  'Breaking Changes': 'releaseNotes.section.breaking',
  Deprecated: 'releaseNotes.section.deprecated',
  Removed: 'releaseNotes.section.removed',
  Security: 'releaseNotes.section.security',
};

const OPEN_RELEASE_LIMIT = 8;

export const RELEASE_UPDATE_PROFILE = 'web';

export function releaseUpdateCommand(version: string): string {
  return `dsh plugin --profile ${RELEASE_UPDATE_PROFILE} add deepseekbot@${version}`;
}

function useReleaseNotes(controller: ReleaseNotesController): ReleaseNotesSnapshot {
  return useSyncExternalStore(controller.source.subscribe, controller.source.getSnapshot);
}

export function ReleaseNotesList({
  releases,
  t,
}: {
  releases: readonly ReleaseNote[];
  t: BotHarnessTranslate;
}): ReactElement {
  const language = t('releaseNotes.language') === 'en' ? 'en' : 'zh';
  const labels = useMemo<MarkdownLabels>(
    () => ({
      code: { copyLabel: t('message.code.copy'), copiedLabel: t('message.code.copied') },
      footnotes: t('message.footnotes'),
    }),
    [t],
  );
  return (
    <div className="bh-release-notes" data-release-notes>
      {releases.map((release) => {
        const open =
          release.sections.reduce((total, section) => total + section.entries.length, 0) <=
          OPEN_RELEASE_LIMIT;
        return (
          <section
            key={release.version}
            className="bh-release-note"
            data-release-version={release.version}
          >
            <h3 className="bh-release-note-title">
              <span>v{release.version}</span>
              <time dateTime={release.date}>{release.date}</time>
            </h3>
            <div className="bh-release-note-summary">
              <MarkdownText text={release.summary[language]} labels={labels} />
            </div>
            {release.sections.map((section) => (
              <details key={section.name} className="bh-release-note-section" open={open}>
                <summary>
                  {t('releaseNotes.sectionCount', {
                    section:
                      SECTION_KEYS[section.name] === undefined
                        ? section.name
                        : t(SECTION_KEYS[section.name]!),
                    count: section.entries.length,
                  })}
                </summary>
                <ul>
                  {section.entries.map((entry, index) => (
                    <li key={index}>
                      <MarkdownText text={entry[language]} labels={labels} />
                    </li>
                  ))}
                </ul>
              </details>
            ))}
          </section>
        );
      })}
    </div>
  );
}

export function ReleaseNotesDialog({
  releases,
  title,
  description,
  onClose,
  t,
}: {
  releases: readonly ReleaseNote[] | undefined;
  title: string;
  description?: string | undefined;
  onClose: () => void;
  t: BotHarnessTranslate;
}): ReactElement {
  return (
    <Modal
      open={releases !== undefined}
      onClose={onClose}
      title={title}
      closeLabel={t('releaseNotes.close')}
      {...(description === undefined ? {} : { description })}
      className="bh-release-dialog"
      footer={
        <>
          <a
            className="bh-release-site-link"
            href={t('releaseNotes.siteUrl')}
            target="_blank"
            rel="noreferrer"
          >
            {t('releaseNotes.site')}
          </a>
          <Button variant="primary" onClick={onClose}>
            {t('releaseNotes.done')}
          </Button>
        </>
      }
    >
      {releases === undefined ? null : <ReleaseNotesList releases={releases} t={t} />}
    </Modal>
  );
}

export function ReleaseNotesAnnouncement({
  controller,
  t,
}: {
  controller: ReleaseNotesController;
  t: BotHarnessTranslate;
}): ReactElement {
  const snapshot = useReleaseNotes(controller);
  const mount = useMountedResource<HTMLSpanElement>(() => {
    void controller.start();
  }, [controller]);
  const version = snapshot.version ?? '';
  return (
    <>
      <span ref={mount} hidden aria-hidden="true" />
      <ReleaseNotesDialog
        releases={snapshot.announcement}
        title={t('releaseNotes.announce.title', { version })}
        description={t(
          snapshot.firstRun
            ? 'releaseNotes.announce.firstRun'
            : 'releaseNotes.announce.description',
        )}
        onClose={() => {
          controller.dismiss();
        }}
        t={t}
      />
    </>
  );
}

function statusText(snapshot: ReleaseNotesSnapshot, t: BotHarnessTranslate): string {
  const version = snapshot.version;
  if (version === undefined) return t('release.status.loading');
  const update = snapshot.update;
  switch (update.status) {
    case 'development':
      return t('release.status.development', { version });
    case 'available':
      return t('release.status.available', { version, latest: update.latest });
    case 'current':
      return t('release.status.current', { version });
    case 'unavailable':
      return t('release.status.unavailable', { version });
    default:
      return t('release.status.checking', { version });
  }
}

export type ReleaseSettingsProps = PropsRuntime<'botharness.settings.item'> &
  PropsLocale<'botharness'> &
  InjectFace<{ releaseNotes: ReleaseNotesController }>;

export function ReleaseSettings({ releaseNotes, t }: ReleaseSettingsProps): ReactElement {
  const snapshot = useReleaseNotes(releaseNotes);
  const [copied, setCopied] = useState(false);
  const mount = useMountedResource<HTMLDivElement>(() => {
    void releaseNotes.start().then(() => releaseNotes.checkUpdate());
  }, [releaseNotes]);
  const update = snapshot.update;
  const command = update.status === 'available' ? releaseUpdateCommand(update.latest) : undefined;
  return (
    <div className="bh-release-settings" ref={mount} data-release-settings>
      <div className="bh-settings-row bh-release-row">
        <div className="bh-settings-row-text">
          <div className="bh-settings-row-title">{t('release.row.title')}</div>
          <div className="bh-settings-row-desc" role="status" aria-live="polite">
            {statusText(snapshot, t)}
          </div>
        </div>
        <div className="bh-release-actions">
          <a
            className="bh-settings-selector bh-release-site"
            href={t('releaseNotes.siteUrl')}
            target="_blank"
            rel="noreferrer"
          >
            {t('release.changelog')}
          </a>
          <Button
            size="sm"
            variant="outline"
            disabled={update.status === 'checking' || update.status === 'development'}
            onClick={() => {
              void releaseNotes.checkUpdate(true);
            }}
          >
            {t('release.check')}
          </Button>
        </div>
      </div>
      {update.status === 'available' && command !== undefined ? (
        <div className="bh-release-update" data-release-update={update.latest}>
          <div className="bh-release-update-head">
            <span className="bh-release-update-title">
              {t('release.update.title', { latest: update.latest })}
            </span>
            {update.releases.length > 0 ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  releaseNotes.view(update.releases);
                }}
              >
                {t('release.update.notes')}
              </Button>
            ) : null}
          </div>
          <div className="bh-settings-row-desc">{t('release.update.cli')}</div>
          <div className="bh-release-command">
            <code>{command}</code>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                void navigator.clipboard?.writeText(command).then(() => {
                  setCopied(true);
                });
              }}
            >
              {t(copied ? 'release.update.copied' : 'release.update.copy')}
            </Button>
          </div>
          <div className="bh-settings-row-desc">
            {t('release.update.desktop', { spec: `deepseekbot@${update.latest}` })}
          </div>
        </div>
      ) : null}
      <ReleaseNotesDialog
        releases={snapshot.viewing}
        title={t('release.update.dialog', {
          latest: update.status === 'available' ? update.latest : '',
        })}
        onClose={() => {
          releaseNotes.view(undefined);
        }}
        t={t}
      />
    </div>
  );
}
