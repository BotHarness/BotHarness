/**
 * The Computer's rows inside the BotHarness settings section. They own the
 * runtime-editable settings (`exportDir`, `idleStopMinutes`) through the
 * shared settings scope, use the Host's directory picker, and drive the
 * export/import endpoints with an explicit authorization step. Copy stays in
 * this bundle's own words; the section's row classes come from
 * `@botharness/client`, which is always mounted when this page renders.
 * @module @botharness/computer/settings-rows
 */

import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';

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
import { PHASE_LABEL, type ComputerTranslate } from './locale.js';

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

/** Thrown when the Host rolls the export directory back instead of storing it. */
export class ExportDirRejectedError extends Error {
  constructor() {
    super('the Host did not accept the export directory');
    this.name = 'ExportDirRejectedError';
  }
}

/**
 * Directory shown on the export row: a configured scope value wins; while the
 * scope is empty (the unconfigured default) fall back to the Host-resolved
 * path from the status route, so buttons and "Current" track what export and
 * open-dir will actually use.
 */
export function displayExportDir(configured: string, hostDir: string | undefined): string {
  return configured !== '' ? configured : (hostDir ?? '');
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

  async setExportDir(exportDir: string): Promise<void> {
    if (this.scope === undefined) throw new ExportDirRejectedError();
    this.publish({ exportDir });
    await this.scope.set(COMPUTER_EXPORT_DIR_FIELD, exportDir);
    // The DSH scope resolves even when the Host refuses the write (it recovers
    // silently), so a snapshot that rolled back is the only refusal signal.
    if (this.snapshot.exportDir !== exportDir) throw new ExportDirRejectedError();
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
  exportArchive: (dir?: string) => Promise<{ archive: string; downloadToken?: string }>;
  /** Browser download URL for an export token; the save dialog picks the destination. */
  downloadUrl: (downloadToken: string) => string;
  /** Restore an archive from the configured directory. */
  importArchive: (file: string) => Promise<void>;
  /** Authorize a browser upload and mint its single-use token. */
  requestUpload: (file: string) => Promise<string>;
  /**
   * Stream a file's bytes to an upload token. Mirrors DSH's own file-upload
   * client: Blob bodies go over XMLHttpRequest (content-length, disk-streamed)
   * instead of fetch+stream, which the transport mangles.
   */
  sendUploadBytes: (uploadToken: string, file: File) => Promise<void>;
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
const DOWNLOAD_ENDPOINT = '/api/computer/download';
const UPLOAD_ENDPOINT = '/api/computer/upload';
const UPLOAD_CONTENT_ENDPOINT = '/api/computer/upload-content';

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
  createXhr?: (() => XMLHttpRequest) | undefined;
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
      const payload = await requestJson<{ archive?: string; downloadToken?: string }>(
        EXPORT_ENDPOINT,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(
            dir === undefined || dir === '' ? { authorize: true } : { authorize: true, dir },
          ),
        },
      );
      return {
        archive: payload.archive ?? '',
        ...(payload.downloadToken === undefined ? {} : { downloadToken: payload.downloadToken }),
      };
    },
    downloadUrl: (downloadToken) =>
      `${DOWNLOAD_ENDPOINT}?token=${encodeURIComponent(downloadToken)}`,
    importArchive: async (file) => {
      await postAuthorized(IMPORT_ENDPOINT, { file });
    },
    requestUpload: async (file) => {
      const payload = await requestJson<{ uploadToken?: string }>(UPLOAD_ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ authorize: true, file }),
      });
      if (payload.uploadToken === undefined) throw new Error('upload not accepted');
      return payload.uploadToken;
    },
    sendUploadBytes: (uploadToken, file) =>
      new Promise<void>((resolve, reject) => {
        const createXhr = options.createXhr ?? (() => new XMLHttpRequest());
        const xhr = createXhr();
        xhr.open('POST', `${UPLOAD_CONTENT_ENDPOINT}?token=${encodeURIComponent(uploadToken)}`);
        xhr.withCredentials = true;
        xhr.setRequestHeader('content-type', 'application/octet-stream');
        xhr.onload = () => {
          if (xhr.status !== 200) {
            reject(new Error(`upload failed: HTTP ${String(xhr.status)}`));
            return;
          }
          try {
            const payload = JSON.parse(xhr.responseText) as {
              ok?: unknown;
              error?: unknown;
            };
            if (payload.ok === true) resolve();
            else
              reject(
                new Error(typeof payload.error === 'string' ? payload.error : 'upload failed'),
              );
          } catch (error: unknown) {
            reject(error instanceof Error ? error : new Error(String(error)));
          }
        };
        xhr.onerror = () => reject(new Error('upload transport failed'));
        xhr.send(file);
      }),
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
  downloadUrl,
  importArchive,
  requestUpload,
  sendUploadBytes,
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
  const [saving, setSaving] = useState(false);
  const [dirNote, setDirNote] = useState<string | undefined>(undefined);
  const [transferNote, setTransferNote] = useState<string | undefined>(undefined);
  const [download, setDownload] = useState<{ archive: string; token: string } | undefined>(
    undefined,
  );
  const [uploadName, setUploadName] = useState<string | undefined>(undefined);
  const uploadFile = useRef<File | null>(null);
  const [pickerBroken, setPickerBroken] = useState(false);
  const [hostDir, setHostDir] = useState<string | undefined>(undefined);
  const [livePhase, setLivePhase] = useState<string | undefined>(undefined);
  const [liveElapsed, setLiveElapsed] = useState(0);

  useEffect(() => prefs.subscribe(() => setSnapshot(prefs.getSnapshot())), [prefs]);

  useEffect(() => {
    // The Host-resolved path (status route) is what export/open-dir will use
    // whenever the scope carries no configured directory — including the
    // ready-but-empty default — and the only source when the scope is absent.
    if (snapshot.status !== 'unavailable' && snapshot.exportDir !== '') return;
    void hostExportDir()
      .then((dir) => setHostDir(dir))
      .catch(() => undefined);
  }, [hostExportDir, snapshot.status, snapshot.exportDir]);

  // While an export/import runs, mirror the Host's reported phase and an
  // elapsed timer so the rows show stage and time, not only a busy label.
  useEffect(() => {
    if (busy === undefined) {
      setLivePhase(undefined);
      setLiveElapsed(0);
      return;
    }
    const startedAt = Date.now();
    let cancelled = false;
    const tick = async (): Promise<void> => {
      if (cancelled) return;
      setLiveElapsed(Math.round((Date.now() - startedAt) / 1000));
      try {
        const payload = await requestJson<{ status?: { phase?: string } }>(STATUS_ENDPOINT);
        if (!cancelled) setLivePhase(payload.status?.phase);
      } catch {
        // Status is advisory here; the request that set `busy` owns the outcome.
      }
    };
    void tick();
    const timer = setInterval(() => void tick(), 1000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [busy]);

  const phaseKey = livePhase === undefined ? undefined : PHASE_LABEL[livePhase];

  const exportDir = displayExportDir(snapshot.exportDir, hostDir);
  const hasDir = exportDir !== '';
  const writable = snapshot.status === 'ready' && snapshot.writable;
  // The directory is adjustable only while a working picker exists; once the
  // picker rejects (e.g. web deployments) the row runs read-only against the
  // directory the Host reports, default or configured.
  const canAdjust = pickerAvailable && !pickerBroken;

  const pickDirectoryInto = useCallback(
    (apply: (dir: string) => void) => {
      void pickDirectory()
        .then((dir) => {
          if (dir !== null) apply(dir);
        })
        .catch(() => {
          setPickerBroken(true);
          setManualOpen(false);
          setDirNote(t('rows.pickerFallback', { dir: exportDir }));
        });
    },
    [exportDir, pickDirectory, t],
  );

  const pickExportDir = useCallback(() => {
    pickDirectoryInto((dir) => {
      setManualPath(dir);
      setDirNote(undefined);
      void prefs.setExportDir(dir).catch((error: unknown) => setDirNote(String(error)));
    });
  }, [pickDirectoryInto, prefs]);

  const startExport = useCallback(() => {
    if (!canAdjust) {
      // Fixed directory (no picker, or one that failed): export straight there.
      setExportTarget(undefined);
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
        // Switch to the fixed directory shown on the row and keep the export
        // intent — the Human clicked Export, not "enter a path".
        setPickerBroken(true);
        setManualOpen(false);
        setDirNote(t('rows.pickerFallback', { dir: exportDir }));
        setExportTarget(undefined);
        setConfirming('export');
      });
  }, [canAdjust, exportDir, pickDirectory, t]);

  const saveManualPath = useCallback(() => {
    const dir = manualPath.trim();
    if (dir === '') return;
    if (!dir.startsWith('/') && !/^[A-Za-z]:[\\/]/u.test(dir)) {
      setDirNote(t('rows.exportDir.needsAbsolute'));
      return;
    }
    setSaving(true);
    setDirNote(undefined);
    void prefs
      .setExportDir(dir)
      .then(() => {
        setManualOpen(false);
        setDirNote(t('rows.exportDir.saved', { dir }));
      })
      .catch((error: unknown) =>
        setDirNote(
          error instanceof ExportDirRejectedError
            ? t('rows.exportDir.saveRejected')
            : String(error),
        ),
      )
      .finally(() => setSaving(false));
  }, [manualPath, prefs, t]);

  const runExport = useCallback(() => {
    // In fixed-directory mode (pickerless) nobody saw a destination chooser,
    // so open the folder once the archive lands.
    const autoOpen = !canAdjust;
    setConfirming(undefined);
    setBusy('export');
    setTransferNote(undefined);
    setDownload(undefined);
    void exportArchive(exportTarget)
      .then(({ archive, downloadToken }) => {
        setTransferNote(archive === '' ? t('rows.exportedDone') : t('rows.exported', { archive }));
        if (archive !== '' && downloadToken !== undefined) {
          setDownload({ archive, token: downloadToken });
        }
        if (autoOpen) void openDirectory(exportDir).catch(() => undefined);
      })
      .catch((error: unknown) => setTransferNote(String(error)))
      .finally(() => setBusy(undefined));
  }, [canAdjust, exportArchive, exportDir, exportTarget, openDirectory, t]);

  const runImport = useCallback(
    (file: string) => {
      setImportOpen(false);
      setConfirming(undefined);
      setBusy('import');
      setTransferNote(undefined);
      void importArchive(file)
        .then(() => setTransferNote(t('rows.imported', { file })))
        .catch((error: unknown) => setTransferNote(String(error)))
        .finally(() => setBusy(undefined));
    },
    [importArchive, t],
  );

  const takeUploadFile = useCallback((file: File | null) => {
    if (file === null) return;
    uploadFile.current = file;
    setUploadName(file.name);
    setTransferNote(undefined);
  }, []);

  const runUpload = useCallback(() => {
    const file = uploadFile.current;
    const name = uploadName;
    if (file === null || name === undefined) return;
    setConfirming(undefined);
    setBusy('import');
    setTransferNote(undefined);
    void requestUpload(name)
      .then((token) => sendUploadBytes(token, file))
      .then(() => {
        setTransferNote(t('rows.imported', { file: name }));
        setUploadName(undefined);
        uploadFile.current = null;
      })
      .catch((error: unknown) => setTransferNote(String(error)))
      .finally(() => setBusy(undefined));
  }, [uploadName, requestUpload, sendUploadBytes, t]);

  const openImport = useCallback(() => {
    void listArchives()
      .then((files) => {
        setArchives(files);
        setImportOpen(true);
        if (files.length === 0) setTransferNote(t('rows.noArchives'));
      })
      .catch((error: unknown) => setTransferNote(String(error)));
  }, [listArchives, t]);

  const openDir = useCallback(() => {
    void openDirectory(exportDir).catch((error: unknown) => setDirNote(String(error)));
  }, [exportDir, openDirectory]);

  return (
    <div className="bh-settings-rows">
      <div className="bh-settings-section-head">
        <div className="bh-settings-section-title">{t('section.title')}</div>
        <div className="bh-settings-section-desc">{t('section.description')}</div>
      </div>
      <Row
        title={t('rows.exportDir.title')}
        description={
          hasDir ? t('rows.exportDir.current', { dir: exportDir }) : t('rows.exportDir.empty')
        }
      >
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {canAdjust ? (
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
          {canAdjust ? (
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
          ) : null}
        </div>
      </Row>

      {manualOpen && canAdjust ? (
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
            disabled={!writable || saving || manualPath.trim() === ''}
            onClick={saveManualPath}
          >
            {saving ? t('rows.exportDir.saving') : t('rows.exportDir.save')}
          </button>
        </div>
      ) : null}
      {dirNote === undefined ? null : <div className="bh-note">{dirNote}</div>}

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
                : canAdjust
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
          {download === undefined ? null : (
            <button
              type="button"
              className="bh-settings-selector"
              onClick={() => {
                globalThis.location?.assign(downloadUrl(download.token));
              }}
            >
              {t('rows.download')}
            </button>
          )}
          <label className="bh-settings-selector">
            {t('rows.chooseFile')}
            <input
              type="file"
              accept=".tar,application/x-tar"
              hidden
              disabled={busy !== undefined}
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                event.target.value = '';
                takeUploadFile(file);
              }}
            />
          </label>
          {uploadName === undefined ? null : (
            <>
              <button
                type="button"
                className="bh-settings-selector"
                onClick={() => {
                  setUploadName(undefined);
                  uploadFile.current = null;
                }}
              >
                {t('entry.cancel')}
              </button>
              <button type="button" className="bh-settings-selector" onClick={runUpload}>
                {busy === 'import' ? t('rows.importing') : t('rows.authorizeImport')}
              </button>
            </>
          )}
          {uploadName === undefined ? null : (
            <div
              className="bh-note"
              style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: '100%',
              }}
            >
              {uploadName}
            </div>
          )}
        </div>
      </Row>

      {busy !== undefined && phaseKey !== undefined ? (
        <div className="bh-note">
          {`${t(phaseKey)} · ${t('entry.elapsed', { seconds: liveElapsed })}`}
        </div>
      ) : null}
      {snapshot.status === 'unavailable' ? (
        <div className="bh-note">{t('rows.noSettings')}</div>
      ) : null}
      {transferNote === undefined ? null : <div className="bh-note">{transferNote}</div>}
    </div>
  );
}
