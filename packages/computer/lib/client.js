window.__ModuleLoader__.load({
	id: "@botharness/computer",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region packages/computer/src/client/index.tsx
		const name = "botharness-computer-client";
		const inject = ["slots"];
		const STATUS_ENDPOINT = "/api/computer/status";
		const START_ENDPOINT = "/api/computer/start";
		const STOP_ENDPOINT = "/api/computer/stop";
		const EXPORT_ENDPOINT = "/api/computer/export";
		const EXPORTS_ENDPOINT = "/api/computer/exports";
		const IMPORT_ENDPOINT = "/api/computer/import";
		const VIEWER_SRC = "/botharness-computer/viewer/";
		const APPROVED_KEY = "botharness-computer-start-approved";
		async function requestJson(url, init) {
			const response = await fetch(url, {
				credentials: "same-origin",
				...init
			});
			if (!response.ok) throw new Error(`${String(response.status)} ${await response.text()}`);
			return await response.json();
		}
		const STATE_LABEL = {
			absent: "未创建",
			stopped: "已停止",
			running: "运行中",
			failed: "不可用"
		};
		const PHASE_LABEL = {
			pulling: "正在拉取镜像",
			starting: "正在启动容器",
			stopping: "正在停止",
			exporting: "正在导出",
			importing: "正在导入"
		};
		const AUTHORIZATION_POINTS = [
			"检测本机容器运行时；缺失时只给出安装引导，不会自动安装",
			"创建/复用持久卷（浏览器登录态与文件保留在这台电脑上）",
			"拉取镜像（首次约 1.2 GB 网络流量）并创建容器",
			"把 Web VNC 绑定到 127.0.0.1 的本地端口，仅本机可访问"
		];
		const STYLES = `
@keyframes bc-progress { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }
.bc-progress-track { position: relative; overflow: hidden; height: 6px; border-radius: 3px; background: rgba(127,127,127,0.25); width: 100%; }
.bc-progress-bar { position: absolute; inset: 0; border-radius: 3px; background: linear-gradient(90deg, transparent, var(--dsh-accent, #4d6bfe), transparent); animation: bc-progress 1.2s linear infinite; }
.bc-progress-bar--determinate { animation: none; background: var(--dsh-accent, #4d6bfe); left: 0; top: 0; bottom: 0; right: auto; }
.bc-terminal { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; opacity: 0.7; white-space: pre-wrap; word-break: break-all; max-height: 3.5em; overflow: hidden; }
`;
		const launcherStyle = {
			position: "fixed",
			right: 20,
			bottom: 20,
			zIndex: 60,
			border: "1px solid var(--dsh-border, #3a3a3a)",
			borderRadius: 20,
			padding: "6px 14px",
			background: "var(--dsh-surface, #1f1f1f)",
			color: "var(--dsh-text, #eee)",
			cursor: "pointer",
			fontSize: 13
		};
		const panelStyle = {
			position: "fixed",
			right: 20,
			bottom: 64,
			zIndex: 60,
			width: 640,
			height: 480,
			display: "flex",
			flexDirection: "column",
			border: "1px solid var(--dsh-border, #3a3a3a)",
			borderRadius: 12,
			overflow: "hidden",
			background: "var(--dsh-surface, #161616)",
			color: "var(--dsh-text, #eee)",
			boxShadow: "0 12px 32px rgba(0,0,0,0.45)"
		};
		const barStyle = {
			display: "flex",
			alignItems: "center",
			gap: 8,
			padding: "8px 12px",
			fontSize: 13,
			borderBottom: "1px solid var(--dsh-border, #3a3a3a)"
		};
		const bodyStyle = {
			flex: 1,
			display: "flex",
			alignItems: "center",
			justifyContent: "center",
			padding: 16,
			fontSize: 13,
			textAlign: "center",
			whiteSpace: "pre-wrap",
			overflow: "auto"
		};
		const progressStyle = {
			flex: 1,
			display: "flex",
			flexDirection: "column",
			alignItems: "stretch",
			justifyContent: "center",
			gap: 10,
			padding: "0 24px",
			fontSize: 13
		};
		const confirmStyle = {
			flex: 1,
			display: "flex",
			flexDirection: "column",
			gap: 10,
			padding: 18,
			fontSize: 13,
			overflow: "auto"
		};
		const buttonStyle = {
			padding: "4px 10px",
			borderRadius: 6,
			border: "1px solid var(--dsh-border, #3a3a3a)",
			background: "transparent",
			color: "inherit",
			cursor: "pointer"
		};
		const footerStyle = {
			display: "flex",
			alignItems: "center",
			gap: 8,
			padding: "6px 12px",
			borderTop: "1px solid var(--dsh-border, #3a3a3a)",
			fontSize: 12
		};
		const primaryButtonStyle = {
			...buttonStyle,
			borderColor: "var(--dsh-accent, #4d6bfe)",
			background: "var(--dsh-accent, #4d6bfe)",
			color: "#fff"
		};
		const SETUP_GUIDANCE = [
			"未检测到容器运行时。任选其一安装后重试：",
			"",
			"Colima（推荐，MIT）：",
			"  brew install colima docker",
			"  brew services start colima",
			"",
			"或安装 Docker Desktop：https://www.docker.com/products/docker-desktop/"
		].join("\n");
		function ComputerPanel() {
			const [open, setOpen] = (0, react.useState)(false);
			const [payload, setPayload] = (0, react.useState)();
			const [error, setError] = (0, react.useState)();
			const [busy, setBusy] = (0, react.useState)(false);
			const [confirming, setConfirming] = (0, react.useState)(false);
			const [approved, setApproved] = (0, react.useState)(() => globalThis.sessionStorage?.getItem(APPROVED_KEY) === "1");
			const [busySince, setBusySince] = (0, react.useState)(void 0);
			const [elapsed, setElapsed] = (0, react.useState)(0);
			const [nowTs, setNowTs] = (0, react.useState)(() => Date.now());
			const [archives, setArchives] = (0, react.useState)([]);
			const [showImport, setShowImport] = (0, react.useState)(false);
			const [notice, setNotice] = (0, react.useState)();
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
			const progress = payload?.status.progress;
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
			const post = (0, react.useCallback)(async (endpoint, body) => {
				setBusy(true);
				try {
					await requestJson(endpoint, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify(body ?? {})
					});
					await refresh();
				} catch (cause) {
					setError(String(cause));
				} finally {
					setBusy(false);
				}
			}, [refresh]);
			const approve = (0, react.useCallback)((remember) => {
				if (remember) {
					globalThis.sessionStorage?.setItem(APPROVED_KEY, "1");
					setApproved(true);
				}
				setConfirming(false);
				post(START_ENDPOINT, { authorize: true });
			}, [post]);
			const exportNow = (0, react.useCallback)(async () => {
				setNotice(void 0);
				setBusy(true);
				try {
					const result = await requestJson(EXPORT_ENDPOINT, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ authorize: true })
					});
					setNotice(result.archive === void 0 ? "已导出" : `已导出：${result.archive}`);
					await refresh();
				} catch (cause) {
					setNotice(String(cause));
				} finally {
					setBusy(false);
				}
			}, [refresh]);
			const openImport = (0, react.useCallback)(async () => {
				setNotice(void 0);
				try {
					const result = await requestJson(EXPORTS_ENDPOINT);
					setArchives(result.files ?? []);
					setShowImport(true);
					if ((result.files ?? []).length === 0) setNotice("导出目录里还没有归档文件");
				} catch (cause) {
					setNotice(String(cause));
				}
			}, []);
			const importNow = (0, react.useCallback)(async (file) => {
				setShowImport(false);
				setBusy(true);
				try {
					await requestJson(IMPORT_ENDPOINT, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({
							authorize: true,
							file
						})
					});
					setNotice(`已从 ${file} 导入`);
					await refresh();
				} catch (cause) {
					setNotice(String(cause));
				} finally {
					setBusy(false);
				}
			}, [refresh]);
			if (!open) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
				type: "button",
				style: launcherStyle,
				onClick: () => setOpen(true),
				children: "电脑"
			});
			const state = payload?.status.state ?? "absent";
			const unavailable = payload !== void 0 && !payload.probe.available;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: panelStyle,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: barStyle,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: "Computer" }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: inProgress ? PHASE_LABEL[phase] ?? "处理中" : STATE_LABEL[state] }),
							payload?.provider !== null && payload?.provider !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: { opacity: .6 },
								children: payload.provider
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { style: { flex: 1 } }),
							state === "running" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								style: buttonStyle,
								disabled: busy || inProgress,
								onClick: () => void post(STOP_ENDPOINT, { authorize: true }),
								children: busy || phase === "stopping" ? "停止中…" : "停止"
							}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								style: buttonStyle,
								disabled: busy || inProgress,
								onClick: () => approved ? void post(START_ENDPOINT, { authorize: true }) : setConfirming(true),
								children: busy || phase === "starting" || phase === "pulling" ? "启动中…" : "启动"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								style: buttonStyle,
								onClick: () => setOpen(false),
								children: "关闭"
							})
						]
					}),
					confirming ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: confirmStyle,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: "授权启动 Computer" }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								style: { opacity: .75 },
								children: "启动会在你的机器上执行以下操作："
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
								style: {
									margin: 0,
									paddingLeft: 18,
									lineHeight: 1.7,
									opacity: .85
								},
								children: AUTHORIZATION_POINTS.map((point) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("li", { children: point }, point))
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								style: {
									display: "flex",
									gap: 6,
									alignItems: "center",
									opacity: .85
								},
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									type: "checkbox",
									onChange: (event) => {
										if (event.target.checked) {
											globalThis.sessionStorage?.setItem(APPROVED_KEY, "1");
											setApproved(true);
										}
									}
								}), "本次会话内不再询问"]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: {
									display: "flex",
									gap: 8,
									justifyContent: "flex-end"
								},
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									style: buttonStyle,
									onClick: () => setConfirming(false),
									children: "取消"
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									style: primaryButtonStyle,
									onClick: () => approve(true),
									children: "授权并启动"
								})]
							})
						]
					}) : state === "running" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("iframe", {
						title: "PersonaBot Computer",
						src: VIEWER_SRC,
						style: {
							flex: 1,
							width: "100%",
							border: "none"
						}
					}) : inProgress ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: progressStyle,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: {
									display: "flex",
									justifyContent: "space-between"
								},
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [PHASE_LABEL[phase] ?? "处理中", "…"] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									style: { opacity: .8 },
									children: progress?.percent === void 0 ? "" : `${String(progress.percent)}%`
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "bc-progress-track",
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: progress?.percent === void 0 ? "bc-progress-bar" : "bc-progress-bar bc-progress-bar--determinate",
									style: progress?.percent === void 0 ? void 0 : { width: `${String(progress.percent)}%` }
								})
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "bc-terminal",
								children: progress?.text ?? payload?.status.detail ?? "请稍候"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: { opacity: .5 },
								children: [
									"已用时 ",
									elapsed,
									"s",
									progress?.updatedAt === void 0 ? "" : ` · 最后更新 ${String(Math.max(0, Math.round((nowTs - progress.updatedAt) / 1e3)))}s 前`
								]
							})
						]
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: bodyStyle,
						children: unavailable ? SETUP_GUIDANCE : error ?? payload?.status.detail ?? "点击「启动」创建并启动这台电脑。"
					}),
					payload?.exportDir !== void 0 && payload.exportDir !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: footerStyle,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								style: buttonStyle,
								disabled: busy || inProgress,
								onClick: () => void exportNow(),
								children: busy || phase === "exporting" ? "导出中…" : "导出"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								style: buttonStyle,
								disabled: busy || inProgress,
								onClick: () => void openImport(),
								children: busy || phase === "importing" ? "导入中…" : "导入"
							}),
							notice !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								title: notice,
								style: {
									opacity: .7,
									flex: 1,
									overflow: "hidden",
									textOverflow: "ellipsis",
									whiteSpace: "nowrap"
								},
								children: notice
							}),
							showImport && archives.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
								defaultValue: "",
								onChange: (event) => {
									const file = event.target.value;
									if (file !== "") importNow(file);
								},
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
									value: "",
									disabled: true,
									children: "选择归档…"
								}), archives.map((file) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
									value: file,
									children: file
								}, file))]
							})
						]
					})
				]
			});
		}
		function apply(ctx) {
			ctx.effect(() => {
				if (typeof document === "undefined") return () => {};
				const style = document.createElement("style");
				style.setAttribute("data-botharness-computer", "client");
				style.textContent = STYLES;
				document.head.appendChild(style);
				return () => {
					style.remove();
				};
			}, "botharness-computer: client styles");
			ctx.slots.inject("shell.overlay", () => ctx.slots.register({
				name: "shell.overlay",
				id: "botharness-computer",
				order: 60
			}, ComputerPanel));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		exports.name = name;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map