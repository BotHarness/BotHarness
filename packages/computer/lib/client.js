window.__ModuleLoader__.load({
  id: '@botharness/computer',
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
    let react = require('react');
    let react_dom = require('react-dom');
    let _deepseek_ai_dsh_client_ui_primitives = require('@deepseek-ai/dsh-client-ui-primitives');
    let react_jsx_runtime = require('react/jsx-runtime');
    //#region packages/computer/src/client/locale.ts
    /** Locale namespace owning the Computer client's copy. */
    const LOCALE_NS = 'botharness-computer';
    /** Simplified Chinese dictionary and the key-set source of truth. */
    const zh = {
      'entry.label': '电脑',
      'entry.screen.title': '{name} 的屏幕',
      'entry.shared':
        '这台电脑由本 profile 的所有 PersonaBot 共享：各自拥有自己的窗口，共享登录态与文件。',
      'entry.start': '启动',
      'entry.starting': '启动中…',
      'entry.stop': '停止',
      'entry.stopping': '停止中…',
      'entry.reconnect': '重新连接',
      'entry.connecting': '连接中',
      'entry.reconnecting': '正在重新连接',
      'entry.openFullscreen': '打开大屏',
      'entry.fullscreenOpened': '已在大屏打开',
      'entry.collapseFullscreen': '收起全屏',
      'entry.authorize': '授权并启动',
      'entry.cancel': '取消',
      'entry.remember': '本次会话内不再询问',
      'entry.authorizeIntro': '启动会在你的机器上执行：',
      'entry.authorize.probe': '检测本机容器运行时；缺失时只给安装引导，不会自动安装',
      'entry.authorize.volume': '创建/复用持久卷（登录态与文件保留在这台电脑上）',
      'entry.authorize.pull': '拉取镜像（首次约 1.2 GB 网络流量）并创建容器',
      'entry.authorize.bind': '把 Web VNC 绑定到 127.0.0.1 的本地端口，仅本机可访问',
      'entry.phase.pulling': '正在拉取镜像',
      'entry.phase.starting': '正在启动',
      'entry.phase.stopping': '正在停止',
      'entry.phase.working': '处理中',
      'entry.wait': '请稍候',
      'entry.elapsed': '已用时 {seconds}s',
      'entry.updated': '最后更新 {seconds}s 前',
      'entry.setup':
        '未检测到容器运行时。任选其一安装后重试：\n\nColima（推荐，MIT）：\n  brew install colima docker\n  brew services start colima\n\n或 Docker Desktop：https://www.docker.com/products/docker-desktop/',
      'rows.exportDir.title': 'Computer 导出目录',
      'rows.exportDir.current': '当前：{dir}',
      'rows.exportDir.empty': '选择目录后即可导出/导入；未配置时导出与导入不可用',
      'rows.exportDir.pick': '选择…',
      'rows.exportDir.manual': '手动输入路径',
      'rows.exportDir.save': '保存',
      'rows.exportDir.open': '打开目录',
      'rows.idle.title': '空闲停止',
      'rows.idle.description': '无观看者时 Computer 自动停止的等待时间',
      'rows.idle.minutes': '{minutes} 分钟',
      'rows.transfer.title': '导出 / 导入',
      'rows.transfer.description': '把 Computer 的持久存储打包成一个归档，或从归档恢复',
      'rows.export': '导出',
      'rows.exporting': '导出中…',
      'rows.exportTo': '导出到…',
      'rows.authorizeExport': '授权并导出',
      'rows.import': '导入…',
      'rows.importing': '导入中…',
      'rows.cancelImport': '取消导入',
      'rows.authorizeImport': '授权并导入 {file}',
      'rows.exported': '已导出：{archive}',
      'rows.exportedDone': '导出完成。',
      'rows.imported': '已从 {file} 导入并重启 Computer。',
      'rows.noArchives': '该目录还没有归档；先导出一次。',
      'rows.noSettings': '设置服务不可用：可以导出/导入，但无法修改目录与空闲时间。',
      'rows.pickerFailed': '目录选择器不可用：请手动输入路径。',
    };
    /** English dictionary; same keys as the Chinese one. */
    const en = {
      'entry.label': 'Computer',
      'entry.screen.title': "{name}'s screen",
      'entry.shared':
        'This Computer is shared by every PersonaBot in the profile: each keeps its own window and they share logins and files.',
      'entry.start': 'Start',
      'entry.starting': 'Starting…',
      'entry.stop': 'Stop',
      'entry.stopping': 'Stopping…',
      'entry.reconnect': 'Reconnect',
      'entry.connecting': 'Connecting',
      'entry.reconnecting': 'Reconnecting',
      'entry.openFullscreen': 'Open fullscreen',
      'entry.fullscreenOpened': 'Open in fullscreen',
      'entry.collapseFullscreen': 'Leave fullscreen',
      'entry.authorize': 'Authorize and start',
      'entry.cancel': 'Cancel',
      'entry.remember': "Don't ask again in this session",
      'entry.authorizeIntro': 'Starting runs these steps on your machine:',
      'entry.authorize.probe':
        'Detect the local container runtime; a missing one only gets setup guidance, never an automatic install',
      'entry.authorize.volume':
        'Create or reuse the persistent volume (logins and files stay on this Computer)',
      'entry.authorize.pull':
        'Pull the image (about 1.2 GB the first time) and create the container',
      'entry.authorize.bind':
        'Bind the web VNC endpoint to a loopback port, reachable only from this machine',
      'entry.phase.pulling': 'Pulling the image',
      'entry.phase.starting': 'Starting',
      'entry.phase.stopping': 'Stopping',
      'entry.phase.working': 'Working',
      'entry.wait': 'Please wait',
      'entry.elapsed': 'Elapsed {seconds}s',
      'entry.updated': 'Last update {seconds}s ago',
      'entry.setup':
        'No container runtime found. Install one of these, then retry:\n\nColima (recommended, MIT):\n  brew install colima docker\n  brew services start colima\n\nOr Docker Desktop: https://www.docker.com/products/docker-desktop/',
      'rows.exportDir.title': 'Computer export directory',
      'rows.exportDir.current': 'Current: {dir}',
      'rows.exportDir.empty': 'Pick a directory to enable export and import',
      'rows.exportDir.pick': 'Choose…',
      'rows.exportDir.manual': 'Type a path',
      'rows.exportDir.save': 'Save',
      'rows.exportDir.open': 'Open folder',
      'rows.idle.title': 'Idle stop',
      'rows.idle.description': 'How long the Computer waits without viewers before stopping',
      'rows.idle.minutes': '{minutes} min',
      'rows.transfer.title': 'Export / import',
      'rows.transfer.description':
        'Pack the persistent store into one archive, or restore from one',
      'rows.export': 'Export',
      'rows.exporting': 'Exporting…',
      'rows.exportTo': 'Export to…',
      'rows.authorizeExport': 'Authorize and export',
      'rows.import': 'Import…',
      'rows.importing': 'Importing…',
      'rows.cancelImport': 'Cancel import',
      'rows.authorizeImport': 'Authorize and import {file}',
      'rows.exported': 'Exported: {archive}',
      'rows.exportedDone': 'Export complete.',
      'rows.imported': 'Imported {file} and restarted the Computer.',
      'rows.noArchives': 'No archives in that directory yet — export once first.',
      'rows.noSettings':
        'Settings service unavailable: export and import still work, but the directory and idle time cannot be changed.',
      'rows.pickerFailed': 'Directory picker unavailable — type a path instead.',
    };
    //#endregion
    //#region packages/computer/src/settings.ts
    /**
     * Runtime-editable Computer configuration, shared by the Host settings
     * registration and the browser scope. Kept free of schemastery so the client
     * bundle pulls only constants and types.
     */
    /** Settings namespace owning the Computer's runtime-editable fields. */
    const COMPUTER_SETTINGS_NAMESPACE = 'botharness-computer';
    /** Field carrying the directory that holds Computer exports. */
    const COMPUTER_EXPORT_DIR_FIELD = 'exportDir';
    /** Field carrying the idle stop minutes. */
    const COMPUTER_IDLE_STOP_FIELD = 'idleStopMinutes';
    //#endregion
    //#region packages/computer/src/client/settings-rows.tsx
    /**
     * The Computer's rows inside the BotHarness settings section. They own the
     * runtime-editable settings (`exportDir`, `idleStopMinutes`) through the
     * shared settings scope, use the Host's directory picker, and drive the
     * export/import endpoints with an explicit authorization step. Copy stays in
     * this bundle's own words; the section's row classes come from
     * `@botharness/client`, which is always mounted when this page renders.
     * @module @botharness/computer/settings-rows
     */
    /** Live Computer settings published to the rows. */
    var ComputerSettingsPrefs = class {
      snapshot = {
        exportDir: '',
        idleStopMinutes: 30,
        status: 'loading',
        writable: false,
      };
      listeners = /* @__PURE__ */ new Set();
      scope;
      detach;
      attach(scope) {
        this.detach?.();
        this.scope = scope;
        this.detach = scope.subscribe(() => {
          this.sync();
        });
        this.sync();
        return () => {
          this.detach?.();
          this.detach = void 0;
          this.scope = void 0;
        };
      }
      getSnapshot = () => this.snapshot;
      subscribe = (listener) => {
        this.listeners.add(listener);
        return () => {
          this.listeners.delete(listener);
        };
      };
      setExportDir(exportDir) {
        this.publish({ exportDir });
        this.scope?.set(COMPUTER_EXPORT_DIR_FIELD, exportDir).catch(() => void 0);
      }
      setIdleStopMinutes(idleStopMinutes) {
        this.publish({ idleStopMinutes });
        this.scope?.set(COMPUTER_IDLE_STOP_FIELD, idleStopMinutes).catch(() => void 0);
      }
      publish(patch) {
        this.snapshot = {
          ...this.snapshot,
          ...patch,
        };
        for (const listener of this.listeners) listener();
      }
      sync() {
        const scope = this.scope;
        if (scope === void 0) return;
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
    };
    const IDLE_OPTIONS = [15, 30, 60, 120, 240];
    const EXPORT_ENDPOINT = '/api/computer/export';
    const IMPORT_ENDPOINT = '/api/computer/import';
    const EXPORTS_ENDPOINT = '/api/computer/exports';
    const STATUS_ENDPOINT$1 = '/api/computer/status';
    const OPEN_DIR_ENDPOINT = '/api/computer/open-dir';
    async function requestJson$1(url, init) {
      const response = await fetch(url, {
        credentials: 'same-origin',
        ...init,
      });
      if (!response.ok) throw new Error(`${String(response.status)} ${await response.text()}`);
      return await response.json();
    }
    async function postAuthorized(url, body = {}) {
      await requestJson$1(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          authorize: true,
          ...body,
        }),
      });
    }
    /**
     * Build the rows' inject face: the settings prefs plus the picker and the
     * export/import endpoints.
     */
    function createComputerSettingsFace(options) {
      const { prefs } = options;
      return {
        prefs,
        pickerAvailable: options.pickDirectory !== void 0,
        pickDirectory: async () =>
          options.pickDirectory === void 0 ? null : options.pickDirectory(),
        openDirectory: async (dir) => {
          await postAuthorized(OPEN_DIR_ENDPOINT, dir === '' ? {} : { dir });
        },
        exportArchive: async (dir) => {
          return (
            (
              await requestJson$1(EXPORT_ENDPOINT, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(
                  dir === void 0 || dir === ''
                    ? { authorize: true }
                    : {
                        authorize: true,
                        dir,
                      },
                ),
              })
            ).archive ?? ''
          );
        },
        importArchive: async (file) => {
          await postAuthorized(IMPORT_ENDPOINT, { file });
        },
        listArchives: async () => {
          return (await requestJson$1(EXPORTS_ENDPOINT)).files ?? [];
        },
        hostExportDir: async () => {
          return (await requestJson$1(STATUS_ENDPOINT$1)).exportDir ?? '';
        },
      };
    }
    function Row({ title, description, children }) {
      return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)('div', {
        className: 'bh-settings-row',
        children: [
          /* @__PURE__ */ (0, react_jsx_runtime.jsxs)('div', {
            className: 'bh-settings-row-text',
            children: [
              /* @__PURE__ */ (0, react_jsx_runtime.jsx)('div', {
                className: 'bh-settings-row-title',
                children: title,
              }),
              /* @__PURE__ */ (0, react_jsx_runtime.jsx)('div', {
                className: 'bh-settings-row-desc',
                children: description,
              }),
            ],
          }),
          children,
        ],
      });
    }
    function Selector({ label, open, onToggle, disabled }) {
      return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)('button', {
        type: 'button',
        className: 'bh-settings-selector',
        'aria-haspopup': 'menu',
        'aria-expanded': open,
        disabled: disabled === true,
        onClick: onToggle,
        children: [
          label,
          /* @__PURE__ */ (0, react_jsx_runtime.jsx)(
            _deepseek_ai_dsh_client_ui_primitives.IconChevronDownOutline14,
            { className: 'bh-settings-chevron' },
          ),
        ],
      });
    }
    /** The Computer group inside the BotHarness settings page. */
    function ComputerSettingsRows({
      t,
      prefs,
      pickerAvailable,
      pickDirectory,
      openDirectory,
      exportArchive,
      importArchive,
      listArchives,
      hostExportDir,
    }) {
      const [snapshot, setSnapshot] = (0, react.useState)(prefs.getSnapshot);
      const [idleOpen, setIdleOpen] = (0, react.useState)(false);
      const [importOpen, setImportOpen] = (0, react.useState)(false);
      const [archives, setArchives] = (0, react.useState)(void 0);
      const [busy, setBusy] = (0, react.useState)(void 0);
      const [confirming, setConfirming] = (0, react.useState)(void 0);
      const [exportTarget, setExportTarget] = (0, react.useState)(void 0);
      const [manualOpen, setManualOpen] = (0, react.useState)(false);
      const [manualPath, setManualPath] = (0, react.useState)('');
      const [note, setNote] = (0, react.useState)(void 0);
      const [hostDir, setHostDir] = (0, react.useState)(void 0);
      (0, react.useEffect)(() => prefs.subscribe(() => setSnapshot(prefs.getSnapshot())), [prefs]);
      (0, react.useEffect)(() => {
        if (snapshot.status !== 'unavailable') return;
        hostExportDir()
          .then((dir) => setHostDir(dir))
          .catch(() => void 0);
      }, [hostExportDir, snapshot.status]);
      const exportDir = snapshot.status === 'unavailable' ? (hostDir ?? '') : snapshot.exportDir;
      const hasDir = exportDir !== '';
      const writable = snapshot.status === 'ready' && snapshot.writable;
      const pickDirectoryInto = (0, react.useCallback)(
        (apply) => {
          pickDirectory()
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
      const pickExportDir = (0, react.useCallback)(() => {
        pickDirectoryInto((dir) => {
          setManualPath(dir);
          prefs.setExportDir(dir);
          setNote(void 0);
        });
      }, [pickDirectoryInto, prefs]);
      const startExport = (0, react.useCallback)(() => {
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
            setExportTarget(void 0);
            setConfirming('export');
          });
      }, [pickDirectory, pickerAvailable]);
      const runExport = (0, react.useCallback)(() => {
        setConfirming(void 0);
        setBusy('export');
        setNote(void 0);
        exportArchive(exportTarget)
          .then((archive) =>
            setNote(archive === '' ? t('rows.exportedDone') : t('rows.exported', { archive })),
          )
          .catch((error) => setNote(String(error)))
          .finally(() => setBusy(void 0));
      }, [exportArchive, exportTarget, t]);
      const runImport = (0, react.useCallback)(
        (file) => {
          setImportOpen(false);
          setConfirming(void 0);
          setBusy('import');
          setNote(void 0);
          importArchive(file)
            .then(() => setNote(t('rows.imported', { file })))
            .catch((error) => setNote(String(error)))
            .finally(() => setBusy(void 0));
        },
        [importArchive, t],
      );
      const openImport = (0, react.useCallback)(() => {
        listArchives()
          .then((files) => {
            setArchives(files);
            setImportOpen(true);
            if (files.length === 0) setNote(t('rows.noArchives'));
          })
          .catch((error) => setNote(String(error)));
      }, [listArchives, t]);
      const openDir = (0, react.useCallback)(() => {
        openDirectory(exportDir).catch((error) => setNote(String(error)));
      }, [exportDir, openDirectory]);
      return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)('div', {
        className: 'bh-settings-rows',
        children: [
          /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Row, {
            title: t('rows.exportDir.title'),
            description: hasDir
              ? t('rows.exportDir.current', { dir: exportDir })
              : t('rows.exportDir.empty'),
            children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)('div', {
              style: {
                display: 'flex',
                gap: 8,
                alignItems: 'center',
                flexWrap: 'wrap',
              },
              children: [
                pickerAvailable
                  ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)('button', {
                      type: 'button',
                      className: 'bh-settings-selector',
                      disabled: !writable,
                      onClick: pickExportDir,
                      children: [
                        /* @__PURE__ */ (0, react_jsx_runtime.jsx)(
                          _deepseek_ai_dsh_client_ui_primitives.IconFolderOpenOutline16,
                          { size: 14 },
                        ),
                        t('rows.exportDir.pick'),
                      ],
                    })
                  : null,
                /* @__PURE__ */ (0, react_jsx_runtime.jsx)('button', {
                  type: 'button',
                  className: 'bh-settings-selector',
                  disabled: !hasDir,
                  onClick: openDir,
                  children: t('rows.exportDir.open'),
                }),
                /* @__PURE__ */ (0, react_jsx_runtime.jsx)('button', {
                  type: 'button',
                  className: 'bh-settings-selector',
                  disabled: !writable,
                  onClick: () => {
                    setManualOpen((value) => !value);
                    setManualPath(exportDir);
                  },
                  children: t('rows.exportDir.manual'),
                }),
              ],
            }),
          }),
          manualOpen
            ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)('div', {
                className: 'bh-settings-row',
                children: [
                  /* @__PURE__ */ (0, react_jsx_runtime.jsx)('div', {
                    className: 'bh-settings-row-text',
                    children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)('input', {
                      className: 'bh-settings-input',
                      value: manualPath,
                      placeholder: '/absolute/path',
                      'aria-label': t('rows.exportDir.manual'),
                      onChange: (event) => {
                        setManualPath(event.target.value);
                      },
                    }),
                  }),
                  /* @__PURE__ */ (0, react_jsx_runtime.jsx)('button', {
                    type: 'button',
                    className: 'bh-settings-selector',
                    disabled: !writable || manualPath.trim() === '',
                    onClick: () => {
                      prefs.setExportDir(manualPath.trim());
                      setManualOpen(false);
                      setNote(void 0);
                    },
                    children: t('rows.exportDir.save'),
                  }),
                ],
              })
            : null,
          /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Row, {
            title: t('rows.idle.title'),
            description: t('rows.idle.description'),
            children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(
              _deepseek_ai_dsh_client_ui_primitives.Menu,
              {
                open: idleOpen,
                portal: true,
                align: 'end',
                items: IDLE_OPTIONS.map((minutes) => ({
                  id: String(minutes),
                  label: t('rows.idle.minutes', { minutes }),
                })),
                selectedId: String(snapshot.idleStopMinutes),
                onSelect: (id) => {
                  setIdleOpen(false);
                  prefs.setIdleStopMinutes(Number(id));
                },
                onClose: () => {
                  setIdleOpen(false);
                },
                anchor: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Selector, {
                  label: t('rows.idle.minutes', { minutes: snapshot.idleStopMinutes }),
                  open: idleOpen,
                  disabled: !writable,
                  onToggle: () => {
                    setIdleOpen((value) => !value);
                  },
                }),
              },
            ),
          }),
          /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Row, {
            title: t('rows.transfer.title'),
            description: t('rows.transfer.description'),
            children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)('div', {
              style: {
                display: 'flex',
                gap: 8,
                alignItems: 'center',
                flexWrap: 'wrap',
              },
              children: [
                confirming === 'export'
                  ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, {
                      children: [
                        /* @__PURE__ */ (0, react_jsx_runtime.jsx)('button', {
                          type: 'button',
                          className: 'bh-settings-selector',
                          onClick: () => {
                            setConfirming(void 0);
                          },
                          children: t('entry.cancel'),
                        }),
                        /* @__PURE__ */ (0, react_jsx_runtime.jsx)('button', {
                          type: 'button',
                          className: 'bh-settings-selector',
                          onClick: runExport,
                          children: t('rows.authorizeExport'),
                        }),
                      ],
                    })
                  : /* @__PURE__ */ (0, react_jsx_runtime.jsx)('button', {
                      type: 'button',
                      className: 'bh-settings-selector',
                      disabled: !hasDir || busy !== void 0,
                      onClick: startExport,
                      children:
                        busy === 'export'
                          ? t('rows.exporting')
                          : pickerAvailable
                            ? t('rows.exportTo')
                            : t('rows.export'),
                    }),
                confirming === 'import'
                  ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)('button', {
                      type: 'button',
                      className: 'bh-settings-selector',
                      onClick: () => {
                        setConfirming(void 0);
                      },
                      children: t('rows.cancelImport'),
                    })
                  : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(
                      _deepseek_ai_dsh_client_ui_primitives.Menu,
                      {
                        open: importOpen,
                        portal: true,
                        align: 'end',
                        items: (archives ?? []).map((file) => ({
                          id: file,
                          label: file,
                        })),
                        onSelect: (id) => {
                          setConfirming('import');
                          setArchives([id]);
                        },
                        onClose: () => {
                          setImportOpen(false);
                        },
                        anchor: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Selector, {
                          label: busy === 'import' ? t('rows.importing') : t('rows.import'),
                          open: importOpen,
                          disabled: !hasDir || busy !== void 0,
                          onToggle: openImport,
                        }),
                      },
                    ),
                confirming === 'import' && archives?.[0] !== void 0
                  ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)('button', {
                      type: 'button',
                      className: 'bh-settings-selector',
                      onClick: () => {
                        const file = archives[0];
                        if (file !== void 0) runImport(file);
                      },
                      children: t('rows.authorizeImport', { file: archives[0] }),
                    })
                  : null,
              ],
            }),
          }),
          snapshot.status === 'unavailable'
            ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)('div', {
                className: 'bh-note',
                children: t('rows.noSettings'),
              })
            : null,
          note === void 0
            ? null
            : /* @__PURE__ */ (0, react_jsx_runtime.jsx)('div', {
                className: 'bh-note',
                children: note,
              }),
        ],
      });
    }
    //#endregion
    //#region packages/computer/src/client/index.tsx
    const name = 'botharness-computer-client';
    /**
     * The Channel sidebar registry is a client-side service provided by
     * `@botharness/client`; the entry types are duplicated structurally so this
     * bundle stays self-contained (importing that package at runtime would inline
     * its client code into ours).
     */
    const inject = ['slots', 'channelSidebar', 'connection', 'locale'];
    const STATUS_ENDPOINT = '/api/computer/status';
    const START_ENDPOINT = '/api/computer/start';
    const STOP_ENDPOINT = '/api/computer/stop';
    const VIEWER_SRC = '/botharness-computer/viewer/';
    const APPROVED_KEY = 'botharness-computer-start-approved';
    const ENTRY_ID = 'botharness-computer';
    /** Captured from the client connection service so entries can read PersonaBot names. */
    let connectionRpc;
    async function requestJson(url, init) {
      const response = await fetch(url, {
        credentials: 'same-origin',
        ...init,
      });
      if (!response.ok) throw new Error(`${String(response.status)} ${await response.text()}`);
      return await response.json();
    }
    const PHASE_LABEL = {
      pulling: 'entry.phase.pulling',
      starting: 'entry.phase.starting',
      stopping: 'entry.phase.stopping',
    };
    const SETUP_GUIDANCE_KEY = 'entry.setup';
    const SHARED_NOTE_KEY = 'entry.shared';
    const AUTHORIZATION_POINTS = [
      'entry.authorize.probe',
      'entry.authorize.volume',
      'entry.authorize.pull',
      'entry.authorize.bind',
    ];
    const noteStyle = {
      opacity: 0.7,
      fontSize: 12,
      whiteSpace: 'pre-wrap',
    };
    const buttonStyle = {
      padding: '4px 10px',
      borderRadius: 6,
      border: '1px solid var(--dsh-border, #3a3a3a)',
      background: 'transparent',
      color: 'inherit',
      cursor: 'pointer',
      fontSize: 12,
    };
    const primaryButtonStyle = {
      ...buttonStyle,
      borderColor: 'var(--dsh-accent, #4d6bfe)',
      background: 'var(--dsh-accent, #4d6bfe)',
      color: '#fff',
    };
    const terminalStyle = {
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      fontSize: 11,
      opacity: 0.7,
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-all',
    };
    /** Logical viewport the viewer renders at; the wrapper scales it to fit. */
    const DESIGN_WIDTH = 1280;
    const DESIGN_HEIGHT = 800;
    const SPIN_STYLE = `
@keyframes bc-spin { to { transform: rotate(360deg); } }
`;
    /**
     * Watches the same-origin viewer document: reports when its stream surface is
     * live and, after a loss (e.g. the Selkies session was closed from its own UI),
     * reports the loss again so the caller can reconnect.
     */
    function useFrameReady(iframeRef, active) {
      const [ready, setReady] = (0, react.useState)(false);
      (0, react.useEffect)(() => {
        if (!active) {
          setReady(false);
          return () => {};
        }
        let cancelled = false;
        let misses = 0;
        let timer;
        const check = () => {
          if (cancelled) return;
          let live = false;
          try {
            const surface = (iframeRef.current?.contentDocument ?? null)?.getElementById(
              'videoCanvas',
            );
            if (surface !== null)
              live = (surface instanceof HTMLVideoElement ? surface.videoWidth : surface.width) > 0;
          } catch {
            live = false;
          }
          if (live) {
            misses = 0;
            setReady(true);
          } else {
            misses += 1;
            if (misses >= 3) setReady(false);
          }
          timer = setTimeout(check, 1e3);
        };
        timer = setTimeout(check, 300);
        return () => {
          cancelled = true;
          if (timer !== void 0) clearTimeout(timer);
        };
      }, [iframeRef, active]);
      return ready;
    }
    /** Centered spinner over black; the shared connecting/retrying indicator. */
    function ScreenIndicator({ label = '连接中' }) {
      const size = 26;
      const stroke = 2;
      const radius = 12;
      const circumference = 2 * Math.PI * radius;
      return /* @__PURE__ */ (0, react_jsx_runtime.jsx)('div', {
        style: {
          position: 'absolute',
          inset: 0,
          display: 'grid',
          placeItems: 'center',
          background: '#000',
          color: '#fff',
        },
        children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)('div', {
          style: {
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 10,
          },
          children: [
            /* @__PURE__ */ (0, react_jsx_runtime.jsxs)('svg', {
              width: size,
              height: size,
              style: { animation: 'bc-spin 1.1s linear infinite' },
              'aria-hidden': 'true',
              children: [
                /* @__PURE__ */ (0, react_jsx_runtime.jsx)('circle', {
                  cx: size / 2,
                  cy: size / 2,
                  r: radius,
                  fill: 'none',
                  stroke: 'rgba(255,255,255,0.18)',
                  strokeWidth: stroke,
                }),
                /* @__PURE__ */ (0, react_jsx_runtime.jsx)('circle', {
                  cx: size / 2,
                  cy: size / 2,
                  r: radius,
                  fill: 'none',
                  stroke: '#fff',
                  strokeWidth: stroke,
                  strokeLinecap: 'round',
                  strokeDasharray: `${String(circumference * 0.28)} ${String(circumference * 0.72)}`,
                }),
              ],
            }),
            /* @__PURE__ */ (0, react_jsx_runtime.jsx)('span', {
              style: {
                fontSize: 12.5,
                opacity: 0.7,
              },
              children: label,
            }),
          ],
        }),
      });
    }
    /** Fixed-aspect card (or fullscreen surface) that scales the viewer to fit. */
    function ScaledFrame({ title, interactive, fit = 'width', iframeRef }) {
      const ref = (0, react.useRef)(null);
      const [box, setBox] = (0, react.useState)({
        width: DESIGN_WIDTH,
        height: DESIGN_HEIGHT,
      });
      (0, react.useEffect)(() => {
        const element = ref.current;
        if (element === null) return () => {};
        const update = () =>
          setBox({
            width: element.clientWidth,
            height: element.clientHeight,
          });
        update();
        const observer = new ResizeObserver(update);
        observer.observe(element);
        return () => observer.disconnect();
      }, []);
      const scale =
        fit === 'contain'
          ? Math.min(box.width / DESIGN_WIDTH, box.height / DESIGN_HEIGHT)
          : box.width / DESIGN_WIDTH;
      const offsetX = fit === 'contain' ? Math.max(0, (box.width - DESIGN_WIDTH * scale) / 2) : 0;
      const offsetY = fit === 'contain' ? Math.max(0, (box.height - DESIGN_HEIGHT * scale) / 2) : 0;
      return /* @__PURE__ */ (0, react_jsx_runtime.jsx)('div', {
        ref,
        style: {
          position: 'relative',
          width: '100%',
          ...(fit === 'width'
            ? {
                aspectRatio: `${String(DESIGN_WIDTH)} / ${String(DESIGN_HEIGHT)}`,
                border: '1px solid var(--dsh-border, #3a3a3a)',
                borderRadius: 8,
              }
            : { height: '100%' }),
          overflow: 'hidden',
          background: '#000',
        },
        children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)('iframe', {
          ref: iframeRef,
          title,
          src: VIEWER_SRC,
          tabIndex: interactive ? 0 : -1,
          style: {
            position: 'absolute',
            top: 0,
            left: 0,
            width: DESIGN_WIDTH,
            height: DESIGN_HEIGHT,
            border: 'none',
            transform: `translate(${String(offsetX)}px, ${String(offsetY)}px) scale(${String(scale)})`,
            transformOrigin: 'top left',
            pointerEvents: interactive ? 'auto' : 'none',
          },
        }),
      });
    }
    /** minimize-2: two arrows converging, used to collapse the fullscreen viewer. */
    function CollapseIcon() {
      return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)('svg', {
        width: 15,
        height: 15,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 2,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': 'true',
        children: [
          /* @__PURE__ */ (0, react_jsx_runtime.jsx)('polyline', { points: '4 14 10 14 10 20' }),
          /* @__PURE__ */ (0, react_jsx_runtime.jsx)('polyline', { points: '20 10 14 10 14 4' }),
          /* @__PURE__ */ (0, react_jsx_runtime.jsx)('line', {
            x1: '14',
            y1: '10',
            x2: '21',
            y2: '3',
          }),
          /* @__PURE__ */ (0, react_jsx_runtime.jsx)('line', {
            x1: '3',
            y1: '21',
            x2: '10',
            y2: '14',
          }),
        ],
      });
    }
    /**
     * Running state: an AgentScreen-style resting card. While the stream connects
     * (or reconnects) it shows the shared indicator; once live, a hover mask blocks
     * input and offers 「打开」, which expands to the fullscreen viewer. Only one
     * viewer iframe is mounted at a time.
     */
    function RunningCard({ t, botSlug, busy, stopping, onStop }) {
      const inlineRef = (0, react.useRef)(null);
      const fullRef = (0, react.useRef)(null);
      const dialogRef = (0, react.useRef)(null);
      const [hovered, setHovered] = (0, react.useState)(false);
      const [expanded, setExpanded] = (0, react.useState)(false);
      const [reloadKey, setReloadKey] = (0, react.useState)(0);
      const [reconnecting, setReconnecting] = (0, react.useState)(false);
      const wasReady = (0, react.useRef)(false);
      const title = t('entry.screen.title', { name: botSlug ?? 'PersonaBot' });
      const inlineReady = useFrameReady(inlineRef, !expanded);
      const fullReady = useFrameReady(fullRef, expanded);
      const ready = expanded ? fullReady : inlineReady;
      (0, react.useEffect)(() => {
        wasReady.current = false;
        setReconnecting(false);
      }, [expanded]);
      (0, react.useEffect)(() => {
        if (ready) {
          wasReady.current = true;
          setReconnecting(false);
          return;
        }
        if (wasReady.current) {
          wasReady.current = false;
          setReconnecting(true);
          setReloadKey((key) => key + 1);
        }
      }, [ready]);
      (0, react.useEffect)(() => {
        if (!expanded) return () => {};
        const onKey = (event) => {
          if (event.key === 'Escape') {
            setExpanded(false);
            return;
          }
          if (event.key !== 'Tab') return;
          const dialog = dialogRef.current;
          if (dialog === null) return;
          const focusable = [
            ...dialog.querySelectorAll('button, [href], iframe, [tabindex]:not([tabindex="-1"])'),
          ].filter((element) => element.tabIndex !== -1);
          const first = focusable[0];
          const last = focusable.at(-1);
          if (first === void 0 || last === void 0) return;
          const active = document.activeElement;
          if (event.shiftKey && (active === first || active === dialog)) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && active === last) {
            event.preventDefault();
            first.focus();
          }
        };
        document.addEventListener('keydown', onKey);
        document.body.style.overflow = 'hidden';
        dialogRef.current?.focus();
        return () => {
          document.removeEventListener('keydown', onKey);
          document.body.style.overflow = '';
        };
      }, [expanded]);
      const indicatorLabel = reconnecting ? t('entry.reconnecting') : t('entry.connecting');
      return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)('div', {
        style: {
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        },
        children: [
          /* @__PURE__ */ (0, react_jsx_runtime.jsx)('div', {
            role: ready && !expanded ? 'button' : void 0,
            tabIndex: ready && !expanded ? 0 : void 0,
            'aria-label': ready ? t('entry.openFullscreen') : indicatorLabel,
            onMouseEnter: () => setHovered(true),
            onMouseLeave: () => setHovered(false),
            onClick: () => {
              if (ready && !expanded) setExpanded(true);
            },
            onKeyDown: (event) => {
              if (!ready || expanded) return;
              if (event.key !== 'Enter' && event.key !== ' ') return;
              event.preventDefault();
              setExpanded(true);
            },
            style: {
              position: 'relative',
              cursor: ready && !expanded ? 'pointer' : 'default',
            },
            children: expanded
              ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)('div', {
                  style: {
                    position: 'relative',
                    width: '100%',
                    aspectRatio: `${String(DESIGN_WIDTH)} / ${String(DESIGN_HEIGHT)}`,
                    display: 'grid',
                    placeItems: 'center',
                    border: '1px solid var(--dsh-border, #3a3a3a)',
                    borderRadius: 8,
                    background: '#000',
                    color: '#fff',
                    fontSize: 12.5,
                    opacity: 0.8,
                  },
                  children: t('entry.fullscreenOpened'),
                })
              : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, {
                  children: [
                    /* @__PURE__ */ (0, react_jsx_runtime.jsx)(
                      ScaledFrame,
                      {
                        title,
                        interactive: false,
                        iframeRef: inlineRef,
                      },
                      reloadKey,
                    ),
                    !inlineReady
                      ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ScreenIndicator, {
                          label: indicatorLabel,
                        })
                      : hovered
                        ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)('div', {
                            style: {
                              position: 'absolute',
                              inset: 0,
                              display: 'grid',
                              placeItems: 'center',
                              background: 'rgba(17,19,24,0.18)',
                              borderRadius: 8,
                            },
                            children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)('span', {
                              style: {
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 6,
                                padding: '6px 12px',
                                borderRadius: 999,
                                background: 'var(--dsh-accent, #4d6bfe)',
                                color: '#fff',
                                fontSize: 12.5,
                                fontWeight: 500,
                              },
                              children: ['⤢ ', t('entry.openFullscreen')],
                            }),
                          })
                        : null,
                  ],
                }),
          }),
          /* @__PURE__ */ (0, react_jsx_runtime.jsx)('div', {
            style: {
              fontSize: 13,
              fontWeight: 500,
              opacity: 0.9,
            },
            children: title,
          }),
          /* @__PURE__ */ (0, react_jsx_runtime.jsxs)('div', {
            style: {
              display: 'flex',
              gap: 8,
            },
            children: [
              /* @__PURE__ */ (0, react_jsx_runtime.jsx)('button', {
                type: 'button',
                style: buttonStyle,
                disabled: busy || stopping,
                onClick: onStop,
                children: busy || stopping ? t('entry.stopping') : t('entry.stop'),
              }),
              /* @__PURE__ */ (0, react_jsx_runtime.jsx)('button', {
                type: 'button',
                style: buttonStyle,
                onClick: () => {
                  setReconnecting(true);
                  setReloadKey((key) => key + 1);
                },
                title: t('entry.reconnect'),
                children: t('entry.reconnect'),
              }),
            ],
          }),
          expanded
            ? (0, react_dom.createPortal)(
                /* @__PURE__ */ (0, react_jsx_runtime.jsxs)('div', {
                  ref: dialogRef,
                  role: 'dialog',
                  'aria-modal': 'true',
                  'aria-label': title,
                  tabIndex: -1,
                  style: {
                    position: 'fixed',
                    inset: 0,
                    zIndex: 100,
                    display: 'flex',
                    flexDirection: 'column',
                    background: '#000',
                    color: '#fff',
                  },
                  children: [
                    /* @__PURE__ */ (0, react_jsx_runtime.jsxs)('div', {
                      style: {
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        height: 44,
                        flex: '0 0 auto',
                        padding: '0 8px 0 14px',
                        borderBottom: '1px solid var(--dsh-border, #2c2c2c)',
                      },
                      children: [
                        /* @__PURE__ */ (0, react_jsx_runtime.jsx)('strong', {
                          style: {
                            fontSize: 13,
                            fontWeight: 600,
                          },
                          children: title,
                        }),
                        /* @__PURE__ */ (0, react_jsx_runtime.jsx)('span', { style: { flex: 1 } }),
                        /* @__PURE__ */ (0, react_jsx_runtime.jsx)('button', {
                          type: 'button',
                          onClick: () => setExpanded(false),
                          'aria-label': t('entry.collapseFullscreen'),
                          title: t('entry.collapseFullscreen'),
                          style: {
                            ...buttonStyle,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                          },
                          children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CollapseIcon, {}),
                        }),
                      ],
                    }),
                    /* @__PURE__ */ (0, react_jsx_runtime.jsxs)('div', {
                      style: {
                        position: 'relative',
                        flex: 1,
                        minHeight: 0,
                      },
                      children: [
                        /* @__PURE__ */ (0, react_jsx_runtime.jsx)(
                          ScaledFrame,
                          {
                            title,
                            interactive: true,
                            fit: 'contain',
                            iframeRef: fullRef,
                          },
                          reloadKey,
                        ),
                        !fullReady
                          ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ScreenIndicator, {
                              label: indicatorLabel,
                            })
                          : null,
                      ],
                    }),
                  ],
                }),
                document.body,
              )
            : null,
        ],
      });
    }
    /** Pure three-state view; the container component supplies data and handlers. */
    function ComputerEntryView(props) {
      const {
        t,
        state,
        phase,
        detail,
        progress,
        runtimeAvailable,
        confirming,
        busy,
        elapsed,
        nowTs,
        error,
        botSlug,
        onStart,
        onConfirmStart,
        onStop,
        onApprove,
        onCancel,
      } = props;
      if (!runtimeAvailable)
        return /* @__PURE__ */ (0, react_jsx_runtime.jsx)('div', {
          style: noteStyle,
          children: t(SETUP_GUIDANCE_KEY),
        });
      if (confirming)
        return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)('div', {
          style: {
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            fontSize: 12,
          },
          children: [
            /* @__PURE__ */ (0, react_jsx_runtime.jsx)('div', {
              style: { opacity: 0.8 },
              children: t('entry.authorizeIntro'),
            }),
            /* @__PURE__ */ (0, react_jsx_runtime.jsx)('ul', {
              style: {
                margin: 0,
                paddingLeft: 16,
                lineHeight: 1.6,
                opacity: 0.85,
              },
              children: AUTHORIZATION_POINTS.map((point) =>
                /* @__PURE__ */ (0, react_jsx_runtime.jsx)('li', { children: t(point) }, point),
              ),
            }),
            /* @__PURE__ */ (0, react_jsx_runtime.jsxs)('label', {
              style: {
                display: 'flex',
                gap: 6,
                alignItems: 'center',
                opacity: 0.85,
              },
              children: [
                /* @__PURE__ */ (0, react_jsx_runtime.jsx)('input', {
                  type: 'checkbox',
                  onChange: (event) => onApprove(event.target.checked),
                }),
                t('entry.remember'),
              ],
            }),
            /* @__PURE__ */ (0, react_jsx_runtime.jsxs)('div', {
              style: {
                display: 'flex',
                gap: 8,
              },
              children: [
                /* @__PURE__ */ (0, react_jsx_runtime.jsx)('button', {
                  type: 'button',
                  style: buttonStyle,
                  onClick: onCancel,
                  children: t('entry.cancel'),
                }),
                /* @__PURE__ */ (0, react_jsx_runtime.jsx)('button', {
                  type: 'button',
                  style: primaryButtonStyle,
                  onClick: onConfirmStart,
                  children: t('entry.authorize'),
                }),
              ],
            }),
          ],
        });
      const inProgress =
        phase === 'pulling' ||
        phase === 'starting' ||
        phase === 'stopping' ||
        phase === 'exporting' ||
        phase === 'importing';
      if (state === 'running')
        return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(RunningCard, {
          t,
          botSlug,
          busy,
          stopping: phase === 'stopping',
          onStop,
        });
      if (inProgress)
        return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)('div', {
          style: {
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            fontSize: 12,
          },
          children: [
            /* @__PURE__ */ (0, react_jsx_runtime.jsxs)('div', {
              children: [t(PHASE_LABEL[phase] ?? 'entry.phase.working'), '…'],
            }),
            /* @__PURE__ */ (0, react_jsx_runtime.jsx)('div', {
              style: {
                position: 'relative',
                overflow: 'hidden',
                height: 6,
                borderRadius: 3,
                background: 'rgba(127,127,127,0.25)',
              },
              children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)('div', {
                style:
                  progress?.percent === void 0
                    ? {
                        position: 'absolute',
                        inset: 0,
                        background: 'var(--dsh-accent, #4d6bfe)',
                      }
                    : {
                        position: 'absolute',
                        left: 0,
                        top: 0,
                        bottom: 0,
                        width: `${String(progress.percent)}%`,
                        background: 'var(--dsh-accent, #4d6bfe)',
                      },
              }),
            }),
            /* @__PURE__ */ (0, react_jsx_runtime.jsx)('div', {
              style: terminalStyle,
              children: progress?.text ?? detail ?? t('entry.wait'),
            }),
            /* @__PURE__ */ (0, react_jsx_runtime.jsxs)('div', {
              style: { opacity: 0.5 },
              children: [
                t('entry.elapsed', { seconds: elapsed }),
                progress?.updatedAt === void 0
                  ? ''
                  : ` · ${t('entry.updated', { seconds: Math.max(0, Math.round((nowTs - progress.updatedAt) / 1e3)) })}`,
              ],
            }),
          ],
        });
      return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)('div', {
        style: {
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          fontSize: 12,
        },
        children: [
          /* @__PURE__ */ (0, react_jsx_runtime.jsx)('div', {
            style: noteStyle,
            children: error ?? detail ?? t(SHARED_NOTE_KEY),
          }),
          /* @__PURE__ */ (0, react_jsx_runtime.jsx)('button', {
            type: 'button',
            style: primaryButtonStyle,
            disabled: busy,
            onClick: onStart,
            children: busy ? t('entry.starting') : t('entry.start'),
          }),
        ],
      });
    }
    /** Bind the entry to the Computer's locale namespace once per registration. */
    function createComputerEntry(t) {
      return function ComputerEntryWithLocale(props) {
        return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ComputerEntry, {
          ...props,
          t,
        });
      };
    }
    /** Resolves the PersonaBot's display name through the BotHarness bridge. */
    function useBotDisplayName(botSlug) {
      const [name, setName] = (0, react.useState)(void 0);
      (0, react.useEffect)(() => {
        const rpc = connectionRpc;
        if (rpc === void 0 || botSlug === void 0) return () => {};
        let cancelled = false;
        rpc
          .call('/api', 'botharness/list', { args: {} })
          .then((result) => {
            if (cancelled || !result.ok) return;
            const match = (result.value.bots ?? []).find((bot) => bot.slug === botSlug);
            if (typeof match?.displayName === 'string' && match.displayName.length > 0)
              setName(match.displayName);
          })
          .catch(() => void 0);
        return () => {
          cancelled = true;
        };
      }, [botSlug]);
      return name ?? botSlug;
    }
    /** The Computer entry: Setup → Ready → Running, rendered inside the Channel sidebar. */
    function ComputerEntry({ botSlug, t }) {
      const displayName = useBotDisplayName(botSlug);
      const [payload, setPayload] = (0, react.useState)();
      const [error, setError] = (0, react.useState)();
      const [busy, setBusy] = (0, react.useState)(false);
      const [confirming, setConfirming] = (0, react.useState)(false);
      const [approved, setApproved] = (0, react.useState)(
        () => globalThis.sessionStorage?.getItem(APPROVED_KEY) === '1',
      );
      const [busySince, setBusySince] = (0, react.useState)(void 0);
      const [elapsed, setElapsed] = (0, react.useState)(0);
      const [nowTs, setNowTs] = (0, react.useState)(() => Date.now());
      const refresh = (0, react.useCallback)(async () => {
        try {
          setPayload(await requestJson(STATUS_ENDPOINT));
          setError(void 0);
        } catch (cause) {
          setError(String(cause));
        }
      }, []);
      (0, react.useEffect)(() => {
        refresh();
        const timer = setInterval(() => void refresh(), 3e3);
        return () => clearInterval(timer);
      }, [refresh]);
      const phase = payload?.status.phase;
      const inProgress =
        phase === 'pulling' ||
        phase === 'starting' ||
        phase === 'stopping' ||
        phase === 'exporting' ||
        phase === 'importing';
      (0, react.useEffect)(() => {
        if (!inProgress) {
          setBusySince(void 0);
          setElapsed(0);
          return;
        }
        setBusySince((current) => current ?? Date.now());
        const timer = setInterval(() => {
          setNowTs(Date.now());
          setBusySince((current) => {
            if (current !== void 0) setElapsed(Math.round((Date.now() - current) / 1e3));
            return current;
          });
        }, 1e3);
        return () => clearInterval(timer);
      }, [inProgress]);
      const act = (0, react.useCallback)(
        async (endpoint) => {
          setBusy(true);
          try {
            await requestJson(endpoint, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                authorize: true,
                ...(endpoint === START_ENDPOINT && typeof navigator !== 'undefined'
                  ? { language: navigator.language }
                  : {}),
              }),
            });
            await refresh();
          } catch (cause) {
            setError(String(cause));
          } finally {
            setBusy(false);
          }
        },
        [refresh],
      );
      const onStart = (0, react.useCallback)(() => {
        if (!approved) {
          setConfirming(true);
          return;
        }
        act(START_ENDPOINT);
      }, [act, approved]);
      const onConfirmStart = (0, react.useCallback)(() => {
        setConfirming(false);
        act(START_ENDPOINT);
      }, [act]);
      const onApprove = (0, react.useCallback)((remember) => {
        if (remember) {
          globalThis.sessionStorage?.setItem(APPROVED_KEY, '1');
          setApproved(true);
        }
      }, []);
      return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ComputerEntryView, {
        t,
        state: payload?.status.state ?? 'absent',
        ...(phase === void 0 ? {} : { phase }),
        ...(payload?.status.detail === void 0 ? {} : { detail: payload.status.detail }),
        ...(payload?.status.progress === void 0 ? {} : { progress: payload.status.progress }),
        runtimeAvailable: payload?.probe.available ?? true,
        confirming,
        busy,
        elapsed,
        nowTs,
        ...(error === void 0 ? {} : { error }),
        ...(displayName === void 0 ? {} : { botSlug: displayName }),
        onStart,
        onConfirmStart,
        onStop: () => void act(STOP_ENDPOINT),
        onApprove,
        onCancel: () => setConfirming(false),
      });
    }
    function apply(ctx) {
      const settingsPrefs = new ComputerSettingsPrefs();
      ctx.inject(['settingsScope'], (settingsCtx) => {
        const scope = settingsCtx.settingsScope.bind({ namespace: COMPUTER_SETTINGS_NAMESPACE });
        const release = settingsPrefs.attach(scope);
        return () => {
          release();
        };
      });
      ctx.inject(['uiWorkspace', 'slots'], (workspaceCtx) => {
        const workspace = workspaceCtx.uiWorkspace;
        const face = createComputerSettingsFace({
          prefs: settingsPrefs,
          pickDirectory: workspace?.pickDirectory,
        });
        workspaceCtx.slots.inject('botharness.settings.item', () =>
          workspaceCtx.slots.register(
            {
              name: 'botharness.settings.item',
              id: 'computer',
              order: 10,
              locale: LOCALE_NS,
              inject: () => face,
            },
            ComputerSettingsRows,
          ),
        );
      });
      ctx.effect(() => {
        if (typeof document === 'undefined') return () => {};
        const style = document.createElement('style');
        style.setAttribute('data-botharness-computer', 'client');
        style.textContent = SPIN_STYLE;
        document.head.appendChild(style);
        return () => {
          style.remove();
        };
      }, 'botharness-computer: client styles');
      const t = ctx.locale.bind(LOCALE_NS);
      ctx.effect(
        () =>
          ctx.locale.register(LOCALE_NS, {
            zh,
            en,
          }),
        'botharness-computer: dictionaries',
      );
      ctx.inject(['channelSidebar', 'connection'], (sidebarCtx) => {
        const registry = sidebarCtx.channelSidebar;
        connectionRpc = sidebarCtx.connection?.rpc;
        if (registry === void 0) return;
        ctx.effect(
          () =>
            registry.register({
              id: ENTRY_ID,
              label: t('entry.label'),
              order: 40,
              scope: 'personabot',
              component: createComputerEntry(t),
            }),
          'botharness-computer: channel sidebar entry',
        );
      });
    }
    //#endregion
    exports.ComputerEntryView = ComputerEntryView;
    exports.ScreenIndicator = ScreenIndicator;
    exports.apply = apply;
    exports.createComputerEntry = createComputerEntry;
    exports.inject = inject;
    exports.name = name;
    return module.exports;
  },
});

//# sourceMappingURL=client.js.map
