import { useMemo, useRef, useState, type ReactElement } from 'react';
import {
  Button,
  IconChevronDownOutlineRegular,
  IconChevronRightOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives';

import type { BridgeActions } from './actions.js';
import { BridgeCallError, type BotZipFileListing } from './bridge.js';
import type { BotHarnessTranslate } from './locale.js';
import { Modal } from './modal.js';
import { useMountedResource } from './mounted-resource.js';
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
            {t('botZip.import.failed', { error: botZipError(cause, t) })}
          </div>
        )}
      </div>
    </Modal>
  );
}

interface BotZipFolder {
  kind: 'folder';
  name: string;
  path: string;
  children: BotZipNode[];
  files: string[];
  size: number;
}

interface BotZipFile {
  kind: 'file';
  name: string;
  path: string;
  size: number;
}

type BotZipNode = BotZipFolder | BotZipFile;

export function botZipTree(files: BotZipFileListing['files']): BotZipNode[] {
  const root: BotZipFolder = {
    kind: 'folder',
    name: '',
    path: '',
    children: [],
    files: [],
    size: 0,
  };
  for (const file of files) {
    const parts = file.path.split('/');
    let folder = root;
    folder.files.push(file.path);
    folder.size += file.size;
    for (const [index, name] of parts.slice(0, -1).entries()) {
      const path = parts.slice(0, index + 1).join('/');
      let next = folder.children.find(
        (child): child is BotZipFolder => child.kind === 'folder' && child.path === path,
      );
      if (next === undefined) {
        next = { kind: 'folder', name, path, children: [], files: [], size: 0 };
        folder.children.push(next);
      }
      next.files.push(file.path);
      next.size += file.size;
      folder = next;
    }
    folder.children.push({ kind: 'file', name: parts.at(-1)!, path: file.path, size: file.size });
  }
  const sort = (nodes: BotZipNode[]): BotZipNode[] =>
    nodes
      .map((node) => (node.kind === 'folder' ? { ...node, children: sort(node.children) } : node))
      .sort((left, right) =>
        left.kind === right.kind
          ? left.name.localeCompare(right.name)
          : left.kind === 'folder'
            ? -1
            : 1,
      );
  return sort(root.children);
}

export function formatBotZipSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function BotZipTreeRows({
  nodes,
  depth,
  always,
  selected,
  expanded,
  onSelect,
  onExpand,
  t,
}: {
  nodes: BotZipNode[];
  depth: number;
  always: ReadonlySet<string>;
  selected: ReadonlySet<string>;
  expanded: ReadonlySet<string>;
  onSelect: (paths: readonly string[], include: boolean) => void;
  onExpand: (path: string) => void;
  t: BotHarnessTranslate;
}): ReactElement {
  return (
    <>
      {nodes.map((node) => {
        const indent = { paddingInlineStart: `${depth * 18}px` };
        if (node.kind === 'file') {
          const fixed = always.has(node.path);
          return (
            <li key={node.path} className="bh-bot-zip-tree-row" role="treeitem" style={indent}>
              <span className="bh-bot-zip-tree-toggle" aria-hidden="true" />
              <label className="bh-bot-zip-tree-label">
                <input
                  type="checkbox"
                  checked={fixed || selected.has(node.path)}
                  disabled={fixed}
                  onChange={(event) => onSelect([node.path], event.currentTarget.checked)}
                />
                <span className="bh-bot-zip-tree-name">{node.name}</span>
              </label>
              {fixed ? (
                <span className="bh-bot-zip-tree-always">{t('botZip.export.always')}</span>
              ) : null}
              <span className="bh-bot-zip-tree-size">{formatBotZipSize(node.size)}</span>
            </li>
          );
        }
        const choosable = node.files.filter((path) => !always.has(path));
        const chosen = choosable.filter((path) => selected.has(path)).length;
        const open = expanded.has(node.path);
        return (
          <li key={node.path} role="treeitem" aria-expanded={open}>
            <div className="bh-bot-zip-tree-row" style={indent}>
              <button
                type="button"
                className="bh-bot-zip-tree-toggle"
                aria-label={t(open ? 'botZip.export.collapse' : 'botZip.export.expand', {
                  name: node.name,
                })}
                onClick={() => onExpand(node.path)}
              >
                {open ? (
                  <IconChevronDownOutlineRegular size={14} />
                ) : (
                  <IconChevronRightOutlineRegular size={14} />
                )}
              </button>
              <label className="bh-bot-zip-tree-label">
                <input
                  type="checkbox"
                  checked={choosable.length === 0 || chosen === choosable.length}
                  disabled={choosable.length === 0}
                  ref={(input) => {
                    if (input !== null)
                      input.indeterminate = chosen > 0 && chosen < choosable.length;
                  }}
                  onChange={() => onSelect(choosable, chosen < choosable.length)}
                />
                <span className="bh-bot-zip-tree-name">{node.name}/</span>
              </label>
              <span className="bh-bot-zip-tree-size">{formatBotZipSize(node.size)}</span>
            </div>
            {open ? (
              <ul role="group" className="bh-bot-zip-tree-group">
                <BotZipTreeRows
                  nodes={node.children}
                  depth={depth + 1}
                  always={always}
                  selected={selected}
                  expanded={expanded}
                  onSelect={onSelect}
                  onExpand={onExpand}
                  t={t}
                />
              </ul>
            ) : null}
          </li>
        );
      })}
    </>
  );
}

