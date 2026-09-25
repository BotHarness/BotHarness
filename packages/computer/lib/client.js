window.__ModuleLoader__.load({
	id: "@botharness/computer",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region packages/computer/src/client/viewer-state.ts
		/**
		* The overlay target for an action: open targets the fullscreen overlay,
		* collapse targets the resting entry. Fullscreen exits through the toolbar
		* collapse button only — there is intentionally no Escape shortcut.
		*/
		function nextExpanded(action) {
			return action === "open";
		}
		/** StateDot semantics for a phase (done / blue ring / red). */
		function dotStateFor(phase) {
			if (phase === "live") return "done";
			if (phase === "empty") return "error";
			return "ongoing";
		}
		/** Locale key for the title-bar/overlay status text. */
		function statusKeyFor(phase, reconnecting) {
			if (phase === "live") return "entry.live";
			if (phase === "empty") return "entry.noScreen";
			return reconnecting ? "entry.reconnecting" : "entry.connecting";
		}
		/** Locale key for the stop control (shared by the title bar and the card row). */
		function stopKey(busy, stopping) {
			return busy || stopping ? "entry.stopping" : "entry.stop";
		}
		/**
		* Bare container exit reports ("exited code=137") are machine noise from a
		* normal stop — the start view shows the friendly shared note instead, while
		* real server details and client errors still surface.
		*/
		const EXIT_REPORT = /^exited code=\d+$/;
		function isExitReport(detail) {
			return detail !== void 0 && EXIT_REPORT.test(detail);
		}
		/** Selkies' dedicated connection status line (a stable id, not minified). */
		const STATUS_ELEMENT_ID = "status-display";
		/**
		* Substrings of a busy upstream: the connecting screen, the disconnect
		* retry, and failure states. Scoped to `#status-display` only, so sidebar
		* copy (e.g. a Reconnect button) can never trip it. Note "Connected" matches
		* none of these — `connecting` is deliberately not truncated to `connect`.
		*/
		const BUSY_TEXT = /connecting|reconnect|disconnect|failed|error/i;
		/** FNV-1a over raw bytes; the pixel-change detector below. */
		function hashBytes(data) {
			let hash = 2174524869;
			for (let index = 0; index < data.length; index += 1) {
				hash ^= data[index] ?? 0;
				hash = Math.imul(hash, 16777619);
			}
			return hash >>> 0;
		}
		/**
		* Whether Selkies itself reports busy. False when the status element is
		* absent (unknown page), hidden, or showing a non-busy state — never throws,
		* so a cross-origin or exotic document degrades to "quiet".
		*/
		function upstreamBusy(doc) {
			try {
				const element = doc?.getElementById(STATUS_ELEMENT_ID);
				if (element === null || element === void 0) return false;
				if (element.classList.contains("hidden")) return false;
				return BUSY_TEXT.test(element.textContent ?? "");
			} catch {
				return false;
			}
		}
		function signatureOf(doc, surface) {
			try {
				const scratch = doc.createElement("canvas");
				scratch.width = 16;
				scratch.height = 16;
				const context = scratch.getContext("2d", { willReadFrequently: true });
				if (context === null) return void 0;
				context.drawImage(surface, 0, 0, 16, 16);
				return hashBytes(context.getImageData(0, 0, 16, 16).data);
			} catch {
				return;
			}
		}
		/**
		* Observes one frame of the viewer document: canvas size (the pre-#221
		* signal), Selkies' own busy line, and a 16x16 pixel signature for change
		* detection. Never throws; unreadable pixels degrade to `signature`
		* undefined (the caller falls back to the sized-only signal).
		*/
		function sampleSurface(doc) {
			const busy = upstreamBusy(doc);
			let sized = false;
			let signature;
			try {
				const surface = doc?.getElementById("videoCanvas");
				const videoWidth = surface?.videoWidth;
				const canvasWidth = surface?.width;
				sized = surface !== null && surface !== void 0 && (typeof videoWidth === "number" ? videoWidth : typeof canvasWidth === "number" ? canvasWidth : 0) > 0;
				if (sized && surface !== null && surface !== void 0 && doc !== null && doc !== void 0) signature = signatureOf(doc, surface);
			} catch {
				signature = void 0;
			}
			return signature === void 0 ? {
				sized,
				busy
			} : {
				sized,
				busy,
				signature
			};
		}
		function withSignature(base, signature) {
			return signature === void 0 ? { ...base } : {
				...base,
				lastSignature: signature
			};
		}
		function withPreviousSignature(base, prev) {
			return prev.lastSignature === void 0 ? { ...base } : {
				...base,
				lastSignature: prev.lastSignature
			};
		}
		/**
		* Remount the viewer after a loss only once the loss persists: a single
		* missed tick (GC pause, slow first frame) must not restart the whole SPA —
		* that churn is what kept post-start sessions from ever settling.
		*/
		function shouldRemountLoss(lossStreak) {
			return lossStreak >= 3;
		}
		/**
		* Remount a bounded number of times when the document never went live at
		* all: the first load most likely failed while the server was still booting
		* (proxy 503/connection-refused serves a dead error page no tick can
		* recover). Beyond the bound the manual retry stays.
		*/
		function shouldAutoReload(phase, everLive, attempts) {
			return phase === "empty" && !everLive && attempts < 3;
		}
		/**
		* Projects one tick into the overlay phase:
		* - unsized ticks never go live and age the miss budget (a dead first
		*   document reaches empty fast, where auto-reload can rescue it);
		* - upstream-busy ticks never go live but age a separate, patient budget, so
		*   post-start negotiation flapping rides in connecting instead of forcing a
		*   manual retry; the pixel baseline is preserved across them;
		* - a changed signature goes live immediately (second tick at the latest);
		* - unreadable pixels degrade to the old sized-only signal;
		* - a quiet, sized, static surface goes live after QUIET_TOLERANCE (a real
		*   desktop idling) and gives up to empty after QUIET_ABANDON.
		*/
		function nextStreamTracker(prev, sample) {
			const signature = sample.signature;
			if (!sample.sized) {
				const misses = prev.misses + 1;
				return {
					tracker: withSignature({
						misses,
						busyStreak: 0,
						quiet: 0
					}, signature),
					phase: misses >= 6 ? "empty" : "connecting"
				};
			}
			if (sample.busy) {
				const busyStreak = prev.busyStreak + 1;
				return {
					tracker: withPreviousSignature({
						misses: prev.misses,
						busyStreak,
						quiet: 0
					}, prev),
					phase: busyStreak >= 30 ? "empty" : "connecting"
				};
			}
			if (signature !== void 0 && prev.lastSignature !== void 0 && signature !== prev.lastSignature) return {
				tracker: withSignature({
					misses: 0,
					busyStreak: 0,
					quiet: 0
				}, signature),
				phase: "live"
			};
			if (signature === void 0) return {
				tracker: {
					misses: 0,
					busyStreak: 0,
					quiet: 0
				},
				phase: "live"
			};
			const quiet = prev.quiet + 1;
			if (quiet >= 120) return {
				tracker: withSignature({
					misses: 6,
					busyStreak: 0,
					quiet
				}, signature),
				phase: "empty"
			};
			if (quiet >= 4) return {
				tracker: withSignature({
					misses: 0,
					busyStreak: 0,
					quiet
				}, signature),
				phase: "live"
			};
			return {
				tracker: withSignature({
					misses: prev.misses,
					busyStreak: 0,
					quiet
				}, signature),
				phase: "connecting"
			};
		}
		//#endregion
		//#region packages/computer/src/client/viewer-events.ts
		/** Endpoint owning the bounded diagnostics ring (300 chars per detail). */
		const VIEWER_EVENT_ENDPOINT = "/api/computer/diagnostics/viewer";
		/** Stable machine-parseable line for one event. */
		function viewerEventText(event) {
			switch (event.type) {
				case "mount": return "viewer mount docked";
				case "overlay": return event.open ? "viewer overlay open" : "viewer overlay closed";
				case "phase": return `viewer phase ${event.from}>${event.to}`;
				case "auto-reload": return `viewer auto-reload attempt=${String(event.attempt)}`;
				case "manual-retry": return "viewer manual-retry";
				case "loss-remount": return `viewer loss-remount streak=${String(event.streak)}`;
			}
		}
		/**
		* Fire-and-forget post to the diagnostics route. Never throws — observability
		* must not break the viewer — and defaults to the global fetch so call sites
		* stay one argument.
		*/
		async function reportViewerEvent(fetchImpl, detail) {
			try {
				await (fetchImpl ?? fetch)(VIEWER_EVENT_ENDPOINT, {
					method: "POST",
					credentials: "same-origin",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ detail })
				});
			} catch {}
		}
		//#endregion
		//#region packages/computer/src/client/locale.ts
		/** Locale namespace owning the Computer client's copy. */
		const LOCALE_NS = "botharness-computer";
		/** Simplified Chinese dictionary and the key-set source of truth. */
		const zh = {
			"entry.label": "电脑",
			"entry.screen.title": "{name} 的屏幕",
			"entry.shared": "这台电脑由本 profile 的所有 PersonaBot 共享：各自拥有自己的窗口，共享登录态与文件。",
			"entry.start": "启动",
			"entry.starting": "启动中…",
			"entry.stop": "停止",
			"entry.stopping": "停止中…",
			"entry.reconnect": "重新连接",
			"entry.connecting": "连接中",
			"entry.reconnecting": "正在重新连接",
			"entry.live": "已连接",
			"entry.noScreen": "暂无画面",
			"entry.openFullscreen": "打开大屏",
			"entry.collapseFullscreen": "收起全屏",
			"entry.recentLogs": "近期动态",
			"entry.recentLogs.empty": "暂无运行记录",
			"entry.recentLogs.failed": "读取运行记录失败",
			"entry.authorize": "授权并启动",
			"entry.cancel": "取消",
			"entry.remember": "本次会话内不再询问",
			"entry.authorizeIntro": "启动会在你的机器上执行：",
			"entry.authorize.probe": "检测本机容器运行时；缺失时只给安装引导，不会自动安装",
			"entry.authorize.volume": "创建/复用持久卷（登录态与文件保留在这台电脑上）",
			"entry.authorize.pull": "拉取镜像（首次约 1.2 GB 网络流量）并创建容器",
			"entry.authorize.bind": "把 Web VNC 绑定到 127.0.0.1 的本地端口，仅本机可访问",
			"entry.authorize.storage": "存储位置：{target}",
			"entry.authorize.storageBindRisk": "Bind mount 把浏览器 profile（含 SQLite 与缓存）直接落在宿主目录；在 Docker Desktop / Colima 等虚拟文件共享下文件锁不可靠，可能损坏数据，仅建议 Linux 原生 Docker 使用。详见 Docker 文档：https://docs.docker.com/storage/bind-mounts/",
			"entry.phase.pulling": "正在拉取镜像",
			"entry.phase.starting": "正在启动",
			"entry.phase.stopping": "正在停止",
			"entry.phase.exporting": "正在导出",
			"entry.phase.importing": "正在导入",
			"entry.phase.working": "处理中",
			"entry.wait": "请稍候",
			"entry.elapsed": "已用时 {seconds}s",
			"entry.updated": "最后更新 {seconds}s 前",
			"entry.setup": "未检测到容器运行时。任选其一安装后重试：\n\nColima（推荐，MIT）：\n  brew install colima docker\n  brew services start colima\n\n或 Docker Desktop：https://www.docker.com/products/docker-desktop/",
			"section.title": "Computer",
			"section.description": "导出目录、空闲停止与导出 / 导入",
			"rows.exportDir.title": "Computer 导出目录",
			"rows.exportDir.current": "当前：{dir}",
			"rows.exportDir.empty": "未配置时使用默认导出目录",
			"rows.exportDir.pick": "选择…",
			"rows.exportDir.manual": "手动输入路径",
			"rows.exportDir.save": "保存",
			"rows.exportDir.saving": "正在保存…",
			"rows.exportDir.saved": "导出目录已保存：{dir}",
			"rows.exportDir.needsAbsolute": "路径必须是绝对路径，例如 /path/to/exports",
			"rows.exportDir.saveRejected": "Host 未接受该导出目录，已恢复原值；请重试",
			"rows.exportDir.open": "打开目录",
			"rows.idle.title": "空闲停止",
			"rows.idle.description": "无观看者时 Computer 自动停止的等待时间",
			"rows.idle.minutes": "{minutes} 分钟",
			"rows.exportSection.title": "导出",
			"rows.exportSection.description": "把 Computer 的持久存储打包成一个归档",
			"rows.importSection.title": "导入",
			"rows.importSection.description": "从归档恢复 Computer",
			"rows.export": "导出",
			"rows.exporting": "导出中…",
			"rows.download": "下载",
			"rows.exportTo": "导出到…",
			"rows.authorizeExport": "授权并导出",
			"rows.import": "导入…",
			"rows.importing": "导入中…",
			"rows.chooseFile": "选择归档文件…",
			"rows.cancelImport": "取消导入",
			"rows.authorizeImportConfirm": "授权并导入",
			"rows.exported": "已导出：{archive}",
			"rows.exportedDone": "导出完成。",
			"rows.imported": "已从 {file} 导入并重启 Computer。",
			"rows.noArchives": "该目录还没有归档；先导出一次。",
			"rows.noSettings": "设置服务不可用：可以导出/导入，但无法修改目录与空闲时间。",
			"rows.pickerFallback": "目录选择器不可用，已使用当前导出目录：{dir}"
		};
		/** English dictionary; same keys as the Chinese one. */
		const en = {
			"entry.label": "Computer",
			"entry.screen.title": "{name}'s screen",
			"entry.shared": "This Computer is shared by every PersonaBot in the profile: each keeps its own window and they share logins and files.",
			"entry.start": "Start",
			"entry.starting": "Starting…",
			"entry.stop": "Stop",
			"entry.stopping": "Stopping…",
			"entry.reconnect": "Reconnect",
			"entry.connecting": "Connecting",
			"entry.reconnecting": "Reconnecting",
			"entry.live": "Connected",
			"entry.noScreen": "No picture",
			"entry.openFullscreen": "Open fullscreen",
			"entry.collapseFullscreen": "Leave fullscreen",
			"entry.recentLogs": "Recent activity",
			"entry.recentLogs.empty": "No operational records yet",
			"entry.recentLogs.failed": "Could not load operational records",
			"entry.authorize": "Authorize and start",
			"entry.cancel": "Cancel",
			"entry.remember": "Don't ask again in this session",
			"entry.authorizeIntro": "Starting runs these steps on your machine:",
			"entry.authorize.probe": "Detect the local container runtime; a missing one only gets setup guidance, never an automatic install",
			"entry.authorize.volume": "Create or reuse the persistent volume (logins and files stay on this Computer)",
			"entry.authorize.pull": "Pull the image (about 1.2 GB the first time) and create the container",
			"entry.authorize.bind": "Bind the web VNC endpoint to a loopback port, reachable only from this machine",
			"entry.authorize.storage": "Storage location: {target}",
			"entry.authorize.storageBindRisk": "A bind mount places the browser profile (including SQLite and caches) directly on a host directory; file locking over virtual filesystem sharing (Docker Desktop, Colima, …) is unreliable and can corrupt data — recommended only for native Linux Docker. See the Docker docs: https://docs.docker.com/storage/bind-mounts/",
			"entry.phase.pulling": "Pulling the image",
			"entry.phase.starting": "Starting",
			"entry.phase.stopping": "Stopping",
			"entry.phase.exporting": "Exporting",
			"entry.phase.importing": "Importing",
			"entry.phase.working": "Working",
			"entry.wait": "Please wait",
			"entry.elapsed": "Elapsed {seconds}s",
			"entry.updated": "Last update {seconds}s ago",
			"entry.setup": "No container runtime found. Install one of these, then retry:\n\nColima (recommended, MIT):\n  brew install colima docker\n  brew services start colima\n\nOr Docker Desktop: https://www.docker.com/products/docker-desktop/",
			"section.title": "Computer",
			"section.description": "Export directory, idle stop, and export / import",
			"rows.exportDir.title": "Computer export directory",
			"rows.exportDir.current": "Current: {dir}",
			"rows.exportDir.empty": "Uses the default export directory when none is set",
			"rows.exportDir.pick": "Choose…",
			"rows.exportDir.manual": "Type a path",
			"rows.exportDir.save": "Save",
			"rows.exportDir.saving": "Saving…",
			"rows.exportDir.saved": "Export directory saved: {dir}",
			"rows.exportDir.needsAbsolute": "Path must be absolute, e.g. /path/to/exports",
			"rows.exportDir.saveRejected": "The Host did not accept the export directory — the previous value was restored; try again",
			"rows.exportDir.open": "Open folder",
			"rows.idle.title": "Idle stop",
			"rows.idle.description": "How long the Computer waits without viewers before stopping",
			"rows.idle.minutes": "{minutes} min",
			"rows.exportSection.title": "Export",
			"rows.exportSection.description": "Pack the Computer's persistent store into one archive",
			"rows.importSection.title": "Import",
			"rows.importSection.description": "Restore the Computer from an archive",
			"rows.export": "Export",
			"rows.exporting": "Exporting…",
			"rows.download": "Download",
			"rows.exportTo": "Export to…",
			"rows.authorizeExport": "Authorize and export",
			"rows.import": "Import…",
			"rows.importing": "Importing…",
			"rows.chooseFile": "Choose archive file…",
			"rows.cancelImport": "Cancel import",
			"rows.authorizeImportConfirm": "Authorize and import",
			"rows.exported": "Exported: {archive}",
			"rows.exportedDone": "Export complete.",
			"rows.imported": "Imported {file} and restarted the Computer.",
			"rows.noArchives": "No archives in that directory yet — export once first.",
			"rows.noSettings": "Settings service unavailable: export and import still work, but the directory and idle time cannot be changed.",
			"rows.pickerFallback": "Directory picker unavailable — using the current export directory: {dir}"
		};
		/**
		* Server-reported phase → the locale key shown while it runs. Shared by the
		* sidebar entry card and the settings rows so both surfaces label a transfer
		* the same way.
		*/
		const PHASE_LABEL = {
			pulling: "entry.phase.pulling",
			starting: "entry.phase.starting",
			stopping: "entry.phase.stopping",
			exporting: "entry.phase.exporting",
			importing: "entry.phase.importing"
		};
		//#endregion
		//#region packages/computer/src/settings.ts
		/**
		* Runtime-editable Computer configuration, shared by the Host settings
		* registration and the browser scope. Kept free of schemastery so the client
		* bundle pulls only constants and types.
		*/
		/** Settings namespace owning the Computer's runtime-editable fields. */
		const COMPUTER_SETTINGS_NAMESPACE = "botharness-computer";
		/** Field carrying the directory that holds Computer exports. */
		const COMPUTER_EXPORT_DIR_FIELD = "exportDir";
		/** Field carrying the idle stop minutes. */
		const COMPUTER_IDLE_STOP_FIELD = "idleStopMinutes";
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
		/** Thrown when the Host rolls the export directory back instead of storing it. */
		var ExportDirRejectedError = class extends Error {
			constructor() {
				super("the Host did not accept the export directory");
				this.name = "ExportDirRejectedError";
			}
		};
		/**
		* Directory shown on the export row: a configured scope value wins; while the
		* scope is empty (the unconfigured default) fall back to the Host-resolved
		* path from the status route, so buttons and "Current" track what export and
		* open-dir will actually use.
		*/
		function displayExportDir(configured, hostDir) {
			return configured !== "" ? configured : hostDir ?? "";
		}
		/** Live Computer settings published to the rows. */
		var ComputerSettingsPrefs = class {
			snapshot = {
				exportDir: "",
				idleStopMinutes: 30,
				status: "loading",
				writable: false
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
			async setExportDir(exportDir) {
				if (this.scope === void 0) throw new ExportDirRejectedError();
				this.publish({ exportDir });
				await this.scope.set(COMPUTER_EXPORT_DIR_FIELD, exportDir);
				if (this.snapshot.exportDir !== exportDir) throw new ExportDirRejectedError();
			}
			setIdleStopMinutes(idleStopMinutes) {
				this.publish({ idleStopMinutes });
				this.scope?.set(COMPUTER_IDLE_STOP_FIELD, idleStopMinutes).catch(() => void 0);
			}
			publish(patch) {
				this.snapshot = {
					...this.snapshot,
					...patch
				};
				for (const listener of this.listeners) listener();
			}
			sync() {
				const scope = this.scope;
				if (scope === void 0) return;
				const next = scope.getSnapshot();
				const value = next.value;
				this.snapshot = {
					exportDir: value?.exportDir ?? "",
					idleStopMinutes: value?.idleStopMinutes ?? 30,
					status: next.status,
					writable: next.writable
				};
				for (const listener of this.listeners) listener();
			}
		};
		const IDLE_OPTIONS = [
			15,
			30,
			60,
			120,
			240
		];
		const EXPORT_ENDPOINT = "/api/computer/export";
		const IMPORT_ENDPOINT = "/api/computer/import";
		const EXPORTS_ENDPOINT = "/api/computer/exports";
		const STATUS_ENDPOINT$1 = "/api/computer/status";
		const OPEN_DIR_ENDPOINT = "/api/computer/open-dir";
		const DOWNLOAD_ENDPOINT = "/api/computer/download";
		const UPLOAD_ENDPOINT = "/api/computer/upload";
		const UPLOAD_CONTENT_ENDPOINT = "/api/computer/upload-content";
		async function requestJson$1(url, init) {
			const response = await fetch(url, {
				credentials: "same-origin",
				...init
			});
			if (!response.ok) throw new Error(`${String(response.status)} ${await response.text()}`);
			return await response.json();
		}
		async function postAuthorized(url, body = {}) {
			await requestJson$1(url, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					authorize: true,
					...body
				})
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
				pickDirectory: async () => options.pickDirectory === void 0 ? null : options.pickDirectory(),
				openDirectory: async (dir) => {
					await postAuthorized(OPEN_DIR_ENDPOINT, dir === "" ? {} : { dir });
				},
				exportArchive: async (dir) => {
					const payload = await requestJson$1(EXPORT_ENDPOINT, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify(dir === void 0 || dir === "" ? { authorize: true } : {
							authorize: true,
							dir
						})
					});
					return {
						archive: payload.archive ?? "",
						...payload.downloadToken === void 0 ? {} : { downloadToken: payload.downloadToken }
					};
				},
				downloadUrl: (downloadToken) => `${DOWNLOAD_ENDPOINT}?token=${encodeURIComponent(downloadToken)}`,
				importArchive: async (file) => {
					await postAuthorized(IMPORT_ENDPOINT, { file });
				},
				requestUpload: async (file) => {
					const payload = await requestJson$1(UPLOAD_ENDPOINT, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({
							authorize: true,
							file
						})
					});
					if (payload.uploadToken === void 0) throw new Error("upload not accepted");
					return payload.uploadToken;
				},
				sendUploadBytes: (uploadToken, file) => new Promise((resolve, reject) => {
					const xhr = (options.createXhr ?? (() => new XMLHttpRequest()))();
					xhr.open("POST", `${UPLOAD_CONTENT_ENDPOINT}?token=${encodeURIComponent(uploadToken)}`);
					xhr.withCredentials = true;
					xhr.setRequestHeader("content-type", "application/octet-stream");
					xhr.onload = () => {
						if (xhr.status !== 200) {
							reject(/* @__PURE__ */ new Error(`upload failed: HTTP ${String(xhr.status)}`));
							return;
						}
						try {
							const payload = JSON.parse(xhr.responseText);
							if (payload.ok === true) resolve();
							else reject(new Error(typeof payload.error === "string" ? payload.error : "upload failed"));
						} catch (error) {
							reject(error instanceof Error ? error : new Error(String(error)));
						}
					};
					xhr.onerror = () => reject(/* @__PURE__ */ new Error("upload transport failed"));
					xhr.send(file);
				}),
				listArchives: async () => {
					return (await requestJson$1(EXPORTS_ENDPOINT)).files ?? [];
				},
				hostExportDir: async () => {
					return (await requestJson$1(STATUS_ENDPOINT$1)).exportDir ?? "";
				}
			};
		}
		function Row({ title, description, children }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "bh-settings-row",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "bh-settings-row-text",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "bh-settings-row-title",
						children: title
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "bh-settings-row-desc",
						children: description
					})]
				}), children]
			});
		}
		function Selector({ label, open, onToggle, disabled }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
				type: "button",
				className: "bh-settings-selector",
				"aria-haspopup": "menu",
				"aria-expanded": open,
				disabled: disabled === true,
				onClick: onToggle,
				children: [label, /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronDownOutlineRegular, { className: "bh-settings-chevron" })]
			});
		}
		/** The Computer group inside the BotHarness settings page. */
		function ComputerSettingsRows({ t, prefs, pickerAvailable, pickDirectory, openDirectory, exportArchive, downloadUrl, importArchive, requestUpload, sendUploadBytes, listArchives, hostExportDir }) {
			const [snapshot, setSnapshot] = (0, react.useState)(prefs.getSnapshot);
			const [idleOpen, setIdleOpen] = (0, react.useState)(false);
			const [importOpen, setImportOpen] = (0, react.useState)(false);
			const [archives, setArchives] = (0, react.useState)(void 0);
			const [busy, setBusy] = (0, react.useState)(void 0);
			const [confirming, setConfirming] = (0, react.useState)(void 0);
			const [exportTarget, setExportTarget] = (0, react.useState)(void 0);
			const [manualOpen, setManualOpen] = (0, react.useState)(false);
			const [manualPath, setManualPath] = (0, react.useState)("");
			const [saving, setSaving] = (0, react.useState)(false);
			const [dirNote, setDirNote] = (0, react.useState)(void 0);
			const [transferNote, setTransferNote] = (0, react.useState)(void 0);
			const [download, setDownload] = (0, react.useState)(void 0);
			const [uploadName, setUploadName] = (0, react.useState)(void 0);
			const uploadFile = (0, react.useRef)(null);
			const [pickerBroken, setPickerBroken] = (0, react.useState)(false);
			const [hostDir, setHostDir] = (0, react.useState)(void 0);
			const [livePhase, setLivePhase] = (0, react.useState)(void 0);
			const [liveElapsed, setLiveElapsed] = (0, react.useState)(0);
			(0, react.useEffect)(() => prefs.subscribe(() => setSnapshot(prefs.getSnapshot())), [prefs]);
			(0, react.useEffect)(() => {
				if (snapshot.status !== "unavailable" && snapshot.exportDir !== "") return;
				hostExportDir().then((dir) => setHostDir(dir)).catch(() => void 0);
			}, [
				hostExportDir,
				snapshot.status,
				snapshot.exportDir
			]);
			(0, react.useEffect)(() => {
				if (busy === void 0) {
					setLivePhase(void 0);
					setLiveElapsed(0);
					return;
				}
				const startedAt = Date.now();
				let cancelled = false;
				const tick = async () => {
					if (cancelled) return;
					setLiveElapsed(Math.round((Date.now() - startedAt) / 1e3));
					try {
						const payload = await requestJson$1(STATUS_ENDPOINT$1);
						if (!cancelled) setLivePhase(payload.status?.phase);
					} catch {}
				};
				tick();
				const timer = setInterval(() => void tick(), 1e3);
				return () => {
					cancelled = true;
					clearInterval(timer);
				};
			}, [busy]);
			const phaseKey = livePhase === void 0 ? void 0 : PHASE_LABEL[livePhase];
			const exportDir = displayExportDir(snapshot.exportDir, hostDir);
			const hasDir = exportDir !== "";
			const writable = snapshot.status === "ready" && snapshot.writable;
			const canAdjust = pickerAvailable && !pickerBroken;
			const pickDirectoryInto = (0, react.useCallback)((apply) => {
				pickDirectory().then((dir) => {
					if (dir !== null) apply(dir);
				}).catch(() => {
					setPickerBroken(true);
					setManualOpen(false);
					setDirNote(t("rows.pickerFallback", { dir: exportDir }));
				});
			}, [
				exportDir,
				pickDirectory,
				t
			]);
			const pickExportDir = (0, react.useCallback)(() => {
				pickDirectoryInto((dir) => {
					setManualPath(dir);
					setDirNote(void 0);
					prefs.setExportDir(dir).catch((error) => setDirNote(String(error)));
				});
			}, [pickDirectoryInto, prefs]);
			const startExport = (0, react.useCallback)(() => {
				if (!canAdjust) {
					setExportTarget(void 0);
					setConfirming("export");
					return;
				}
				pickDirectory().then((dir) => {
					if (dir === null) return;
					setExportTarget(dir);
					setConfirming("export");
				}).catch(() => {
					setPickerBroken(true);
					setManualOpen(false);
					setDirNote(t("rows.pickerFallback", { dir: exportDir }));
					setExportTarget(void 0);
					setConfirming("export");
				});
			}, [
				canAdjust,
				exportDir,
				pickDirectory,
				t
			]);
			const saveManualPath = (0, react.useCallback)(() => {
				const dir = manualPath.trim();
				if (dir === "") return;
				if (!dir.startsWith("/") && !/^[A-Za-z]:[\\/]/u.test(dir)) {
					setDirNote(t("rows.exportDir.needsAbsolute"));
					return;
				}
				setSaving(true);
				setDirNote(void 0);
				prefs.setExportDir(dir).then(() => {
					setManualOpen(false);
					setDirNote(t("rows.exportDir.saved", { dir }));
				}).catch((error) => setDirNote(error instanceof ExportDirRejectedError ? t("rows.exportDir.saveRejected") : String(error))).finally(() => setSaving(false));
			}, [
				manualPath,
				prefs,
				t
			]);
			const runExport = (0, react.useCallback)(() => {
				const autoOpen = !canAdjust;
				setConfirming(void 0);
				setBusy("export");
				setTransferNote(void 0);
				setDownload(void 0);
				exportArchive(exportTarget).then(({ archive, downloadToken }) => {
					setTransferNote(archive === "" ? t("rows.exportedDone") : t("rows.exported", { archive }));
					if (archive !== "" && downloadToken !== void 0) setDownload({
						archive,
						token: downloadToken
					});
					if (autoOpen) openDirectory(exportDir).catch(() => void 0);
				}).catch((error) => setTransferNote(String(error))).finally(() => setBusy(void 0));
			}, [
				canAdjust,
				exportArchive,
				exportDir,
				exportTarget,
				openDirectory,
				t
			]);
			const runImport = (0, react.useCallback)((file) => {
				setImportOpen(false);
				setConfirming(void 0);
				setBusy("import");
				setTransferNote(void 0);
				importArchive(file).then(() => setTransferNote(t("rows.imported", { file }))).catch((error) => setTransferNote(String(error))).finally(() => setBusy(void 0));
			}, [importArchive, t]);
			const takeUploadFile = (0, react.useCallback)((file) => {
				if (file === null) return;
				uploadFile.current = file;
				setUploadName(file.name);
				setTransferNote(void 0);
			}, []);
			const runUpload = (0, react.useCallback)(() => {
				const file = uploadFile.current;
				const name = uploadName;
				if (file === null || name === void 0) return;
				setConfirming(void 0);
				setBusy("upload");
				setTransferNote(void 0);
				requestUpload(name).then((token) => sendUploadBytes(token, file)).then(() => importArchive(name)).then(() => {
					setTransferNote(t("rows.imported", { file: name }));
					setUploadName(void 0);
					uploadFile.current = null;
				}).catch((error) => setTransferNote(String(error))).finally(() => setBusy(void 0));
			}, [
				uploadName,
				requestUpload,
				sendUploadBytes,
				importArchive,
				t
			]);
			const openImport = (0, react.useCallback)(() => {
				listArchives().then((files) => {
					setArchives(files);
					setImportOpen(true);
					if (files.length === 0) setTransferNote(t("rows.noArchives"));
				}).catch((error) => setTransferNote(String(error)));
			}, [listArchives, t]);
			const openDir = (0, react.useCallback)(() => {
				openDirectory(exportDir).catch((error) => setDirNote(String(error)));
			}, [exportDir, openDirectory]);
			const selectedFile = uploadName ?? (confirming === "import" ? archives?.[0] : void 0);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "bh-settings-rows",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "bh-settings-section-head",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "bh-settings-section-title",
							children: t("section.title")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "bh-settings-section-desc",
							children: t("section.description")
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Row, {
						title: t("rows.exportDir.title"),
						description: hasDir ? t("rows.exportDir.current", { dir: exportDir }) : t("rows.exportDir.empty"),
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: {
								display: "flex",
								gap: 8,
								alignItems: "center",
								flexWrap: "wrap"
							},
							children: [
								canAdjust ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
									type: "button",
									className: "bh-settings-selector",
									disabled: !writable,
									onClick: pickExportDir,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconFolderOpenOutlineRegular, { size: 14 }), t("rows.exportDir.pick")]
								}) : null,
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: "bh-settings-selector",
									disabled: !hasDir,
									onClick: openDir,
									children: t("rows.exportDir.open")
								}),
								canAdjust ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: "bh-settings-selector",
									disabled: !writable,
									onClick: () => {
										setManualOpen((value) => !value);
										setManualPath(exportDir);
									},
									children: t("rows.exportDir.manual")
								}) : null
							]
						})
					}),
					manualOpen && canAdjust ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "bh-settings-row",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "bh-settings-row-text",
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								className: "bh-settings-input",
								value: manualPath,
								placeholder: "/absolute/path",
								"aria-label": t("rows.exportDir.manual"),
								onChange: (event) => {
									setManualPath(event.target.value);
								}
							})
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: "bh-settings-selector",
							disabled: !writable || saving || manualPath.trim() === "",
							onClick: saveManualPath,
							children: saving ? t("rows.exportDir.saving") : t("rows.exportDir.save")
						})]
					}) : null,
					dirNote === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "bh-note",
						children: dirNote
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Row, {
						title: t("rows.idle.title"),
						description: t("rows.idle.description"),
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Menu, {
							open: idleOpen,
							portal: true,
							align: "end",
							items: IDLE_OPTIONS.map((minutes) => ({
								id: String(minutes),
								label: t("rows.idle.minutes", { minutes })
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
								label: t("rows.idle.minutes", { minutes: snapshot.idleStopMinutes }),
								open: idleOpen,
								disabled: !writable,
								onToggle: () => {
									setIdleOpen((value) => !value);
								}
							})
						})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Row, {
						title: t("rows.exportSection.title"),
						description: t("rows.exportSection.description"),
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: {
								display: "flex",
								gap: 8,
								alignItems: "center",
								flexWrap: "wrap"
							},
							children: [confirming === "export" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "bh-settings-selector",
								onClick: () => {
									setConfirming(void 0);
								},
								children: t("entry.cancel")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "bh-settings-selector",
								onClick: runExport,
								children: t("rows.authorizeExport")
							})] }) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "bh-settings-selector",
								disabled: !hasDir || busy !== void 0,
								onClick: startExport,
								children: busy === "export" ? t("rows.exporting") : canAdjust ? t("rows.exportTo") : t("rows.export")
							}), download === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "bh-settings-selector",
								onClick: () => {
									globalThis.location?.assign(downloadUrl(download.token));
								},
								children: t("rows.download")
							})]
						})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Row, {
						title: t("rows.importSection.title"),
						description: t("rows.importSection.description"),
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: {
								display: "flex",
								gap: 8,
								alignItems: "center",
								flexWrap: "wrap"
							},
							children: [
								uploadName !== void 0 ? null : confirming === "import" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: "bh-settings-selector",
									onClick: () => {
										setConfirming(void 0);
									},
									children: t("rows.cancelImport")
								}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Menu, {
									open: importOpen,
									portal: true,
									align: "end",
									items: (archives ?? []).map((file) => ({
										id: file,
										label: file
									})),
									onSelect: (id) => {
										setConfirming("import");
										setArchives([id]);
									},
									onClose: () => {
										setImportOpen(false);
									},
									anchor: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Selector, {
										label: busy === "import" ? t("rows.importing") : t("rows.import"),
										open: importOpen,
										disabled: !hasDir || busy !== void 0,
										onToggle: openImport
									})
								}),
								uploadName === void 0 && confirming === "import" && archives?.[0] !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: "bh-settings-selector",
									disabled: busy !== void 0,
									onClick: () => {
										const file = archives[0];
										if (file !== void 0) runImport(file);
									},
									children: t("rows.authorizeImportConfirm")
								}) : null,
								uploadName !== void 0 || confirming === "import" ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
									className: "bh-settings-selector",
									children: [t("rows.chooseFile"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										type: "file",
										accept: ".tar,application/x-tar",
										hidden: true,
										disabled: busy !== void 0,
										onChange: (event) => {
											const file = event.target.files?.[0] ?? null;
											event.target.value = "";
											takeUploadFile(file);
										}
									})]
								}),
								uploadName === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: "bh-settings-selector",
									onClick: () => {
										setUploadName(void 0);
										uploadFile.current = null;
									},
									children: t("entry.cancel")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: "bh-settings-selector",
									disabled: busy !== void 0,
									onClick: runUpload,
									children: busy === "upload" ? t("rows.importing") : t("rows.authorizeImportConfirm")
								})] })
							]
						})
					}),
					selectedFile === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "bh-note",
						style: {
							overflow: "hidden",
							textOverflow: "ellipsis",
							whiteSpace: "nowrap"
						},
						children: selectedFile
					}),
					busy !== void 0 && phaseKey !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "bh-note",
						children: `${t(phaseKey)} · ${t("entry.elapsed", { seconds: liveElapsed })}`
					}) : null,
					snapshot.status === "unavailable" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "bh-note",
						children: t("rows.noSettings")
					}) : null,
					transferNote === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "bh-note",
						children: transferNote
					})
				]
			});
		}
		//#endregion
		//#region packages/computer/src/client/index.tsx
		const name = "botharness-computer-client";
		/**
		* The Channel sidebar registry is a client-side service provided by
		* `@botharness/client`; the entry types are duplicated structurally so this
		* bundle stays self-contained (importing that package at runtime would inline
		* its client code into ours).
		*/
		const inject = [
			"slots",
			"channelSidebar",
			"connection",
			"locale"
		];
		const STATUS_ENDPOINT = "/api/computer/status";
		const START_ENDPOINT = "/api/computer/start";
		const STOP_ENDPOINT = "/api/computer/stop";
		const VIEWER_SRC = "/botharness-computer/viewer/";
		const APPROVED_KEY = "botharness-computer-start-approved";
		const ENTRY_ID = "botharness-computer";
		/** Captured from the client connection service so entries can read PersonaBot names. */
		let connectionRpc;
		async function requestJson(url, init) {
			const response = await fetch(url, {
				credentials: "same-origin",
				...init
			});
			if (!response.ok) throw new Error(`${String(response.status)} ${await response.text()}`);
			return await response.json();
		}
		const SETUP_GUIDANCE_KEY = "entry.setup";
		const SHARED_NOTE_KEY = "entry.shared";
		const AUTHORIZATION_POINTS = [
			"entry.authorize.probe",
			"entry.authorize.volume",
			"entry.authorize.pull",
			"entry.authorize.bind"
		];
		const BH = {
			labelPrimary: "var(--dsw-alias-label-primary, #0f1115)",
			labelPrimaryForeground: "var(--dsw-alias-label-primary-foreground, #ffffff)",
			borderL2: "var(--dsw-alias-border-l2, #0000001a)",
			borderL3: "var(--dsw-alias-border-l3, #0000001f)",
			borderL4: "var(--dsw-alias-border-l4, #00000029)",
			bgBase: "var(--dsw-alias-bg-base, #ffffff)",
			buttonPrimaryFill: "var(--dsw-alias-button-primary-fill, #0f1115)",
			buttonElevatedFill: "var(--dsw-alias-button-elevated-fill, transparent)",
			businessPrimary: "var(--dsw-alias-state-business-primary, #4176e6)",
			hoverScrim: "color-mix(in srgb, var(--dsw-alias-bg-base) 35%, transparent)"
		};
		const noteStyle = {
			opacity: .7,
			fontSize: 12,
			whiteSpace: "pre-wrap"
		};
		const buttonStyle = {
			padding: "4px 10px",
			borderRadius: 6,
			border: `1px solid ${BH.borderL3}`,
			background: "transparent",
			color: "inherit",
			cursor: "pointer",
			fontSize: 12
		};
		const primaryButtonStyle = {
			...buttonStyle,
			border: `1px solid ${BH.buttonPrimaryFill}`,
			background: BH.buttonPrimaryFill,
			color: BH.labelPrimaryForeground
		};
		const terminalStyle = {
			fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
			fontSize: 11,
			opacity: .7,
			whiteSpace: "pre-wrap",
			wordBreak: "break-all"
		};
		const VIDEO_SURFACE = {
			background: "#000000",
			spinnerTrack: "rgba(255, 255, 255, 0.18)",
			spinnerArc: "#ffffff",
			onVideo: "#ffffff"
		};
		/** Logical viewport the viewer renders at; the wrapper scales it to fit. */
		const DESIGN_WIDTH = 1280;
		const DESIGN_HEIGHT = 800;
		const SPIN_STYLE = `
@keyframes bc-spin { to { transform: rotate(360deg); } }
`;
		/**
		* Follows the single viewer iframe for the whole Running lifetime: each tick
		* samples the document (canvas size, Selkies busy line, pixel signature) and
		* projects the overlay phase. `epoch` bumps (reconnect) reset the tracker so
		* the new document starts back at "connecting". The card stays mounted across
		* docked/fullscreen toggles, so one tracker instance never resets on open.
		*/
		function useStreamPhase(iframeRef, epoch) {
			const [phase, setPhase] = (0, react.useState)("connecting");
			(0, react.useEffect)(() => {
				setPhase("connecting");
				let cancelled = false;
				let tracker = {
					misses: 0,
					busyStreak: 0,
					quiet: 0
				};
				let timer;
				const check = () => {
					if (cancelled) return;
					let doc = null;
					try {
						doc = iframeRef.current?.contentDocument ?? null;
					} catch {
						doc = null;
					}
					const next = nextStreamTracker(tracker, sampleSurface(doc));
					tracker = next.tracker;
					setPhase(next.phase);
					timer = setTimeout(check, 1e3);
				};
				timer = setTimeout(check, 300);
				return () => {
					cancelled = true;
					if (timer !== void 0) clearTimeout(timer);
				};
			}, [iframeRef, epoch]);
			return phase;
		}
		/** Centered spinner over black; the shared connecting/retrying indicator. */
		function ScreenIndicator({ label = "连接中" }) {
			const size = 26;
			const stroke = 2;
			const radius = 12;
			const circumference = 2 * Math.PI * radius;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				style: {
					position: "absolute",
					inset: 0,
					display: "grid",
					placeItems: "center",
					background: VIDEO_SURFACE.background,
					color: VIDEO_SURFACE.onVideo
				},
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: {
						display: "flex",
						flexDirection: "column",
						alignItems: "center",
						gap: 10
					},
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
						width: size,
						height: size,
						style: { animation: "bc-spin 1.1s linear infinite" },
						"aria-hidden": "true",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
							cx: size / 2,
							cy: size / 2,
							r: radius,
							fill: "none",
							stroke: VIDEO_SURFACE.spinnerTrack,
							strokeWidth: stroke
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
							cx: size / 2,
							cy: size / 2,
							r: radius,
							fill: "none",
							stroke: VIDEO_SURFACE.spinnerArc,
							strokeWidth: stroke,
							strokeLinecap: "round",
							strokeDasharray: `${String(circumference * .28)} ${String(circumference * .72)}`
						})]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						style: {
							fontSize: 12.5,
							opacity: .7
						},
						children: label
					})]
				})
			});
		}
		/** Explicit "no picture" state once connecting has gone on too long. */
		function ScreenEmpty({ t, onRetry }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				style: {
					position: "absolute",
					inset: 0,
					display: "grid",
					placeItems: "center",
					background: VIDEO_SURFACE.background,
					color: VIDEO_SURFACE.onVideo
				},
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: {
						display: "flex",
						flexDirection: "column",
						alignItems: "center",
						gap: 12
					},
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						style: {
							fontSize: 12.5,
							opacity: .75
						},
						children: t("entry.noScreen")
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
						variant: "toolbar",
						size: "sm",
						onClick: onRetry,
						children: t("entry.reconnect")
					})]
				})
			});
		}
		/**
		* The single overlay selector for the stream surface: the connecting notice,
		* the empty state with retry, the hover Open pill once live, nothing
		* otherwise. Exported for component tests proving the overlay-vs-pill
		* binding (a connecting stream never offers the pill).
		*/
		function StreamOverlay(props) {
			const { phase, reconnecting, hovered, t, onRetry, onOpen } = props;
			if (phase === "connecting") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ScreenIndicator, { label: t(statusKeyFor(phase, reconnecting)) });
			if (phase === "empty") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ScreenEmpty, {
				t,
				onRetry
			});
			if (!hovered) return null;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				style: {
					position: "absolute",
					inset: 0,
					display: "grid",
					placeItems: "center",
					background: BH.hoverScrim,
					borderRadius: 8
				},
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(_deepseek_ai_dsh_client_ui_primitives.Pill, {
					onClick: onOpen,
					style: {
						background: BH.businessPrimary,
						color: BH.labelPrimaryForeground,
						height: 28,
						padding: "0 12px",
						fontSize: 13,
						gap: 6
					},
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconFullscreenOutlineRegular, { size: 14 }), t("entry.openFullscreen")]
				})
			});
		}
		/** Fixed-aspect card (or fullscreen surface) that scales the viewer to fit. */
		function ScaledFrame({ title, interactive, fit = "width", iframeRef }) {
			const ref = (0, react.useRef)(null);
			const [box, setBox] = (0, react.useState)({
				width: DESIGN_WIDTH,
				height: DESIGN_HEIGHT
			});
			(0, react.useEffect)(() => {
				const element = ref.current;
				if (element === null) return () => {};
				const update = () => setBox({
					width: element.clientWidth,
					height: element.clientHeight
				});
				update();
				const observer = new ResizeObserver(update);
				observer.observe(element);
				return () => observer.disconnect();
			}, []);
			const scale = fit === "contain" ? Math.min(box.width / DESIGN_WIDTH, box.height / DESIGN_HEIGHT) : box.width / DESIGN_WIDTH;
			const offsetX = fit === "contain" ? Math.max(0, (box.width - DESIGN_WIDTH * scale) / 2) : 0;
			const offsetY = fit === "contain" ? Math.max(0, (box.height - DESIGN_HEIGHT * scale) / 2) : 0;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				ref,
				style: {
					position: "relative",
					width: "100%",
					...fit === "width" ? {
						aspectRatio: `${String(DESIGN_WIDTH)} / ${String(DESIGN_HEIGHT)}`,
						border: `1px solid ${BH.borderL3}`,
						borderRadius: 8
					} : { height: "100%" },
					overflow: "hidden",
					background: VIDEO_SURFACE.background
				},
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("iframe", {
					ref: iframeRef,
					title,
					src: VIEWER_SRC,
					tabIndex: interactive ? 0 : -1,
					style: {
						position: "absolute",
						top: 0,
						left: 0,
						width: DESIGN_WIDTH,
						height: DESIGN_HEIGHT,
						border: "none",
						transform: `translate(${String(offsetX)}px, ${String(offsetY)}px) scale(${String(scale)})`,
						transformOrigin: "top left",
						pointerEvents: interactive ? "auto" : "none"
					}
				})
			});
		}
		/** Pure newest-first list; the container supplies rows and the empty state. */
		function RecentLogsList({ entries }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				style: terminalStyle,
				children: entries.map((entry) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [
					new Date(entry.ts).toLocaleTimeString(),
					" [",
					entry.kind,
					"] ",
					entry.detail
				] }, entry.id))
			});
		}
		/**
		* Collapsed "recent activity" section under the resting card chrome.
		* Fetches once on first expand; a closed section costs no requests.
		*/
		function RecentLogs({ t }) {
			const [open, setOpen] = (0, react.useState)(false);
			const [entries, setEntries] = (0, react.useState)(void 0);
			const [failed, setFailed] = (0, react.useState)(false);
			(0, react.useEffect)(() => {
				if (!open || entries !== void 0 || failed) return () => {};
				let cancelled = false;
				requestJson("/api/computer/logs?limit=10").then((result) => {
					if (!cancelled) setEntries(result.entries);
				}).catch(() => {
					if (!cancelled) setFailed(true);
				});
				return () => {
					cancelled = true;
				};
			}, [
				open,
				entries,
				failed
			]);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
				type: "button",
				onClick: () => setOpen(!open),
				style: buttonStyle,
				children: t("entry.recentLogs")
			}), open ? failed ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				style: noteStyle,
				children: t("entry.recentLogs.failed")
			}) : entries === void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				style: noteStyle,
				children: "…"
			}) : entries.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				style: noteStyle,
				children: t("entry.recentLogs.empty")
			}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(RecentLogsList, { entries }) : null] });
		}
		function CollapseIcon() {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
				width: 15,
				height: 15,
				viewBox: "0 0 24 24",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: 2,
				strokeLinecap: "round",
				strokeLinejoin: "round",
				"aria-hidden": "true",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("polyline", { points: "4 14 10 14 10 20" }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("polyline", { points: "20 10 14 10 14 4" }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("line", {
						x1: "14",
						y1: "10",
						x2: "21",
						y2: "3"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("line", {
						x1: "3",
						y1: "21",
						x2: "10",
						y2: "14"
					})
				]
			});
		}
		/** The shared stop control (title bar + resting card), one definition. */
		function StopButton({ t, busy, stopping, onStop }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
				variant: "ghost",
				size: "sm",
				disabled: busy || stopping,
				onClick: onStop,
				children: busy || stopping ? t("entry.stopping") : t("entry.stop")
			});
		}
		/**
		* The fullscreen viewer's title bar: Bot name + stream status on the left,
		* the stop control and collapse on the right. Exported for component tests.
		*/
		function ViewerTitleBar(props) {
			const { t, title, phase, reconnecting, busy, stopping, onStop, onCollapse } = props;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: {
					display: "flex",
					alignItems: "center",
					gap: 8,
					height: 44,
					flex: "0 0 auto",
					padding: "0 8px 0 14px",
					borderBottom: `1px solid ${BH.borderL2}`,
					color: BH.labelPrimary,
					background: BH.bgBase
				},
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.StateDot, { state: dotStateFor(phase) }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", {
						style: {
							fontSize: 13,
							fontWeight: 600
						},
						children: title
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						style: {
							fontSize: 12,
							opacity: .65
						},
						children: t(statusKeyFor(phase, reconnecting))
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { style: { flex: 1 } }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(StopButton, {
						t,
						busy,
						stopping,
						onStop
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
						variant: "ghost",
						size: "sm",
						onClick: onCollapse,
						"aria-label": t("entry.collapseFullscreen"),
						title: t("entry.collapseFullscreen"),
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CollapseIcon, {})
					})
				]
			});
		}
		/**
		* Running state: an AgentScreen-style card built around ONE viewer iframe. The
		* shell keeps the same element mounted and only toggles its geometry — docked
		* in the sidebar or fixed fullscreen — so opening the viewer never re-mounts
		* the stream, never re-handshakes its WebSocket, and never resets "connecting".
		* Docked, a hover mask offers the blue Open pill; expanded, the same frame
		* fills the viewport under the title bar (the toolbar collapse button returns
		* to the card, page scroll locked). Sustained silence becomes an explicit
		* empty state with a retry.
		*/
		function RunningCard({ t, botSlug, busy, stopping, onStop }) {
			const frameRef = (0, react.useRef)(null);
			const dialogRef = (0, react.useRef)(null);
			const [hovered, setHovered] = (0, react.useState)(false);
			const [expanded, setExpanded] = (0, react.useState)(false);
			const [reloadKey, setReloadKey] = (0, react.useState)(0);
			const [reconnecting, setReconnecting] = (0, react.useState)(false);
			const wasReady = (0, react.useRef)(false);
			const autoReloads = (0, react.useRef)(0);
			const lossStreak = (0, react.useRef)(0);
			const prevPhase = (0, react.useRef)(void 0);
			const prevExpanded = (0, react.useRef)(false);
			const title = t("entry.screen.title", { name: botSlug ?? "PersonaBot" });
			const phase = useStreamPhase(frameRef, reloadKey);
			const live = phase === "live";
			const reconnect = () => {
				reportViewerEvent(void 0, viewerEventText({ type: "manual-retry" }));
				setReconnecting(true);
				setReloadKey((key) => key + 1);
			};
			(0, react.useEffect)(() => {
				reportViewerEvent(void 0, viewerEventText({ type: "mount" }));
			}, []);
			(0, react.useEffect)(() => {
				const fromPhase = prevPhase.current;
				prevPhase.current = phase;
				if (fromPhase !== void 0 && fromPhase !== phase) reportViewerEvent(void 0, viewerEventText({
					type: "phase",
					from: fromPhase,
					to: phase
				}));
				const wasExpanded = prevExpanded.current;
				prevExpanded.current = expanded;
				if (wasExpanded !== expanded) reportViewerEvent(void 0, viewerEventText({
					type: "overlay",
					open: expanded
				}));
			}, [phase, expanded]);
			(0, react.useEffect)(() => {
				if (live) {
					wasReady.current = true;
					autoReloads.current = 0;
					lossStreak.current = 0;
					setReconnecting(false);
					return;
				}
				if (!wasReady.current) return;
				lossStreak.current += 1;
				if (!shouldRemountLoss(lossStreak.current)) return;
				wasReady.current = false;
				lossStreak.current = 0;
				reportViewerEvent(void 0, viewerEventText({
					type: "loss-remount",
					streak: 3
				}));
				setReconnecting(true);
				setReloadKey((key) => key + 1);
			}, [live]);
			(0, react.useEffect)(() => {
				if (!shouldAutoReload(phase, wasReady.current, autoReloads.current)) return;
				autoReloads.current += 1;
				reportViewerEvent(void 0, viewerEventText({
					type: "auto-reload",
					attempt: autoReloads.current
				}));
				setReloadKey((key) => key + 1);
			}, [phase]);
			(0, react.useEffect)(() => {
				if (!expanded) return () => {};
				const onKey = (event) => {
					if (event.key !== "Tab") return;
					const dialog = dialogRef.current;
					if (dialog === null) return;
					const focusable = [...dialog.querySelectorAll("button, [href], iframe, [tabindex]:not([tabindex=\"-1\"])")].filter((element) => element.tabIndex !== -1);
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
				document.addEventListener("keydown", onKey);
				document.body.style.overflow = "hidden";
				dialogRef.current?.focus();
				return () => {
					document.removeEventListener("keydown", onKey);
					document.body.style.overflow = "";
				};
			}, [expanded]);
			const statusText = t(statusKeyFor(phase, reconnecting));
			const openable = phase === "live" && !expanded;
			const overlay = /* @__PURE__ */ (0, react_jsx_runtime.jsx)(StreamOverlay, {
				phase,
				reconnecting,
				hovered: expanded ? false : hovered,
				t,
				onRetry: reconnect,
				onOpen: () => setExpanded(nextExpanded("open"))
			});
			const stopLabel = t(stopKey(busy, stopping));
			const rowButton = (disabled) => ({
				flex: 1,
				display: "inline-flex",
				alignItems: "center",
				justifyContent: "center",
				height: 28,
				padding: "0 10px",
				borderRadius: 14,
				border: `1px solid ${BH.borderL3}`,
				background: BH.buttonElevatedFill,
				color: BH.labelPrimary,
				fontSize: 12,
				...disabled ? {
					opacity: .4,
					cursor: "not-allowed"
				} : { cursor: "pointer" }
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				ref: dialogRef,
				role: expanded ? "dialog" : void 0,
				"aria-modal": expanded ? true : void 0,
				"aria-label": expanded ? title : void 0,
				tabIndex: expanded ? -1 : void 0,
				style: expanded ? {
					position: "fixed",
					inset: 0,
					zIndex: 100,
					display: "flex",
					flexDirection: "column",
					background: BH.bgBase,
					color: BH.labelPrimary
				} : {
					display: "flex",
					flexDirection: "column",
					gap: 8
				},
				children: [
					expanded ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ViewerTitleBar, {
						t,
						title,
						phase,
						reconnecting,
						busy,
						stopping,
						onStop,
						onCollapse: () => setExpanded(nextExpanded("collapse"))
					}, "viewer-titlebar") : null,
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						role: openable ? "button" : void 0,
						tabIndex: openable ? 0 : void 0,
						"aria-label": openable ? t("entry.openFullscreen") : statusText,
						onMouseEnter: () => setHovered(true),
						onMouseLeave: () => setHovered(false),
						onClick: () => {
							if (openable) setExpanded(nextExpanded("open"));
						},
						onKeyDown: (event) => {
							if (!openable) return;
							if (event.key !== "Enter" && event.key !== " ") return;
							event.preventDefault();
							setExpanded(nextExpanded("open"));
						},
						style: expanded ? {
							position: "relative",
							flex: 1,
							minHeight: 0
						} : {
							position: "relative",
							cursor: openable ? "pointer" : "default"
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ScaledFrame, {
							title,
							interactive: expanded,
							fit: expanded ? "contain" : "width",
							iframeRef: frameRef
						}, reloadKey), overlay]
					}, "viewer-frame"),
					expanded ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react.Fragment, { children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							style: {
								fontSize: 13,
								fontWeight: 500,
								color: BH.labelPrimary,
								opacity: .9,
								textAlign: "center"
							},
							children: title
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: {
								display: "flex",
								gap: 8
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								disabled: busy || stopping,
								onClick: onStop,
								style: rowButton(busy || stopping),
								children: stopLabel
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								onClick: reconnect,
								title: t("entry.reconnect"),
								style: rowButton(false),
								children: t("entry.reconnect")
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(RecentLogs, { t })
					] }, "viewer-chrome")
				]
			});
		}
		/** Pure three-state view; the container component supplies data and handlers. */
		function ComputerEntryView(props) {
			const { t, state, phase, detail, progress, runtimeAvailable, confirming, busy, elapsed, nowTs, error, botSlug, storage, onStart, onConfirmStart, onStop, onApprove, onCancel } = props;
			if (!runtimeAvailable) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				style: noteStyle,
				children: t(SETUP_GUIDANCE_KEY)
			});
			if (confirming) return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: {
					display: "flex",
					flexDirection: "column",
					gap: 8,
					fontSize: 12
				},
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: { opacity: .8 },
						children: t("entry.authorizeIntro")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
						style: {
							margin: 0,
							paddingLeft: 16,
							lineHeight: 1.6,
							opacity: .85
						},
						children: AUTHORIZATION_POINTS.map((point) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("li", { children: t(point) }, point))
					}),
					storage === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: { opacity: .85 },
						children: [t("entry.authorize.storage", { target: storage.target }), storage.ignoredReason === void 0 ? "" : `（${storage.ignoredReason}）`]
					}),
					storage?.migrationHint === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: { opacity: .85 },
						children: storage.migrationHint
					}),
					storage?.kind === "bind" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: { opacity: .85 },
						children: t("entry.authorize.storageBindRisk")
					}) : null,
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
						style: {
							display: "flex",
							gap: 6,
							alignItems: "center",
							opacity: .85
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							type: "checkbox",
							onChange: (event) => onApprove(event.target.checked)
						}), t("entry.remember")]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: {
							display: "flex",
							gap: 8
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							style: buttonStyle,
							onClick: onCancel,
							children: t("entry.cancel")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							style: primaryButtonStyle,
							onClick: onConfirmStart,
							children: t("entry.authorize")
						})]
					})
				]
			});
			const inProgress = phase === "pulling" || phase === "starting" || phase === "stopping" || phase === "exporting" || phase === "importing";
			if (state === "running") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(RunningCard, {
				t,
				botSlug,
				busy,
				stopping: phase === "stopping",
				onStop
			});
			if (inProgress) return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: {
					display: "flex",
					flexDirection: "column",
					gap: 8,
					fontSize: 12
				},
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [t(PHASE_LABEL[phase] ?? "entry.phase.working"), "…"] }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: {
							position: "relative",
							overflow: "hidden",
							height: 6,
							borderRadius: 3,
							background: BH.borderL4
						},
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { style: progress?.percent === void 0 ? {
							position: "absolute",
							inset: 0,
							background: BH.businessPrimary
						} : {
							position: "absolute",
							left: 0,
							top: 0,
							bottom: 0,
							width: `${String(progress.percent)}%`,
							background: BH.businessPrimary
						} })
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: terminalStyle,
						children: progress?.text ?? detail ?? t("entry.wait")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: { opacity: .5 },
						children: [t("entry.elapsed", { seconds: elapsed }), progress?.updatedAt === void 0 ? "" : ` · ${t("entry.updated", { seconds: Math.max(0, Math.round((nowTs - progress.updatedAt) / 1e3)) })}`]
					})
				]
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: {
					display: "flex",
					flexDirection: "column",
					gap: 8,
					fontSize: 12
				},
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					style: noteStyle,
					children: error ?? (isExitReport(detail) ? void 0 : detail) ?? t(SHARED_NOTE_KEY)
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					style: primaryButtonStyle,
					disabled: busy,
					onClick: onStart,
					children: busy ? t("entry.starting") : t("entry.start")
				})]
			});
		}
		/** Bind the entry to the Computer's locale namespace once per registration. */
		function createComputerEntry(t) {
			return function ComputerEntryWithLocale(props) {
				return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ComputerEntry, {
					...props,
					t
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
				rpc.call("/api", "botharness/list", { args: {} }).then((result) => {
					if (cancelled || !result.ok) return;
					const match = (result.value.bots ?? []).find((bot) => bot.slug === botSlug);
					if (typeof match?.displayName === "string" && match.displayName.length > 0) setName(match.displayName);
				}).catch(() => void 0);
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
			const [approved, setApproved] = (0, react.useState)(() => globalThis.sessionStorage?.getItem(APPROVED_KEY) === "1");
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
			const inProgress = phase === "pulling" || phase === "starting" || phase === "stopping" || phase === "exporting" || phase === "importing";
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
			const act = (0, react.useCallback)(async (endpoint) => {
				setBusy(true);
				try {
					await requestJson(endpoint, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({
							authorize: true,
							...endpoint === START_ENDPOINT && typeof navigator !== "undefined" ? { language: navigator.language } : {}
						})
					});
					await refresh();
				} catch (cause) {
					setError(String(cause));
				} finally {
					setBusy(false);
				}
			}, [refresh]);
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
					globalThis.sessionStorage?.setItem(APPROVED_KEY, "1");
					setApproved(true);
				}
			}, []);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ComputerEntryView, {
				t,
				state: payload?.status.state ?? "absent",
				...phase === void 0 ? {} : { phase },
				...payload?.status.detail === void 0 ? {} : { detail: payload.status.detail },
				...payload?.status.progress === void 0 ? {} : { progress: payload.status.progress },
				runtimeAvailable: payload?.probe.available ?? true,
				confirming,
				busy,
				elapsed,
				nowTs,
				...error === void 0 ? {} : { error },
				...displayName === void 0 ? {} : { botSlug: displayName },
				...payload?.status.storage === void 0 ? {} : { storage: payload.status.storage },
				onStart,
				onConfirmStart,
				onStop: () => void act(STOP_ENDPOINT),
				onApprove,
				onCancel: () => setConfirming(false)
			});
		}
		function apply(ctx) {
			const settingsPrefs = new ComputerSettingsPrefs();
			ctx.inject(["configForms"], (settingsCtx) => {
				const scope = settingsCtx.configForms.get(COMPUTER_SETTINGS_NAMESPACE);
				const release = settingsPrefs.attach(scope);
				return () => {
					release();
				};
			});
			ctx.inject(["uiWorkspace", "slots"], (workspaceCtx) => {
				const workspace = workspaceCtx.uiWorkspace;
				const face = createComputerSettingsFace({
					prefs: settingsPrefs,
					pickDirectory: workspace?.pickDirectory
				});
				workspaceCtx.slots.inject("botharness.settings.item", () => workspaceCtx.slots.register({
					name: "botharness.settings.item",
					id: "computer",
					order: 10,
					locale: LOCALE_NS,
					inject: () => face
				}, ComputerSettingsRows));
			});
			ctx.effect(() => {
				if (typeof document === "undefined") return () => {};
				const style = document.createElement("style");
				style.setAttribute("data-botharness-computer", "client");
				style.textContent = SPIN_STYLE;
				document.head.appendChild(style);
				return () => {
					style.remove();
				};
			}, "botharness-computer: client styles");
			const t = ctx.locale.bind(LOCALE_NS);
			ctx.effect(() => ctx.locale.register(LOCALE_NS, {
				zh,
				en
			}), "botharness-computer: dictionaries");
			ctx.inject(["channelSidebar", "connection"], (sidebarCtx) => {
				const registry = sidebarCtx.channelSidebar;
				connectionRpc = sidebarCtx.connection?.rpc;
				if (registry === void 0) return;
				ctx.effect(() => registry.register({
					id: ENTRY_ID,
					label: t("entry.label"),
					order: 40,
					scope: "personabot",
					component: createComputerEntry(t)
				}), "botharness-computer: channel sidebar entry");
			});
		}
		//#endregion
		exports.ComputerEntryView = ComputerEntryView;
		exports.RecentLogs = RecentLogs;
		exports.RecentLogsList = RecentLogsList;
		exports.ScreenIndicator = ScreenIndicator;
		exports.StreamOverlay = StreamOverlay;
		exports.ViewerTitleBar = ViewerTitleBar;
		exports.apply = apply;
		exports.createComputerEntry = createComputerEntry;
		exports.inject = inject;
		exports.name = name;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map