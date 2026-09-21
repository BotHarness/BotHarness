/**
 * The Computer's rows inside the BotHarness settings section. They own the
 * runtime-editable settings (`exportDir`, `idleStopMinutes`) through the
 * shared settings scope, use the Host's directory picker, and drive the
 * export/import endpoints with an explicit authorization step. Copy stays in
 * this bundle's own words; the section's row classes come from
 * `@botharness/client`, which is always mounted when this page renders.
 * @module @botharness/computer/settings-rows
 */

import { useCallback, useEffect, useState, type ReactElement } from 'react';

import {
  IconChevronDownOutline14,
  IconFolderOpenOutline16,
  Menu,
} from '@deepseek-ai/dsh-client-ui-primitives';
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';

import {
  COMPUTER_EXPORT_DIR_FIELD,
  COMPUTER_IDLE_STOP_FIELD,
  type ComputerSettings,
} from '../settings.js';
import type { ComputerTranslate } from './locale.js';

/** Sync state of the Host settings scope the rows consume. */
export interface ComputerSettingsSnapshot {
  exportDir: string;
  idleStopMinutes: number;
  status: 'loading' | 'ready' | 'unavailable';
  writable: boolean;
}

/** The slice of the settings scope these rows read and write. */
export interface ComputerSettingsScope {
  getSnapshot(): {
    status: 'loading' | 'ready' | 'unavailable';
    value: ComputerSettings | undefined;
    writable: boolean;
  };
  subscribe(listener: () => void): () => void;
  set(field: string, value: unknown): Promise<void>;
}

/** Live Computer settings published to the rows. */
export class ComputerSettingsPrefs {
  private snapshot: ComputerSettingsSnapshot = {
    exportDir: '',
    idleStopMinutes: 30,
    status: 'loading',
    writable: false,
  };

  private readonly listeners = new Set<() => void>();

  private scope: ComputerSettingsScope | undefined;

  private detach: (() => void) | undefined;

  attach(scope: ComputerSettingsScope): () => void {
    this.detach?.();
    this.scope = scope;
    this.detach = scope.subscribe(() => {
      this.sync();
    });
    this.sync();
    return () => {
      this.detach?.();
      this.detach = undefined;
      this.scope = undefined;
    };
  }

  getSnapshot = (): ComputerSettingsSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  setExportDir(exportDir: string): void {
    this.publish({ exportDir });
    void this.scope?.set(COMPUTER_EXPORT_DIR_FIELD, exportDir).catch(() => undefined);
  }

  setIdleStopMinutes(idleStopMinutes: number): void {
    this.publish({ idleStopMinutes });
    void this.scope?.set(COMPUTER_IDLE_STOP_FIELD, idleStopMinutes).catch(() => undefined);
  }

  private publish(patch: Partial<ComputerSettingsSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener();
  }

  private sync(): void {
    const scope = this.scope;
    if (scope === undefined) return;
    const next = scope.getSnapshot();
    const value = next.value;
    this.snapshot = {
      exportDir: value?.exportDir ?? '',
      idleStopMinutes: value?.idleStopMinutes ?? 30,
      status: next.status,
      writable: next.writable,
    };
    for (const listener of this.listeners) listener();
  }
}

/** Face injected into the rows by the registration. */
export interface ComputerSettingsFace {
  prefs: ComputerSettingsPrefs;
  /** Whether a directory picker is available in this deployment. */
  pickerAvailable: boolean;
  /** Open the Host's directory picker; `null` when cancelled. */
  pickDirectory: () => Promise<string | null>;
  /** Open a directory with the Host's file manager. */
  openDirectory: (dir: string) => Promise<void>;
  /** Archive the Computer's store; `dir` overrides the configured directory. */
  exportArchive: (dir?: string) => Promise<string>;
  /** Restore an archive from the configured directory. */
  importArchive: (file: string) => Promise<void>;
  /** List the archives the configured directory holds. */
  listArchives: () => Promise<string[]>;
  /** Effective export directory reported by the Host, for the no-scope case. */
  hostExportDir: () => Promise<string>;
}

