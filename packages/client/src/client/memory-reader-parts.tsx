import type { ReactElement } from 'react';
import {
  IconBranchOutlineRegular,
  IconChevronDownOutlineRegular,
  IconChevronLeftOutlineRegular,
  IconRefreshOutlineRegular,
  Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives';
import type { BotHarnessTranslate } from './locale.js';
import { parseMemoryDiff } from './memory-diff-model.js';

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
  binary = false,
  binaryLabel,
  emptyLabel,
}: {
  path: string;
  status: string;
  badge?: string;
  diff: string;
  label: string;
  binary?: boolean;
  binaryLabel: string;
  emptyLabel: string;
}): ReactElement {
  const model = parseMemoryDiff(diff);
  return (
    <details className="bh-memory-diff-file" open>
      <summary className="bh-memory-diff-file-header">
        <IconChevronDownOutlineRegular size={16} />
        <span className="bh-memory-change-badge" data-status={status}>
          {badge ?? status}
        </span>
        <strong title={path}>{path}</strong>
      </summary>
      {binary || model.binary ? (
        <div className="bh-memory-diff-empty">{binaryLabel}</div>
      ) : model.lines.length === 0 ? (
        <div className="bh-memory-diff-empty">{emptyLabel}</div>
      ) : (
        <div className="bh-memory-diff-scroll">
          <table className="bh-memory-diff-table" aria-label={label}>
            <tbody>
              {model.lines.map((line, index) =>
                line.kind === 'hunk' || line.kind === 'note' ? (
                  <tr key={index} className={`bh-memory-diff-${line.kind}`}>
                    <td colSpan={4}>{line.text}</td>
                  </tr>
                ) : (
                  <tr key={index} className={`bh-memory-diff-${line.kind}`}>
                    <td className="bh-memory-diff-number">{line.oldLine ?? ''}</td>
                    <td className="bh-memory-diff-number">{line.newLine ?? ''}</td>
                    <td className="bh-memory-diff-sign" aria-hidden="true">
                      {line.kind === 'add' ? '+' : line.kind === 'remove' ? '-' : ''}
                    </td>
                    <td className="bh-memory-diff-content">{line.text || ' '}</td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      )}
    </details>
  );
}

/** Git emits one "diff --git" boundary per file, including binary changes. */
export function splitMemoryDiffFiles(diff: string): string[] {
  if (diff === '') return [];
  return diff.split(/(?=^diff --git )/m).filter(Boolean);
}
