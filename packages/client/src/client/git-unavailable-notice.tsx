import type { ReactElement } from 'react';

import { Button } from '@deepseek-ai/dsh-client-ui-primitives';

import type { GitAvailability } from './bridge.js';
import type { BotHarnessTranslate } from './locale.js';

export function gitReady(git: GitAvailability | undefined): boolean {
  return git?.available !== false;
}

function reasonText(
  git: Extract<GitAvailability, { available: false }>,
  t: BotHarnessTranslate,
): string {
  if (git.reason === 'too-old') {
    return t('git.unavailable.tooOld', { version: git.version ?? '?' });
  }
  if (git.reason === 'unrunnable') return t('git.unavailable.unrunnable');
  return t('git.unavailable.missing');
}

export function GitUnavailableNotice({
  git,
  onRecheck,
  t,
}: {
  git: GitAvailability | undefined;
  onRecheck: () => void;
  t: BotHarnessTranslate;
}): ReactElement | null {
  if (git === undefined || git.available) return null;
  return (
    <div className="bh-git-unavailable" role="status" data-git-unavailable={git.reason}>
      <strong className="bh-git-unavailable-title">{t('git.unavailable.title')}</strong>
      <span>{reasonText(git, t)}</span>
      <span>{t('git.unavailable.hint')}</span>
      <span className="bh-git-unavailable-actions">
        <a href={t('git.unavailable.guideUrl')} target="_blank" rel="noopener noreferrer">
          {t('git.unavailable.guide')}
        </a>
        <Button variant="outline" size="sm" onClick={onRecheck} data-git-recheck>
          {t('git.unavailable.recheck')}
        </Button>
      </span>
    </div>
  );
}
