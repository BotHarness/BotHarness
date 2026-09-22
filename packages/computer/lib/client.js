window.__ModuleLoader__.load({
	id: "@botharness/computer",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_dom = require("react-dom");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region packages/computer/src/client/index.tsx
		const name = "botharness-computer-client";
		/**
		* The Channel sidebar registry is a client-side service provided by
		* `@botharness/client`; the entry types are duplicated structurally so this
		* bundle stays self-contained (importing that package at runtime would inline
		* its client code into ours).
		*/
		const inject = ["channelSidebar", "connection"];
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
						const surface = (iframeRef.current?.contentDocument ?? null)?.getElementById("videoCanvas");
						if (surface !== null) live = (surface instanceof HTMLVideoElement ? surface.videoWidth : surface.width) > 0;
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
					background: "#000",
					color: "#fff"
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
							stroke: "rgba(255,255,255,0.18)",
							strokeWidth: stroke
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
							cx: size / 2,
							cy: size / 2,
							r: radius,
							fill: "none",
							stroke: "#fff",
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
						border: "1px solid var(--dsh-border, #3a3a3a)",
						borderRadius: 8
					} : { height: "100%" },
					overflow: "hidden",
					background: "#000"
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
		/** minimize-2: two arrows converging, used to collapse the fullscreen viewer. */
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
		/**
		* Running state: an AgentScreen-style resting card. While the stream connects
		* (or reconnects) it shows the shared indicator; once live, a hover mask blocks
		* input and offers 「打开」, which expands to the fullscreen viewer. Only one
		* viewer iframe is mounted at a time.
		*/
		function RunningCard({ botSlug, busy, stopping, onStop }) {
			const inlineRef = (0, react.useRef)(null);
			const fullRef = (0, react.useRef)(null);
			const dialogRef = (0, react.useRef)(null);
			const [hovered, setHovered] = (0, react.useState)(false);
			const [expanded, setExpanded] = (0, react.useState)(false);
			const [reloadKey, setReloadKey] = (0, react.useState)(0);
			const [reconnecting, setReconnecting] = (0, react.useState)(false);
			const wasReady = (0, react.useRef)(false);
			const title = `${botSlug ?? "PersonaBot"} 的屏幕`;
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
					if (event.key === "Escape") {
						setExpanded(false);
						return;
					}
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
			const indicatorLabel = reconnecting ? "正在重新连接" : "连接中";
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: {
					display: "flex",
					flexDirection: "column",
					gap: 8
				},
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						role: ready && !expanded ? "button" : void 0,
						tabIndex: ready && !expanded ? 0 : void 0,
						"aria-label": ready ? "打开大屏" : indicatorLabel,
						onMouseEnter: () => setHovered(true),
						onMouseLeave: () => setHovered(false),
						onClick: () => {
							if (ready && !expanded) setExpanded(true);
						},
						onKeyDown: (event) => {
							if (!ready || expanded) return;
							if (event.key !== "Enter" && event.key !== " ") return;
							event.preventDefault();
							setExpanded(true);
						},
						style: {
							position: "relative",
							cursor: ready && !expanded ? "pointer" : "default"
						},
						children: expanded ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							style: {
								position: "relative",
								width: "100%",
								aspectRatio: `${String(DESIGN_WIDTH)} / ${String(DESIGN_HEIGHT)}`,
								display: "grid",
								placeItems: "center",
								border: "1px solid var(--dsh-border, #3a3a3a)",
								borderRadius: 8,
								background: "#000",
								color: "#fff",
								fontSize: 12.5,
								opacity: .8
							},
							children: "已在大屏打开"
						}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ScaledFrame, {
							title,
							interactive: false,
							iframeRef: inlineRef
						}, reloadKey), !inlineReady ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ScreenIndicator, { label: indicatorLabel }) : hovered ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							style: {
								position: "absolute",
								inset: 0,
								display: "grid",
								placeItems: "center",
								background: "rgba(17,19,24,0.18)",
								borderRadius: 8
							},
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: {
									display: "inline-flex",
									alignItems: "center",
									gap: 6,
									padding: "6px 12px",
									borderRadius: 999,
									background: "var(--dsh-accent, #4d6bfe)",
									color: "#fff",
									fontSize: 12.5,
									fontWeight: 500
								},
								children: "⤢ 打开"
							})
						}) : null] })
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: {
							fontSize: 13,
							fontWeight: 500,
							opacity: .9
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
							style: buttonStyle,
							disabled: busy || stopping,
							onClick: onStop,
							children: busy || stopping ? "停止中…" : "停止"
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							style: buttonStyle,
							onClick: () => {
								setReconnecting(true);
								setReloadKey((key) => key + 1);
							},
							title: "重新连接画面",
							children: "重新连接"
						})]
					}),
					expanded ? (0, react_dom.createPortal)(/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						ref: dialogRef,
						role: "dialog",
						"aria-modal": "true",
						"aria-label": title,
						tabIndex: -1,
						style: {
							position: "fixed",
							inset: 0,
							zIndex: 100,
							display: "flex",
							flexDirection: "column",
							background: "#000",
							color: "#fff"
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: {
								display: "flex",
								alignItems: "center",
								gap: 8,
								height: 44,
								flex: "0 0 auto",
								padding: "0 8px 0 14px",
								borderBottom: "1px solid var(--dsh-border, #2c2c2c)"
							},
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", {
									style: {
										fontSize: 13,
										fontWeight: 600
									},
									children: title
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { style: { flex: 1 } }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									onClick: () => setExpanded(false),
									"aria-label": "收起全屏",
									title: "收起全屏",
									style: {
										...buttonStyle,
										display: "inline-flex",
										alignItems: "center",
										gap: 6
									},
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CollapseIcon, {})
								})
							]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: {
								position: "relative",
								flex: 1,
								minHeight: 0
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ScaledFrame, {
								title,
								interactive: true,
								fit: "contain",
								iframeRef: fullRef
							}, reloadKey), !fullReady ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ScreenIndicator, { label: indicatorLabel }) : null]
						})]
					}), document.body) : null
				]
			});
		}
		/** Pure three-state view; the container component supplies data and handlers. */
		function ComputerEntryView(props) {
			const { state, phase, detail, progress, runtimeAvailable, confirming, busy, elapsed, nowTs, error, botSlug, onStart, onConfirmStart, onStop, onApprove, onCancel } = props;
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
							onClick: onConfirmStart,
							children: "授权并启动"
						})]
					})
				]
			});
			const inProgress = phase === "pulling" || phase === "starting" || phase === "stopping" || phase === "exporting" || phase === "importing";
			if (state === "running") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(RunningCard, {
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
		function ComputerEntry({ botSlug }) {
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
				onStart,
				onConfirmStart,
				onStop: () => void act(STOP_ENDPOINT),
				onApprove,
				onCancel: () => setConfirming(false)
			});
		}
		function apply(ctx) {
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
			ctx.inject(["channelSidebar", "connection"], (sidebarCtx) => {
				const registry = sidebarCtx.channelSidebar;
				connectionRpc = sidebarCtx.connection?.rpc;
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
		exports.ScreenIndicator = ScreenIndicator;
		exports.apply = apply;
		exports.inject = inject;
		exports.name = name;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map