const IDLE_OPTIONS = [15, 30, 60, 120, 240] as const;

const EXPORT_ENDPOINT = '/api/computer/export';
const IMPORT_ENDPOINT = '/api/computer/import';
const EXPORTS_ENDPOINT = '/api/computer/exports';
const STATUS_ENDPOINT = '/api/computer/status';
const OPEN_DIR_ENDPOINT = '/api/computer/open-dir';

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: 'same-origin', ...init });
  if (!response.ok) throw new Error(`${String(response.status)} ${await response.text()}`);
  return (await response.json()) as T;
}

async function postAuthorized(url: string, body: Record<string, unknown> = {}): Promise<void> {
  await requestJson(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ authorize: true, ...body }),
  });
}

/**
 * Build the rows' inject face: the settings prefs plus the picker and the
 * export/import endpoints.
 */
export function createComputerSettingsFace(options: {
  prefs: ComputerSettingsPrefs;
  pickDirectory?: (() => Promise<string | null>) | undefined;
}): ComputerSettingsFace {
  const { prefs } = options;
  return {
    prefs,
    pickerAvailable: options.pickDirectory !== undefined,
    pickDirectory: async () =>
      options.pickDirectory === undefined ? null : options.pickDirectory(),
    openDirectory: async (dir) => {
      await postAuthorized(OPEN_DIR_ENDPOINT, dir === '' ? {} : { dir });
    },
    exportArchive: async (dir) => {
      const payload = await requestJson<{ archive?: string }>(EXPORT_ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(
          dir === undefined || dir === '' ? { authorize: true } : { authorize: true, dir },
        ),
      });
      return payload.archive ?? '';
    },
    importArchive: async (file) => {
      await postAuthorized(IMPORT_ENDPOINT, { file });
    },
    listArchives: async () => {
      const payload = await requestJson<{ files?: string[] }>(EXPORTS_ENDPOINT);
      return payload.files ?? [];
    },
    hostExportDir: async () => {
      const payload = await requestJson<{ exportDir?: string }>(STATUS_ENDPOINT);
      return payload.exportDir ?? '';
    },
  };
}

function Row({
  title,
  description,
  children,
}: {
  readonly title: string;
  readonly description: string;
  readonly children?: ReactElement | undefined;
}): ReactElement {
  return (
    <div className="bh-settings-row">
      <div className="bh-settings-row-text">
        <div className="bh-settings-row-title">{title}</div>
        <div className="bh-settings-row-desc">{description}</div>
      </div>
      {children}
    </div>
  );
}

function Selector({
  label,
  open,
  onToggle,
  disabled,
}: {
  readonly label: string;
  readonly open: boolean;
  readonly onToggle: () => void;
  readonly disabled?: boolean | undefined;
}): ReactElement {
  return (
    <button
      type="button"
      className="bh-settings-selector"
      aria-haspopup="menu"
      aria-expanded={open}
      disabled={disabled === true}
      onClick={onToggle}
    >
      {label}
      <IconChevronDownOutline14 className="bh-settings-chevron" />
    </button>
  );
}

