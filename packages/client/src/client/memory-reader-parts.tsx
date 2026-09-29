import type { ReactElement } from 'react';
import {
  IconBranchOutlineRegular,
  IconChevronDownOutlineRegular,
  IconChevronLeftOutlineRegular,
  IconRefreshOutlineRegular,
  Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives';
import type { BotHarnessTranslate } from './locale.js';

export function MemoryViewIconButton({
  action,
  onClick,
  t,
}: {
  action: 'backToChat' | 'refresh';
  onClick: () => void;
  t: BotHarnessTranslate;
}): ReactElement {
  const label = t(`memory.${action}`);
  return (
    <Tooltip label={label} side="bottom" delayMs={500}>
      <button
        type="button"
        className="bh-memory-view-icon-button"
        aria-label={label}
        onClick={onClick}
      >
        {action === 'backToChat' ? (
          <IconChevronLeftOutlineRegular size={16} />
        ) : (
          <IconRefreshOutlineRegular size={16} />
        )}
      </button>
    </Tooltip>
  );
}

export function MemoryBranchIcon(): ReactElement {
  return <IconBranchOutlineRegular size={16} />;
}

export function MemoryDiffFile({
  path,
  status,
  badge,
  diff,
  label,
}: {
  path: string;
  status: string;
  badge?: string;
  diff: string;
  label: string;
}): ReactElement {
  return (
    <details className="bh-memory-diff-file" open>
      <summary className="bh-memory-diff-file-header">
        <IconChevronDownOutlineRegular size={16} />
        <span className="bh-memory-change-badge" data-status={status}>
          {badge ?? status}
        </span>
        <strong title={path}>{path}</strong>
      </summary>
      <div className="bh-memory-commit-code" aria-label={label}>
        {diff.split('\n').map((line, index) => (
          <div
            key={index}
            className={
              line.startsWith('+') && !line.startsWith('+++')
                ? 'bh-memory-diff-add'
                : line.startsWith('-') && !line.startsWith('---')
                  ? 'bh-memory-diff-remove'
                  : line.startsWith('diff --git') || line.startsWith('@@')
                    ? 'bh-memory-diff-header'
                    : ''
            }
          >
            {line || ' '}
          </div>
        ))}
      </div>
    </details>
  );
}

/** Git emits one "diff --git" boundary per file, including binary changes. */
export function splitMemoryDiffFiles(diff: string): string[] {
  if (diff === '') return [];
  return diff.split(/(?=^diff --git )/m).filter(Boolean);
}
