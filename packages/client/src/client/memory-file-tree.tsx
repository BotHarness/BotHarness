import { useEffect, useState, type KeyboardEvent, type ReactElement } from 'react';
import {
  FileTypeIcon,
  IconChevronDownOutlineRegular,
  IconFolderCloseRegular,
  IconFolderOpenRegular,
} from '@deepseek-ai/dsh-client-ui-primitives';
import type { BotHarnessTranslate } from './locale.js';
import { memoryFileTree, type MemoryFileNode } from './memory-file-tree-model.js';

export function MemoryFileTree({
  paths,
  selectedPath,
  onSelect,
  t,
}: {
  paths: readonly string[];
  selectedPath: string | undefined;
  onSelect: ((path: string) => void) | undefined;
  t: BotHarnessTranslate;
}): ReactElement {
  const [openPaths, setOpenPaths] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => {
    if (selectedPath === undefined) return;
    const parts = selectedPath.split('/');
    setOpenPaths((current) => {
      const next = new Set(current);
      for (let index = 1; index < parts.length; index += 1) {
        next.add(parts.slice(0, index).join('/'));
      }
      return next.size === current.size ? current : next;
    });
  }, [selectedPath]);

  const toggle = (path: string): void => {
    setOpenPaths((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };
  const onTreeKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (!['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    const target = event.target;
    if (!(target instanceof HTMLButtonElement)) return;
    const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="treeitem"]')];
    const index = items.indexOf(target);
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
  const render = (nodes: readonly MemoryFileNode[]): ReactElement[] =>
    nodes.map((node) => {
      if (node.kind === 'file') {
        return (
          <button
            key={node.path}
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
          </button>
        );
      }
      const open = openPaths.has(node.path);
      return (
        <div key={node.path} className="bh-memory-tree-directory">
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
      {render(memoryFileTree(paths))}
    </div>
  );
}
