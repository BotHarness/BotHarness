import type { ReactElement } from 'react';
import { PersonaBotAvatar } from './avatar.js';
import { GitCommitIcon } from './git-commit-icon.js';
import type { BotHarnessTranslate } from './locale.js';
import type { BotSummary, ChannelMessage } from './store.js';

type MemoryCommit = NonNullable<ChannelMessage['memoryCommit']>;

function fileSummary(commit: MemoryCommit, t: BotHarnessTranslate): string | undefined {
  const changed = (file: MemoryCommit['files'][number]): number =>
    (file.added ?? 0) + (file.deleted ?? 0);
  const main = commit.files.reduce<MemoryCommit['files'][number] | undefined>(
    (best, file) => (best === undefined || changed(file) > changed(best) ? file : best),
    undefined,
  );
  if (main === undefined) return undefined;
  const counts = [
    main.added === null || main.added === 0 ? undefined : `+${main.added}`,
    main.deleted === null || main.deleted === 0 ? undefined : `−${main.deleted}`,
  ]
    .filter((part) => part !== undefined)
    .join(' ');
  const more = commit.files.length - 1 + commit.moreFiles;
  return [
    counts.length === 0 ? main.path : `${main.path} ${counts}`,
    more > 0 ? t('memoryCommit.moreFiles', { count: more }) : undefined,
  ]
    .filter((part) => part !== undefined)
    .join(' · ');
}

export function MemoryCommitLine({
  messageId,
  commit,
  bots,
  t,
  onOpen,
}: {
  messageId: string;
  commit: MemoryCommit;
  bots: readonly BotSummary[];
  t: BotHarnessTranslate;
  onOpen(): void;
}): ReactElement {
  const bot = bots.find((candidate) => candidate.slug === commit.botSlug);
  const name = bot?.displayName ?? commit.botSlug;
  const files = fileSummary(commit, t);
  return (
    <button
      type="button"
      className="bh-memory-commit-line"
      data-message-id={messageId}
      title={t('memoryCommit.author', { name: commit.authorName, sha: commit.sha })}
      onClick={onOpen}
    >
      <GitCommitIcon size={14} />
      <span className="bh-bot-dm-action-bot">
        <span className="bh-bot-dm-action-avatar" aria-hidden="true">
          <PersonaBotAvatar
            t={t}
            personaBotId={commit.botSlug}
            name={name}
            src={bot?.avatar}
            appearance={bot?.appearance}
            avatarSeed={bot?.avatarSeed}
            size={16}
            indicator={false}
            still
          />
        </span>
        <span className="bh-bot-dm-action-name">{name}</span>
      </span>
      <span>{t('memoryCommit.updated')}</span>
      <span className="bh-memory-commit-subject">{commit.subject}</span>
      <code className="bh-memory-commit-sha">{commit.sha.slice(0, 7)}</code>
      {files === undefined ? null : <span className="bh-memory-commit-files">{files}</span>}
    </button>
  );
}