function BotZipFilePicker({
  listing,
  selected,
  onChange,
  t,
}: {
  listing: BotZipFileListing;
  selected: ReadonlySet<string>;
  onChange: (selected: ReadonlySet<string>) => void;
  t: BotHarnessTranslate;
}): ReactElement {
  const tree = useMemo(() => botZipTree(listing.files), [listing]);
  const always = useMemo(() => new Set(listing.always), [listing]);
  const choosable = useMemo(
    () => listing.files.map((file) => file.path).filter((path) => !always.has(path)),
    [listing, always],
  );
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());

  const select = (paths: readonly string[], include: boolean): void => {
    const next = new Set(selected);
    for (const path of paths) {
      if (include) next.add(path);
      else next.delete(path);
    }
    onChange(next);
  };

  return (
    <div className="bh-bot-zip-picker">
      <div className="bh-bot-zip-picker-head">
        <div className="bh-bot-zip-picker-title">
          <strong>{t('botZip.export.files')}</strong>
          <span className="bh-bot-zip-picker-count">
            {t('botZip.export.selected', {
              count: selected.size + always.size,
              total: listing.files.length,
            })}
          </span>
        </div>
        <Button size="sm" variant="ghost" onClick={() => onChange(new Set(choosable))}>
          {t('botZip.export.selectAll')}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => onChange(new Set())}>
          {t('botZip.export.selectNone')}
        </Button>
      </div>
      <ul className="bh-bot-zip-tree" role="tree" aria-label={t('botZip.export.files')}>
        <BotZipTreeRows
          nodes={tree}
          depth={0}
          always={always}
          selected={selected}
          expanded={expanded}
          onSelect={select}
          onExpand={(path) =>
            setExpanded((current) => {
              const next = new Set(current);
              if (next.has(path)) next.delete(path);
              else next.add(path);
              return next;
            })
          }
          t={t}
        />
      </ul>
    </div>
  );
}

interface BotZipExportLoad {
  request: number;
  listing?: BotZipFileListing;
  error?: unknown;
}