/** The Computer group inside the BotHarness settings page. */
export function ComputerSettingsRows({
  t,
  prefs,
  pickerAvailable,
  pickDirectory,
  openDirectory,
  exportArchive,
  importArchive,
  listArchives,
  hostExportDir,
}: PropsRuntime<'botharness.settings.item'> &
  PropsLocale<'botharness-computer'> &
  InjectFace<ComputerSettingsFace>): ReactElement {
  const [snapshot, setSnapshot] = useState(prefs.getSnapshot);
  const [idleOpen, setIdleOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [archives, setArchives] = useState<readonly string[] | undefined>(undefined);
  const [busy, setBusy] = useState<'export' | 'import' | undefined>(undefined);
  const [confirming, setConfirming] = useState<'export' | 'import' | undefined>(undefined);
  const [exportTarget, setExportTarget] = useState<string | undefined>(undefined);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualPath, setManualPath] = useState('');
  const [note, setNote] = useState<string | undefined>(undefined);
  const [hostDir, setHostDir] = useState<string | undefined>(undefined);

  useEffect(() => prefs.subscribe(() => setSnapshot(prefs.getSnapshot())), [prefs]);

  useEffect(() => {
    if (snapshot.status !== 'unavailable') return;
    void hostExportDir()
      .then((dir) => setHostDir(dir))
      .catch(() => undefined);
  }, [hostExportDir, snapshot.status]);

  const exportDir = snapshot.status === 'unavailable' ? (hostDir ?? '') : snapshot.exportDir;
  const hasDir = exportDir !== '';
  const writable = snapshot.status === 'ready' && snapshot.writable;

  const pickDirectoryInto = useCallback(
    (apply: (dir: string) => void) => {
      void pickDirectory()
        .then((dir) => {
          if (dir !== null) apply(dir);
        })
        .catch(() => {
          setManualOpen(true);
          setNote(t('rows.pickerFailed'));
        });
    },
    [pickDirectory, t],
  );

  const pickExportDir = useCallback(() => {
    pickDirectoryInto((dir) => {
      setManualPath(dir);
      prefs.setExportDir(dir);
      setNote(undefined);
    });
  }, [pickDirectoryInto, prefs]);

  const startExport = useCallback(() => {
    if (!pickerAvailable) {
      setConfirming('export');
      return;
    }
    pickDirectory()
      .then((dir) => {
        if (dir === null) return;
        setExportTarget(dir);
        setConfirming('export');
      })
      .catch(() => {
        setExportTarget(undefined);
        setConfirming('export');
      });
  }, [pickDirectory, pickerAvailable]);

  const runExport = useCallback(() => {
    setConfirming(undefined);
    setBusy('export');
    setNote(undefined);
    void exportArchive(exportTarget)
      .then((archive) =>
        setNote(archive === '' ? t('rows.exportedDone') : t('rows.exported', { archive })),
      )
      .catch((error: unknown) => setNote(String(error)))
      .finally(() => setBusy(undefined));
  }, [exportArchive, exportTarget, t]);

  const runImport = useCallback(
    (file: string) => {
      setImportOpen(false);
      setConfirming(undefined);
      setBusy('import');
      setNote(undefined);
      void importArchive(file)
        .then(() => setNote(t('rows.imported', { file })))
        .catch((error: unknown) => setNote(String(error)))
        .finally(() => setBusy(undefined));
    },
    [importArchive, t],
  );

  const openImport = useCallback(() => {
    void listArchives()
      .then((files) => {
        setArchives(files);
        setImportOpen(true);
        if (files.length === 0) setNote(t('rows.noArchives'));
      })
      .catch((error: unknown) => setNote(String(error)));
  }, [listArchives, t]);

  const openDir = useCallback(() => {
    void openDirectory(exportDir).catch((error: unknown) => setNote(String(error)));
  }, [exportDir, openDirectory]);

  return (
    <div className="bh-settings-rows">
      <Row
        title={t('rows.exportDir.title')}
        description={
          hasDir ? t('rows.exportDir.current', { dir: exportDir }) : t('rows.exportDir.empty')
        }
      >
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {pickerAvailable ? (
            <button
              type="button"
              className="bh-settings-selector"
              disabled={!writable}
              onClick={pickExportDir}
            >
              <IconFolderOpenOutline16 size={14} />
              {t('rows.exportDir.pick')}
            </button>
          ) : null}
          <button
            type="button"
            className="bh-settings-selector"
            disabled={!hasDir}
            onClick={openDir}
          >
            {t('rows.exportDir.open')}
          </button>
          <button
            type="button"
            className="bh-settings-selector"
            disabled={!writable}
            onClick={() => {
              setManualOpen((value) => !value);
              setManualPath(exportDir);
            }}
          >
            {t('rows.exportDir.manual')}
          </button>
        </div>
      </Row>

      {manualOpen ? (
        <div className="bh-settings-row">
          <div className="bh-settings-row-text">
            <input
              className="bh-settings-input"
              value={manualPath}
              placeholder="/absolute/path"
              aria-label={t('rows.exportDir.manual')}
              onChange={(event) => {
                setManualPath(event.target.value);
              }}
            />
          </div>
          <button
            type="button"
            className="bh-settings-selector"
            disabled={!writable || manualPath.trim() === ''}
            onClick={() => {
              prefs.setExportDir(manualPath.trim());
              setManualOpen(false);
              setNote(undefined);
            }}
          >
            {t('rows.exportDir.save')}
          </button>
        </div>
      ) : null}

      <Row title={t('rows.idle.title')} description={t('rows.idle.description')}>
        <Menu
          open={idleOpen}
          portal
          align="end"
          items={IDLE_OPTIONS.map((minutes) => ({
            id: String(minutes),
            label: t('rows.idle.minutes', { minutes }),
          }))}
          selectedId={String(snapshot.idleStopMinutes)}
          onSelect={(id) => {
            setIdleOpen(false);
            prefs.setIdleStopMinutes(Number(id));
          }}
          onClose={() => {
            setIdleOpen(false);
          }}
          anchor={
            <Selector
              label={t('rows.idle.minutes', { minutes: snapshot.idleStopMinutes })}
              open={idleOpen}
              disabled={!writable}
              onToggle={() => {
                setIdleOpen((value) => !value);
              }}
            />
          }
        />
      </Row>

      <Row title={t('rows.transfer.title')} description={t('rows.transfer.description')}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {confirming === 'export' ? (
            <>
              <button
                type="button"
                className="bh-settings-selector"
                onClick={() => {
                  setConfirming(undefined);
                }}
              >
                {t('entry.cancel')}
              </button>
              <button type="button" className="bh-settings-selector" onClick={runExport}>
                {t('rows.authorizeExport')}
              </button>
            </>
          ) : (
            <button
              type="button"
              className="bh-settings-selector"
              disabled={!hasDir || busy !== undefined}
              onClick={startExport}
            >
              {busy === 'export'
                ? t('rows.exporting')
                : pickerAvailable
                  ? t('rows.exportTo')
                  : t('rows.export')}
            </button>
          )}
          {confirming === 'import' ? (
            <button
              type="button"
              className="bh-settings-selector"
              onClick={() => {
                setConfirming(undefined);
              }}
            >
              {t('rows.cancelImport')}
            </button>
          ) : (
            <Menu
              open={importOpen}
              portal
              align="end"
              items={(archives ?? []).map((file) => ({ id: file, label: file }))}
              onSelect={(id) => {
                setConfirming('import');
                setArchives([id]);
              }}
              onClose={() => {
                setImportOpen(false);
              }}
              anchor={
                <Selector
                  label={busy === 'import' ? t('rows.importing') : t('rows.import')}
                  open={importOpen}
                  disabled={!hasDir || busy !== undefined}
                  onToggle={openImport}
                />
              }
            />
          )}
          {confirming === 'import' && archives?.[0] !== undefined ? (
            <button
              type="button"
              className="bh-settings-selector"
              onClick={() => {
                const file = archives[0];
                if (file !== undefined) runImport(file);
              }}
            >
              {t('rows.authorizeImport', { file: archives[0] })}
            </button>
          ) : null}
        </div>
      </Row>

      {snapshot.status === 'unavailable' ? (
        <div className="bh-note">{t('rows.noSettings')}</div>
      ) : null}
      {note === undefined ? null : <div className="bh-note">{note}</div>}
    </div>
  );
}
