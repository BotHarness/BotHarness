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
		/**
		* The Channel sidebar registry is a client-side service provided by
		* `@botharness/client`; the entry types are duplicated structurally so this
		* bundle stays self-contained (importing that package at runtime would inline
		* its client code into ours).
		*/
		const inject = ["channelSidebar"];
		const STATUS_ENDPOINT = "/api/computer/status";
		const START_ENDPOINT = "/api/computer/start";
		const STOP_ENDPOINT = "/api/computer/stop";
		const VIEWER_SRC = "/botharness-computer/viewer/";
		const APPROVED_KEY = "botharness-computer-start-approved";
		const ENTRY_ID = "botharness-computer";
		async function requestJson(url, init) {
			const response = await fetch(url, {
				credentials: "same-origin",
				...init
			});
			if (!response.ok) throw new Error(`${String(response.status)} ${await response.text()}`);
			return await response.json();
		}
		const PHASE_LABEL = {
			pulling: "正在拉取镜像",
			starting: "正在启动",
			stopping: "正在停止"
		};
		const SETUP_GUIDANCE = [
			"未检测到容器运行时。任选其一安装后重试：",
			"",
			"Colima（推荐，MIT）：",
			"  brew install colima docker",
			"  brew services start colima",
			"",
			"或 Docker Desktop：https://www.docker.com/products/docker-desktop/"
		].join("\n");
		const SHARED_NOTE = "这台电脑由本 profile 的所有 PersonaBot 共享：各自拥有自己的窗口，共享登录态与文件。";
		const AUTHORIZATION_POINTS = [
			"检测本机容器运行时；缺失时只给安装引导，不会自动安装",
			"创建/复用持久卷（登录态与文件保留在这台电脑上）",
			"拉取镜像（首次约 1.2 GB 网络流量）并创建容器",
			"把 Web VNC 绑定到 127.0.0.1 的本地端口，仅本机可访问"
		];
		const noteStyle = {
			opacity: .7,
			fontSize: 12,
			whiteSpace: "pre-wrap"
		};
		const buttonStyle = {
			padding: "4px 10px",
			borderRadius: 6,
			border: "1px solid var(--dsh-border, #3a3a3a)",
			background: "transparent",
			color: "inherit",
			cursor: "pointer",
			fontSize: 12
		};
		const primaryButtonStyle = {
			...buttonStyle,
			borderColor: "var(--dsh-accent, #4d6bfe)",
			background: "var(--dsh-accent, #4d6bfe)",
			color: "#fff"
		};
		const terminalStyle = {
			fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
			fontSize: 11,
			opacity: .7,
			whiteSpace: "pre-wrap",
			wordBreak: "break-all"
		};
		/** Pure three-state view; the container component supplies data and handlers. */
		function ComputerEntryView(props) {
			const { state, phase, detail, progress, runtimeAvailable, confirming, busy, elapsed, nowTs, error, botSlug, onStart, onStop, onApprove, onCancel } = props;
			if (!runtimeAvailable) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				style: noteStyle,
				children: SETUP_GUIDANCE
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
						children: "启动会在你的机器上执行："
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
						style: {
							margin: 0,
							paddingLeft: 16,
							lineHeight: 1.6,
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
							onChange: (event) => onApprove(event.target.checked)
						}), "本次会话内不再询问"]
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
							children: "取消"
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							style: primaryButtonStyle,
							onClick: onStart,
							children: "授权并启动"
						})]
					})
				]
			});
			const inProgress = phase === "pulling" || phase === "starting" || phase === "stopping" || phase === "exporting" || phase === "importing";
			if (state === "running") return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: {
					display: "flex",
					flexDirection: "column",
					gap: 8
				},
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("iframe", {
					title: `${botSlug ?? "PersonaBot"} 的电脑`,
					src: VIEWER_SRC,
					style: {
						width: "100%",
						aspectRatio: "16 / 10",
						border: "1px solid var(--dsh-border, #3a3a3a)",
						borderRadius: 8,
						background: "#000"
					}
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					style: buttonStyle,
					disabled: busy || inProgress,
					onClick: onStop,
					children: busy || phase === "stopping" ? "停止中…" : "停止"
				})]
			});
			if (inProgress) return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: {
					display: "flex",
					flexDirection: "column",
					gap: 8,
					fontSize: 12
				},
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [PHASE_LABEL[phase] ?? "处理中", "…"] }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: {
							position: "relative",
							overflow: "hidden",
							height: 6,
							borderRadius: 3,
							background: "rgba(127,127,127,0.25)"
						},
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { style: progress?.percent === void 0 ? {
							position: "absolute",
							inset: 0,
							background: "var(--dsh-accent, #4d6bfe)"
						} : {
							position: "absolute",
							left: 0,
							top: 0,
							bottom: 0,
							width: `${String(progress.percent)}%`,
							background: "var(--dsh-accent, #4d6bfe)"
						} })
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: terminalStyle,
						children: progress?.text ?? detail ?? "请稍候"
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
					children: error ?? detail ?? SHARED_NOTE
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					style: primaryButtonStyle,
					disabled: busy,
					onClick: onStart,
					children: busy ? "启动中…" : "启动"
				})]
			});
		}
		/** The Computer entry: Setup → Ready → Running, rendered inside the Channel sidebar. */
		function ComputerEntry({ botSlug }) {
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
						body: JSON.stringify({ authorize: true })
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
			const onApprove = (0, react.useCallback)((remember) => {
				if (remember) {
					globalThis.sessionStorage?.setItem(APPROVED_KEY, "1");
					setApproved(true);
				}
			}, []);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ComputerEntryView, {
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
				...botSlug === void 0 ? {} : { botSlug },
				onStart,
				onStop: () => void act(STOP_ENDPOINT),
				onApprove,
				onCancel: () => setConfirming(false)
			});
		}
		function apply(ctx) {
			ctx.inject(["channelSidebar"], (sidebarCtx) => {
				const registry = sidebarCtx.channelSidebar;
				if (registry === void 0) return;
				ctx.effect(() => registry.register({
					id: ENTRY_ID,
					label: "电脑",
					order: 40,
					scope: "personabot",
					component: ComputerEntry
				}), "botharness-computer: channel sidebar entry");
			});
		}
		//#endregion
		exports.ComputerEntry = ComputerEntry;
		exports.ComputerEntryView = ComputerEntryView;
		exports.apply = apply;
		exports.inject = inject;
		exports.name = name;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map