function BotZipExportModal({
  bot,
  actions,
  load,
  selected,
  onSelect,
  t,
  onClose,
}: {
  bot: BotSummary;
  actions: Pick<BridgeActions, 'botZipFiles' | 'exportBotZip'>;
  load: BotZipExportLoad;
  selected: ReadonlySet<string>;
  onSelect: (selected: ReadonlySet<string>) => void;
  t: BotHarnessTranslate;
  onClose: () => void;
}): ReactElement {
  const { listing, error: loadError } = load;
  const [exporting, setExporting] = useState(false);
  const [cause, setCause] = useState<unknown>();
  const [history, setHistory] = useState(false);

  const choosable = listing === undefined ? 0 : listing.files.length - new Set(listing.always).size;
  const ready = listing !== undefined && (choosable === 0 || selected.size > 0);
  const whole = listing !== undefined && selected.size === choosable;
  const choice = whole ? (history ? { history: true } : {}) : { include: [...selected].sort() };

  const submit = (): void => {
    if (exporting || !ready) return;
    setExporting(true);
    setCause(undefined);
    void actions.exportBotZip(bot.slug, bot.displayName, choice).then(
      () => {
        setExporting(false);
        onClose();
      },
      (rejection: unknown) => {
        setExporting(false);
        setCause(rejection);
      },
    );
  };

  return (
    <Modal
      open
      onClose={() => {
        if (!exporting) onClose();
      }}
      closeLabel={t('common.close')}
      title={t('botZip.export.confirmTitle', { name: bot.displayName })}
      description={t('botZip.export.confirmBody')}
      footer={
        <>
          <Button variant="outline" disabled={exporting} onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" disabled={exporting || !ready} onClick={submit}>
            {exporting ? t('botZip.export.exporting') : t('botZip.export.submit')}
          </Button>
        </>
      }
    >
      <div className="bh-personabot-form">
        {listing !== undefined ? (
          <BotZipFilePicker listing={listing} selected={selected} onChange={onSelect} t={t} />
        ) : loadError !== undefined ? (
          <div className="bh-modal-error" role="alert">
            {t('botZip.export.loadFailed', { error: botZipError(loadError, t) })}
          </div>
        ) : (
          <div className="bh-bot-zip-picker-loading" role="status">
            {t('botZip.export.loading')}
          </div>
        )}
        {listing === undefined ? null : (
          <label className="bh-bot-zip-history" data-disabled={!whole || undefined}>
            <input
              type="checkbox"
              checked={whole && history}
              disabled={!whole || exporting}
              onChange={(event) => setHistory(event.currentTarget.checked)}
            />
            <span className="bh-bot-zip-history-text">
              <strong>{t('botZip.export.history')}</strong>
              <span>
                {whole ? t('botZip.export.historyHint') : t('botZip.export.historyPartial')}
              </span>
            </span>
          </label>
        )}
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
  );
}

export function useBotZipExport(
  bot: BotSummary,
  actions: Pick<BridgeActions, 'botZipFiles' | 'exportBotZip'>,
  t: BotHarnessTranslate,
  onClosed?: () => void,
): { open(): void; dialog: ReactElement | null } {
  const requests = useRef(0);
  const [load, setLoad] = useState<BotZipExportLoad>();
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());

  const open = (): void => {
    const request = ++requests.current;
    setLoad({ request });
    setSelected(new Set());
    void actions.botZipFiles(bot.slug).then(
      (listing) => {
        if (requests.current !== request) return;
        const always = new Set(listing.always);
        setLoad({ request, listing });
        setSelected(
          new Set(listing.files.map((file) => file.path).filter((path) => !always.has(path))),
        );
      },
      (error: unknown) => {
        if (requests.current === request) setLoad({ request, error });
      },
    );
  };

  const close = (): void => {
    requests.current += 1;
    setLoad(undefined);
    onClosed?.();
  };

  return {
    open,
    dialog:
      load === undefined ? null : (
        <BotZipExportModal
          key={load.request}
          bot={bot}
          actions={actions}
          load={load}
          selected={selected}
          onSelect={setSelected}
          t={t}
          onClose={close}
        />
      ),
  };
}

export function BotZipShareButton({
  bot,
  actions,
  t,
}: {
  bot: BotSummary;
  actions: Pick<BridgeActions, 'botZipFiles' | 'exportBotZip'>;
  t: BotHarnessTranslate;
}): ReactElement {
  const share = useBotZipExport(bot, actions, t);
  return (
    <>
      <Button size="sm" variant="outline" onClick={share.open}>
        {t('profile.share')}
      </Button>
      {share.dialog}
    </>
  );
}

export function BotZipShareDialog({
  bot,
  actions,
  t,
  onClose,
}: {
  bot: BotSummary;
  actions: Pick<BridgeActions, 'botZipFiles' | 'exportBotZip'>;
  t: BotHarnessTranslate;
  onClose(): void;
}): ReactElement {
  const share = useBotZipExport(bot, actions, t, onClose);
  const mount = useMountedResource<HTMLSpanElement>(() => {
    share.open();
  }, [bot.slug]);
  return (
    <>
      <span ref={mount} hidden />
      {share.dialog}
    </>
  );
}
