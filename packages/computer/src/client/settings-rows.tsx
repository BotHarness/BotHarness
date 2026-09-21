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
import type { InjectFace, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';

import {
  COMPUTER_EXPORT_DIR_FIELD,
  COMPUTER_IDLE_STOP_FIELD,
  type ComputerSettings,
} from '../settings.js';

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
  /** Open the Host's directory picker; `null` when cancelled. */
  pickDirectory: () => Promise<string | null>;
  /** Archive the Computer's store into the configured directory. */
  exportArchive: () => Promise<string>;
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
    pickDirectory: async () =>
      options.pickDirectory === undefined ? null : options.pickDirectory(),
    exportArchive: async () => {
      const payload = await requestJson<{ archive?: string }>(EXPORT_ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ authorize: true }),
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
  prefs,
  pickDirectory,
  exportArchive,
  importArchive,
  listArchives,
  hostExportDir,
}: PropsRuntime<'botharness.settings.item'> & InjectFace<ComputerSettingsFace>): ReactElement {
  const [snapshot, setSnapshot] = useState(prefs.getSnapshot);
  const [idleOpen, setIdleOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [archives, setArchives] = useState<readonly string[] | undefined>(undefined);
  const [busy, setBusy] = useState<'export' | 'import' | undefined>(undefined);
  const [confirming, setConfirming] = useState<'export' | 'import' | undefined>(undefined);
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

  const pick = useCallback(() => {
    void pickDirectory()
      .then((dir) => {
        if (dir !== null) prefs.setExportDir(dir);
      })
      .catch((error: unknown) => setNote(String(error)));
  }, [pickDirectory, prefs]);

  const runExport = useCallback(() => {
    setConfirming(undefined);
    setBusy('export');
    setNote(undefined);
    void exportArchive()
      .then((archive) => setNote(archive === '' ? '导出完成。' : `已导出：${archive}`))
      .catch((error: unknown) => setNote(String(error)))
      .finally(() => setBusy(undefined));
  }, [exportArchive]);

  const runImport = useCallback(
    (file: string) => {
      setImportOpen(false);
      setConfirming(undefined);
      setBusy('import');
      setNote(undefined);
      void importArchive(file)
        .then(() => setNote(`已从 ${file} 导入并重启 Computer。`))
        .catch((error: unknown) => setNote(String(error)))
        .finally(() => setBusy(undefined));
    },
    [importArchive],
  );

  const openImport = useCallback(() => {
    void listArchives()
      .then((files) => {
        setArchives(files);
        setImportOpen(true);
        if (files.length === 0) setNote('该目录还没有归档；先导出一次。');
      })
      .catch((error: unknown) => setNote(String(error)));
  }, [listArchives]);

  return (
    <div className="bh-settings-rows">
      <Row
        title="Computer 导出目录"
        description={
          hasDir ? `当前：${exportDir}` : '选择目录后即可导出/导入；未配置时导出与导入不可用'
        }
      >
        <button type="button" className="bh-settings-selector" disabled={!writable} onClick={pick}>
          <IconFolderOpenOutline16 size={14} />
          选择…
        </button>
      </Row>

      <Row title="空闲停止" description="无观看者时 Computer 自动停止的等待时间">
        <Menu
          open={idleOpen}
          portal
          align="end"
          items={IDLE_OPTIONS.map((minutes) => ({
            id: String(minutes),
            label: `${String(minutes)} 分钟`,
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
              label={`${String(snapshot.idleStopMinutes)} 分钟`}
              open={idleOpen}
              disabled={!writable}
              onToggle={() => {
                setIdleOpen((value) => !value);
              }}
            />
          }
        />
      </Row>

      <Row title="导出 / 导入" description="把 Computer 的持久存储打包成一个归档，或从归档恢复">
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {confirming === 'export' ? (
            <>
              <button
                type="button"
                className="bh-settings-selector"
                onClick={() => {
                  setConfirming(undefined);
                }}
              >
                取消
              </button>
              <button type="button" className="bh-settings-selector" onClick={runExport}>
                授权并导出
              </button>
            </>
          ) : (
            <button
              type="button"
              className="bh-settings-selector"
              disabled={!hasDir || busy !== undefined}
              onClick={() => {
                setConfirming('export');
              }}
            >
              {busy === 'export' ? '导出中…' : '导出'}
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
              取消导入
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
                  label={busy === 'import' ? '导入中…' : '导入…'}
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
              授权并导入 {archives[0]}
            </button>
          ) : null}
        </div>
      </Row>

      {snapshot.status === 'unavailable' ? (
        <div className="bh-note">设置服务不可用：可以导出/导入，但无法修改目录与空闲时间。</div>
      ) : null}
      {note === undefined ? null : <div className="bh-note">{note}</div>}
    </div>
  );
}
