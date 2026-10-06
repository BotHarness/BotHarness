import { useState, type KeyboardEvent, type ReactElement } from 'react';
import {
  FileTypeIcon,
  IconEllipsisOutlineRegular,
  Tag,
  Tooltip,
  IconChevronDownOutlineRegular,
  IconFolderCloseRegular,
  IconFolderOpenRegular,
} from '@deepseek-ai/dsh-client-ui-primitives';
import { useMemoryFileMenu, type MemoryFileCommands } from './memory-file-actions.js';
import type { MemoryStandingUsage } from './bridge.js';
import type { BotHarnessTranslate } from './locale.js';
import { memoryFileTree, type MemoryFileNode } from './memory-file-tree-model.js';

function withSelectedAncestors(
  open: ReadonlySet<string>,
  selectedPath: string | undefined,
): Set<string> {
  const next = new Set(open);
  const parts = selectedPath?.split('/') ?? [];
  for (let index = 1; index < parts.length; index += 1) {
    next.add(parts.slice(0, index).join('/'));
  }
  return next;
}

function StandingBadge({
  usage,
  t,
}: {
  usage: MemoryStandingUsage;
  t: BotHarnessTranslate;
}): ReactElement {
  const over = usage.chars > usage.limit;
  return (
    <span
      className={over ? 'bh-memory-standing bh-memory-standing-over' : 'bh-memory-standing'}
      title={t(usage.role === 'soul' ? 'standing.soulTitle' : 'standing.coreMemoryTitle')}
    >
      <Tag tone="neutral">{t('standing.badge')}</Tag>
      <span className="bh-memory-standing-usage">
        {t('standing.usage', {
          percent: Math.round((usage.chars / usage.limit) * 100),
          chars: usage.chars.toLocaleString('en-US'),
          limit: usage.limit.toLocaleString('en-US'),
        })}
      </span>
    </span>
  );
}

export function MemoryFileTree({
  paths,
  standing = [],
  actions,
  botSlug,
  selectedPath,
  onSelect,
  t,
}: {
  paths: readonly string[];
  standing?: readonly MemoryStandingUsage[];
  actions?: MemoryFileCommands;
  botSlug?: string | undefined;
  selectedPath: string | undefined;
  onSelect: ((path: string) => void) | undefined;
  t: BotHarnessTranslate;
}): ReactElement {
  const menu = useMemoryFileMenu(actions, botSlug, t);
  const [selection, setSelection] = useState<{
    path: string | undefined;
    open: ReadonlySet<string>;
  }>({ path: selectedPath, open: withSelectedAncestors(new Set(), selectedPath) });
  let openPaths = selection.open;
  if (selection.path !== selectedPath) {
    const next = withSelectedAncestors(openPaths, selectedPath);
    openPaths = next;
    setSelection({ path: selectedPath, open: next });
  }

  const toggle = (path: string): void => {
    setSelection((current) => {
      const next = new Set(current.open);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return { ...current, open: next };
    });
  };
  const onTreeKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (!['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    const target = event.target;
    if (!(target instanceof HTMLButtonElement)) return;
    const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="treeitem"]')];
    const index = items.indexOf(target);
    if (index < 0) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      items[index + (event.key === 'ArrowDown' ? 1 : -1)]?.focus();
      return;
    }
    const path = target.dataset['path'];
    if (path === undefined) return;
    if (event.key === 'ArrowRight' && target.dataset['folder'] === 'true') {
      event.preventDefault();
      if (!openPaths.has(path)) toggle(path);
      else items[index + 1]?.focus();
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      if (target.dataset['folder'] === 'true' && openPaths.has(path)) toggle(path);
      else {
        const parent = path.split('/').slice(0, -1).join('/');
        items.find((item) => item.dataset['path'] === parent)?.focus();
      }
    }
  };
  const more = (path: string): ReactElement | null =>
    actions === undefined || botSlug === undefined ? null : (
      <Tooltip label={t('fileAction.menu')} side="bottom" delayMs={500}>
        <button
          type="button"
          className="bh-memory-tree-more"
          aria-label={t('fileAction.menu') + ': ' + path}
          aria-haspopup="menu"
          aria-expanded={menu.openPath === path}
          onClick={(event) => menu.open(path, event)}
        >
          <IconEllipsisOutlineRegular size={16} />
        </button>
      </Tooltip>
    );
  const usageByPath = new Map(standing.map((usage) => [usage.path, usage]));
  const render = (nodes: readonly MemoryFileNode[]): ReactElement[] =>
    nodes.map((node) => {
      if (node.kind === 'file') {
        return (
          <div
            key={node.path}
            className="bh-memory-tree-item"
            onContextMenu={(event) => menu.open(node.path, event)}
            onKeyDown={(event) => menu.onKey(node.path, event)}
          >
            <button
              type="button"
              role="treeitem"
              data-path={node.path}
              className={
                selectedPath === node.path
                  ? 'bh-memory-tree-row bh-memory-row-selected'
                  : 'bh-memory-tree-row'
              }
              aria-selected={selectedPath === node.path}
              title={node.path}
              onClick={() => onSelect?.(node.path)}
            >
              <span className="bh-memory-tree-chevron-space" aria-hidden="true" />
              <FileTypeIcon path={node.path} size={16} />
              <span className="bh-memory-tree-name">{node.name}</span>
              {usageByPath.has(node.path) ? (
                <StandingBadge usage={usageByPath.get(node.path)!} t={t} />
              ) : null}
            </button>
            {more(node.path)}
          </div>
        );
      }
      const open = openPaths.has(node.path);
      return (
        <div key={node.path} className="bh-memory-tree-directory">
          <div
            className="bh-memory-tree-item"
            onContextMenu={(event) => menu.open(node.path, event)}
            onKeyDown={(event) => menu.onKey(node.path, event)}
          >
            <button
              type="button"
              role="treeitem"
              data-path={node.path}
              data-folder="true"
              className="bh-memory-tree-row"
              aria-expanded={open}
              title={node.path}
              onClick={() => toggle(node.path)}
            >
              <span className={open ? '' : 'bh-chevron-collapsed'} aria-hidden="true">
                <IconChevronDownOutlineRegular size={14} />
              </span>
              {open ? <IconFolderOpenRegular size={16} /> : <IconFolderCloseRegular size={16} />}
              <span className="bh-memory-tree-name">{node.name}</span>
            </button>
            {more(node.path)}
          </div>
          {open ? (
            <div role="group" className="bh-memory-tree-group">
              {render(node.children)}
            </div>
          ) : null}
        </div>
      );
    });

  return (
    <div
      className="bh-memory-file-tree"
      role="tree"
      aria-label={t('entry.memoryFiles')}
      onKeyDown={onTreeKeyDown}
    >
      {render(
        memoryFileTree(
          paths,
          standing.map((usage) => usage.path),
        ),
      )}
      {menu.menu}
      {menu.feedback}
    </div>
  );
}
