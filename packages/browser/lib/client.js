window.__ModuleLoader__.load({
	id: "@botharness/browser",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		let react_jsx_runtime = require("react/jsx-runtime");
		let react_dom = require("react-dom");
		//#region packages/client/src/client/mounted-resource.ts
		function useMountedResource(start, dependencies) {
			const cleanup = (0, react.useRef)(void 0);
			return (0, react.useCallback)((node) => {
				cleanup.current?.();
				cleanup.current = void 0;
				if (node !== null) cleanup.current = start(node) || void 0;
			}, dependencies);
		}
		//#endregion
		//#region packages/client/src/client/remote-viewer/tokens.ts
		const BH = {
			labelSecondary: "var(--dsw-alias-label-secondary)",
			hoverFill: "var(--dsw-alias-interactive-bg-hover)",
			errorPrimary: "var(--dsw-alias-state-error-primary)",
			radiusMd: "var(--dsw-radius-md)",
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
		const VIDEO_SURFACE = {
			background: "#000000",
			spinnerTrack: "rgba(255, 255, 255, 0.18)",
			spinnerArc: "#ffffff",
			onVideo: "#ffffff"
		};
		//#endregion
		//#region packages/client/src/client/remote-viewer/viewer-state.ts
		function nextExpanded(action) {
			return action === "open";
		}
		function smoothPhase(shown, raw, streak) {
			if (raw === "live") return {
				phase: "live",
				streak: 0
			};
			if (shown !== "live") return {
				phase: raw,
				streak: 0
			};
			const next = streak + 1;
			if (next >= 2) return {
				phase: raw,
				streak: next
			};
			return {
				phase: shown,
				streak: next
			};
		}
		function dotStateFor(phase) {
			if (phase === "live") return "done";
			if (phase === "empty") return "error";
			return "ongoing";
		}
		function statusKeyFor(phase, reconnecting) {
			if (phase === "live") return "entry.live";
			if (phase === "empty") return "entry.noScreen";
			return reconnecting ? "entry.reconnecting" : "entry.connecting";
		}
		function stopKey(busy, stopping) {
			return busy || stopping ? "entry.stopping" : "entry.stop";
		}
		const STATUS_ELEMENT_ID = "status-display";
		const BUSY_TEXT = /connecting|reconnect|disconnect|failed|error/i;
		function hashBytes(data) {
			let hash = 2174524869;
			for (let index = 0; index < data.length; index += 1) {
				hash ^= data[index] ?? 0;
				hash = Math.imul(hash, 16777619);
			}
			return hash >>> 0;
		}
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
		function shouldRemountLoss(lossStreak) {
			return lossStreak >= 3;
		}
		function shouldAutoReload(phase, everLive, attempts) {
			return phase === "empty" && !everLive && attempts < 3;
		}
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
				tracker: {
					...withSignature({
						misses: 0,
						busyStreak: 0,
						quiet: 0
					}, signature),
					live: true
				},
				phase: "live"
			};
			if (signature === void 0) return {
				tracker: {
					misses: 0,
					busyStreak: 0,
					quiet: 0,
					live: true
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
			if (prev.live === true || quiet >= 4) return {
				tracker: {
					...withSignature({
						misses: 0,
						busyStreak: 0,
						quiet
					}, signature),
					live: true
				},
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
		//#region packages/client/src/client/remote-viewer/index.tsx
		const SPIN_STYLE = "@keyframes bc-spin { to { transform: rotate(360deg); } }";
		function useStreamPhase(onSample) {
			return useMountedResource((iframe) => {
				let active = true;
				let tracker = {
					misses: 0,
					busyStreak: 0,
					quiet: 0
				};
				let timer;
				const check = () => {
					if (!active) return;
					let doc = null;
					try {
						doc = iframe.contentDocument;
					} catch {
						doc = null;
					}
					const next = nextStreamTracker(tracker, sampleSurface(doc));
					tracker = next.tracker;
					onSample(next.phase);
					timer = setTimeout(check, 1e3);
				};
				timer = setTimeout(check, 300);
				return () => {
					active = false;
					if (timer !== void 0) clearTimeout(timer);
				};
			}, [onSample]);
		}
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
		function ScaledFrame({ src, title, design, interactive, fit = "width", iframeRef }) {
			const DESIGN_WIDTH = design.width;
			const DESIGN_HEIGHT = design.height;
			const [box, setBox] = (0, react.useState)({
				width: DESIGN_WIDTH,
				height: DESIGN_HEIGHT
			});
			const resizeResource = useMountedResource((element) => {
				const frame = element.querySelector("iframe");
				if (frame !== null) {
					frame.inert = !interactive;
					if (!interactive) frame.blur();
				}
				const update = () => setBox({
					width: element.clientWidth,
					height: element.clientHeight
				});
				update();
				const observer = new ResizeObserver(update);
				observer.observe(element);
				return () => observer.disconnect();
			}, [interactive]);
			const scale = fit === "contain" ? Math.min(box.width / DESIGN_WIDTH, box.height / DESIGN_HEIGHT) : box.width / DESIGN_WIDTH;
			const offsetX = fit === "contain" ? Math.max(0, (box.width - DESIGN_WIDTH * scale) / 2) : 0;
			const offsetY = fit === "contain" ? Math.max(0, (box.height - DESIGN_HEIGHT * scale) / 2) : 0;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				ref: resizeResource,
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
					src,
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
		function StopButton({ t, busy, stopping, onStop }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
				variant: "ghost",
				size: "sm",
				disabled: busy || stopping,
				onClick: onStop,
				children: busy || stopping ? t("entry.stopping") : t("entry.stop")
			});
		}
		function ViewerTitleBar(props) {
			const { t, title, phase, reconnecting, busy, stopping, interactive, extraControls, onToggleInteractive, onStop, onCollapse } = props;
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
					interactive ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						style: {
							fontSize: 12,
							opacity: .65
						},
						children: t("entry.watchOnly")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { style: { flex: 1 } }),
					extraControls,
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
						variant: interactive ? "ghost" : "primary",
						size: "sm",
						"aria-pressed": interactive,
						onClick: onToggleInteractive,
						disabled: busy || stopping,
						title: t(interactive ? "entry.interactive.disable" : "entry.interactive.enable"),
						children: t(interactive ? "entry.interactive.disable" : "entry.interactive.enable")
					}),
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
		function RemoteViewer({ t, title, src, design, busy, stopping, onStop, footer, notice, extraControls, onEvent, interactive, onToggleInteractive, onDisableInteraction, expanded: controlledExpanded, onExpandedChange }) {
			const entryRef = (0, react.useRef)(null);
			const mounted = (0, react.useRef)(false);
			const [hovered, setHovered] = (0, react.useState)(false);
			const [ownExpanded, setOwnExpanded] = (0, react.useState)(false);
			const expanded = controlledExpanded ?? ownExpanded;
			const setExpanded = (next) => {
				setOwnExpanded(next);
				onExpandedChange?.(next);
			};
			const [inputEnabled, setInputEnabled] = (0, react.useState)(false);
			const [reloadKey, setReloadKey] = (0, react.useState)(0);
			const [reconnecting, setReconnecting] = (0, react.useState)(false);
			const wasReady = (0, react.useRef)(false);
			const autoReloads = (0, react.useRef)(0);
			const lossStreak = (0, react.useRef)(0);
			const phaseRef = (0, react.useRef)("connecting");
			const [smooth, setSmooth] = (0, react.useState)({
				phase: "connecting",
				streak: 0
			});
			const resetFrame = (0, react.useCallback)(() => {
				phaseRef.current = "connecting";
				setSmooth({
					phase: "connecting",
					streak: 0
				});
				setReloadKey((key) => key + 1);
			}, []);
			const streamRef = useStreamPhase((0, react.useCallback)((nextPhase) => {
				const fromPhase = phaseRef.current;
				if (fromPhase !== nextPhase) {
					phaseRef.current = nextPhase;
					setSmooth((current) => smoothPhase(current.phase, nextPhase, current.streak));
					onEvent?.({
						type: "phase",
						from: fromPhase,
						to: nextPhase
					});
				}
				if (nextPhase === "live") {
					wasReady.current = true;
					autoReloads.current = 0;
					lossStreak.current = 0;
					setReconnecting(false);
					return;
				}
				if (wasReady.current) {
					lossStreak.current += 1;
					if (shouldRemountLoss(lossStreak.current)) {
						wasReady.current = false;
						lossStreak.current = 0;
						onEvent?.({
							type: "loss-remount",
							streak: 3
						});
						setReconnecting(true);
						resetFrame();
						return;
					}
				}
				if (fromPhase !== nextPhase && shouldAutoReload(nextPhase, wasReady.current, autoReloads.current)) {
					autoReloads.current += 1;
					onEvent?.({
						type: "auto-reload",
						attempt: autoReloads.current
					});
					resetFrame();
				}
			}, [resetFrame, onEvent]));
			const phase = smooth.phase;
			const reconnect = () => {
				onEvent?.({ type: "manual-retry" });
				setReconnecting(true);
				autoReloads.current = 0;
				lossStreak.current = 0;
				wasReady.current = false;
				resetFrame();
			};
			const openViewer = () => {
				setExpanded(nextExpanded("open"));
				onEvent?.({
					type: "overlay",
					open: true
				});
			};
			const collapseViewer = () => {
				setInputEnabled(false);
				onDisableInteraction?.();
				setExpanded(nextExpanded("collapse"));
				onEvent?.({
					type: "overlay",
					open: false
				});
				requestAnimationFrame(() => entryRef.current?.focus());
			};
			const dialogResource = useMountedResource((dialog) => {
				if (!mounted.current) {
					mounted.current = true;
					onEvent?.({ type: "mount" });
				}
				if (!expanded) return;
				const onKey = (event) => {
					if (event.key !== "Tab") return;
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
				const previousOverflow = document.body.style.overflow;
				document.body.style.overflow = "hidden";
				dialog.focus();
				return () => {
					document.removeEventListener("keydown", onKey);
					document.body.style.overflow = previousOverflow;
				};
			}, [
				expanded,
				onDisableInteraction,
				onEvent
			]);
			const statusText = t(statusKeyFor(phase, reconnecting));
			const openable = phase === "live" && !expanded;
			const overlay = /* @__PURE__ */ (0, react_jsx_runtime.jsx)(StreamOverlay, {
				phase,
				reconnecting,
				hovered: expanded ? false : hovered,
				t,
				onRetry: reconnect,
				onOpen: openViewer
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
				ref: dialogResource,
				"data-bh-remote-viewer-fullscreen": expanded ? "" : void 0,
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
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("style", { children: SPIN_STYLE }),
					expanded ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ViewerTitleBar, {
						t,
						title,
						phase,
						reconnecting,
						busy,
						stopping,
						extraControls,
						interactive: interactive ?? inputEnabled,
						onToggleInteractive: onToggleInteractive ?? (() => setInputEnabled((current) => !current)),
						onStop,
						onCollapse: collapseViewer
					}, "viewer-titlebar") : null,
					notice,
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						ref: entryRef,
						role: openable ? "button" : void 0,
						tabIndex: openable ? 0 : void 0,
						"aria-label": openable ? t("entry.openFullscreen") : statusText,
						onMouseEnter: () => setHovered(true),
						onMouseLeave: () => setHovered(false),
						onClick: () => {
							if (openable) openViewer();
						},
						onKeyDown: (event) => {
							if (!openable) return;
							if (event.key !== "Enter" && event.key !== " ") return;
							event.preventDefault();
							openViewer();
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
							src,
							title,
							design,
							interactive: expanded && (interactive ?? inputEnabled),
							fit: expanded ? "contain" : "width",
							iframeRef: streamRef
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
						footer
					] }, "viewer-chrome")
				]
			});
		}
		//#endregion
		//#region packages/browser/src/client/locale.ts
		const LOCALE_NS = "botharness-browser";
		const zh = {
			"entry.profile.install": "安装 BotHarness Profile 控制扩展",
			"entry.profile.instructions": "在 BotHarness Profile 控制扩展中输入地址和配对码，并确认允许整个 Profile。",
			"entry.profile.forget": "解除 Profile 配对",
			"entry.profile.disconnected": "Profile 已配对，连接已断开",
			"entry.profile.connected": "Profile 已连接",
			"entry.profile.pair": "配对 Chrome Profile",
			"entry.profile.scope": "此 Chrome Profile 的所有普通网页标签页",
			"settings.profile-control": "日常 Chrome · 整个 Profile",
			"settings.daily-control": "日常 Chrome · 控制",
			"entry.daily.install": "安装 Playwright 扩展",
			"entry.daily.connect": "连接现有页面",
			"entry.daily.select": "请在 Chrome 中选择一个现有标签页",
			"entry.daily.confirm": "已连接，尚未允许操作",
			"entry.daily.controlled": "已允许此页面的读取、输入和点击",
			"entry.daily.allow": "允许控制此页面",
			"entry.live": "已连接",
			"entry.noScreen": "暂无画面",
			"entry.connecting": "连接中",
			"entry.reconnecting": "正在重新连接",
			"entry.reconnect": "重新连接",
			"entry.openFullscreen": "打开大屏",
			"entry.collapseFullscreen": "收起全屏",
			"entry.interactive.disable": "停止交互",
			"entry.interactive.enable": "开启交互",
			"entry.watchOnly": "观看模式",
			"entry.stop": "停止",
			"entry.stopping": "停止中",
			"settings.localDriver": "本机驱动",
			"settings.driver.current": "默认",
			"settings.driver.agent-browser": "agent-browser（试用）",
			"settings.target": "操作目标",
			"settings.local": "本机 Browser",
			"settings.container": "Docker Browser",
			"settings.extension": "日常浏览器",
			"entry.borrow.none": "尚未借用标签页",
			"entry.borrow.readOnly": "只读借用中",
			"entry.borrow.pair": "连接浏览器扩展",
			"entry.borrow.return": "归还标签页",
			"entry.borrow.code": "配对码",
			"entry.borrow.cancel": "取消配对",
			"entry.borrow.instructions": "在扩展中输入此地址和配对码，再选择借出当前页面。配对码 5 分钟内有效，仅可使用一次。",
			"entry.view.interaction": "允许 Human 操作",
			"entry.view.close": "关闭",
			"entry.view.container": "容器浏览器",
			"entry.label": "浏览器",
			"entry.access.title": "Browser Access",
			"entry.access.enable": "启用 Browser Access",
			"entry.access.disable": "停用 Browser Access",
			"entry.access.failed": "切换 Browser Access 失败",
			"entry.access.failureHint": "授权失败",
			"entry.profile.label": "Profile",
			"entry.profile.default": "default",
			"entry.profile.failed": "切换浏览器 profile 失败",
			"entry.profile.choose": "选择浏览器 Profile",
			"entry.profile.create": "创建“{name}”",
			"entry.view.follow": "跟随 Bot",
			"entry.view.pause": "暂停 Bot",
			"entry.view.resume": "继续",
			"entry.view.open": "打开 Bot 浏览器",
			"entry.view.stop": "停止",
			"entry.view.opening": "正在打开…",
			"entry.view.noFrame": "暂无画面",
			"entry.view.noTabs": "暂无标签页",
			"entry.error": "浏览器操作失败"
		};
		const en = {
			"entry.profile.install": "Install BotHarness Profile Control extension",
			"entry.profile.instructions": "Enter the address and code in the BotHarness Profile Control extension and confirm Profile-wide access.",
			"entry.profile.forget": "Forget Profile pairing",
			"entry.profile.disconnected": "Profile paired · disconnected",
			"entry.profile.connected": "Profile connected",
			"entry.profile.pair": "Pair Chrome Profile",
			"entry.profile.scope": "All ordinary webpage tabs in this Chrome Profile",
			"settings.profile-control": "Daily Chrome · Entire Profile",
			"settings.daily-control": "Daily Chrome · Control",
			"entry.daily.install": "Install Playwright extension",
			"entry.daily.connect": "Connect existing page",
			"entry.daily.select": "Select one existing Chrome tab",
			"entry.daily.confirm": "Connected · control not granted",
			"entry.daily.controlled": "This document allows observe, type and click",
			"entry.daily.allow": "Allow control of this document",
			"entry.live": "Connected",
			"entry.noScreen": "No screen",
			"entry.connecting": "Connecting",
			"entry.reconnecting": "Reconnecting",
			"entry.reconnect": "Reconnect",
			"entry.openFullscreen": "Open fullscreen",
			"entry.collapseFullscreen": "Leave fullscreen",
			"entry.interactive.disable": "Disable interaction",
			"entry.interactive.enable": "Enable interaction",
			"entry.watchOnly": "Watch only",
			"entry.stop": "Stop",
			"entry.stopping": "Stopping",
			"settings.localDriver": "Local driver",
			"settings.driver.current": "Default",
			"settings.driver.agent-browser": "agent-browser (trial)",
			"settings.target": "Browser Target",
			"settings.local": "Local Browser",
			"settings.container": "Docker Browser",
			"settings.extension": "Daily Browser",
			"entry.borrow.none": "No shared tab",
			"entry.borrow.readOnly": "Shared read-only",
			"entry.borrow.pair": "Connect browser extension",
			"entry.borrow.return": "Return tab",
			"entry.borrow.code": "Pairing code",
			"entry.borrow.cancel": "Cancel pairing",
			"entry.borrow.instructions": "Enter this address and code in the extension, then share the current page. The code expires in 5 minutes and can be used once.",
			"entry.view.interaction": "Enable Human interaction",
			"entry.view.close": "Close",
			"entry.view.container": "Container Browser",
			"entry.label": "Browser",
			"entry.access.title": "Browser Access",
			"entry.access.enable": "Enable Browser Access",
			"entry.access.disable": "Disable Browser Access",
			"entry.access.failed": "Failed to switch Browser Access",
			"entry.access.failureHint": "Access failed",
			"entry.profile.label": "Profile",
			"entry.profile.default": "default",
			"entry.profile.failed": "Failed to switch the browser profile",
			"entry.profile.choose": "Choose browser profile",
			"entry.profile.create": "Create “{name}”",
			"entry.view.follow": "Follow the Bot",
			"entry.view.pause": "Pause Bot",
			"entry.view.resume": "Resume",
			"entry.view.open": "Open Bot Browser",
			"entry.view.stop": "Stop",
			"entry.view.opening": "Opening…",
			"entry.view.noFrame": "No frame yet",
			"entry.view.noTabs": "No tabs yet",
			"entry.error": "Browser action failed"
		};
		//#endregion
		//#region packages/browser/src/client/profile-combobox.tsx
		function ProfileCombobox({ value, profiles, disabled, invalid, errorId, onSelect, t }) {
			const root = (0, react.useRef)(null);
			const panel = (0, react.useRef)(null);
			const listId = (0, react.useId)();
			const [open, setOpen] = (0, react.useState)(false);
			const [query, setQuery] = (0, react.useState)(void 0);
			const [active, setActive] = (0, react.useState)(void 0);
			const names = [.../* @__PURE__ */ new Set([
				"default",
				...profiles,
				value === "" ? "default" : value
			])];
			const trimmed = query?.trim() ?? "";
			const options = names.filter((name) => name.toLowerCase().includes(trimmed.toLowerCase())).map((name) => ({
				name,
				label: name
			}));
			if (trimmed !== "" && !names.includes(trimmed)) options.push({
				name: trimmed,
				label: t("entry.profile.create", { name: trimmed })
			});
			const highlighted = options.findIndex((option) => option.name === active);
			const position = (0, _deepseek_ai_dsh_client_ui_primitives.useAnchoredPosition)({
				open,
				anchorRef: root,
				panelRef: panel,
				gap: 4,
				margin: 12
			});
			(0, _deepseek_ai_dsh_client_ui_primitives.useDismissOnOutsidePointer)(root, open, setOpen, panel);
			const dismiss = () => {
				setOpen(false);
				setQuery(void 0);
				setActive(void 0);
			};
			const select = (name) => {
				dismiss();
				onSelect(name);
			};
			const onKeyDown = (event) => {
				if (event.nativeEvent.isComposing) return;
				if (event.key === "Escape") {
					event.preventDefault();
					dismiss();
				} else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
					event.preventDefault();
					setOpen(true);
					const offset = event.key === "ArrowDown" ? 1 : -1;
					const index = highlighted < 0 ? offset === 1 ? 0 : options.length - 1 : (highlighted + offset + options.length) % options.length;
					setActive(options[index]?.name);
					document.getElementById(`${listId}-${index}`)?.scrollIntoView?.({ block: "nearest" });
				} else if (event.key === "Enter" && open) {
					event.preventDefault();
					const choice = options[highlighted]?.name ?? (query === void 0 ? value === "" ? "default" : value : trimmed || "default");
					select(choice);
				}
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "bh-browser-profile-combobox",
				ref: root,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
						className: "bh-browser-profile-input",
						role: "combobox",
						"aria-label": t("entry.profile.label"),
						"aria-expanded": open,
						"aria-autocomplete": "list",
						"aria-controls": open ? listId : void 0,
						"aria-activedescendant": open && highlighted >= 0 ? `${listId}-${highlighted}` : void 0,
						"aria-invalid": invalid,
						"aria-describedby": invalid ? errorId : void 0,
						value: query ?? (value === "" ? "default" : value),
						disabled,
						autoComplete: "off",
						onFocus: () => setOpen(true),
						onChange: (event) => {
							setQuery(event.target.value);
							setActive(void 0);
							setOpen(true);
						},
						onBlur: dismiss,
						onKeyDown
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						className: "bh-browser-profile-toggle",
						type: "button",
						"aria-label": t("entry.profile.choose"),
						disabled,
						tabIndex: -1,
						onPointerDown: (event) => event.preventDefault(),
						onClick: () => {
							if (open) dismiss();
							else {
								root.current?.querySelector("input")?.focus();
								setOpen(true);
							}
						},
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronDownOutlineRegular, { size: 16 })
					}),
					open && !disabled ? (0, react_dom.createPortal)(/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.MenuSurface, {
						compact: true,
						ref: panel,
						id: listId,
						role: "listbox",
						"aria-label": t("entry.profile.label"),
						className: "bh-browser-profiles",
						style: {
							...position,
							width: root.current?.getBoundingClientRect().width ?? 200,
							visibility: position === null ? "hidden" : void 0
						},
						children: options.map((option, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							id: `${listId}-${index}`,
							type: "button",
							role: "option",
							"aria-selected": option.name === (value === "" ? "default" : value),
							"data-active": index === highlighted || void 0,
							tabIndex: -1,
							onPointerDown: (event) => event.preventDefault(),
							onMouseEnter: () => setActive(option.name),
							onClick: () => select(option.name),
							children: option.label
						}, option.name))
					}), document.body) : null
				]
			});
		}
		//#endregion
		//#region packages/browser/src/client/settings.tsx
		function ConfigChoice({ scope, field, value, writable, title, items }) {
			const [open, setOpen] = (0, react.useState)(false);
			const [saving, setSaving] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)();
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "bh-settings-row",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "bh-settings-row-title",
					children: title
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Menu, {
					portal: true,
					align: "end",
					open,
					selectedId: value,
					items,
					onClose: () => setOpen(false),
					onSelect: (id) => {
						setOpen(false);
						if (!items.some((item) => item.id === id)) return;
						setSaving(true);
						setError(void 0);
						scope.set(field, id).then(() => {
							if (scope.getSnapshot().value?.[field] !== id) throw new Error("Browser setting was not saved");
						}).catch((cause) => setError(String(cause))).finally(() => setSaving(false));
					},
					anchor: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
						type: "button",
						className: "bh-settings-selector",
						"aria-haspopup": "menu",
						"aria-expanded": open,
						disabled: !writable || saving,
						onClick: () => setOpen(!open),
						children: [items.find((item) => item.id === value)?.label ?? value, /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronDownOutlineRegular, {})]
					})
				})]
			}), error === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				role: "alert",
				className: "bh-browser-error",
				children: error
			})] });
		}
		function BrowserTargetSettings({ scope, t }) {
			const store = (0, react.useMemo)(() => ({
				subscribe: (listener) => scope.subscribe(listener),
				getSnapshot: () => scope.getSnapshot()
			}), [scope]);
			const snapshot = (0, react.useSyncExternalStore)(store.subscribe, store.getSnapshot);
			const target = snapshot.value?.target ?? "local";
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "bh-settings-rows bh-browser-settings",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "bh-settings-section-head",
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "bh-settings-section-title",
							children: "Browser"
						})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ConfigChoice, {
						scope,
						field: "target",
						value: target,
						writable: snapshot.writable,
						title: t("settings.target"),
						items: [
							"local",
							"container",
							"extension",
							"daily-control",
							"profile-control"
						].map((id) => ({
							id,
							label: t(`settings.${id}`)
						}))
					}),
					target !== "local" ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ConfigChoice, {
						scope,
						field: "localDriver",
						value: snapshot.value?.localDriver ?? "current",
						writable: snapshot.writable,
						title: t("settings.localDriver"),
						items: ["current", "agent-browser"].map((id) => ({
							id,
							label: t(`settings.driver.${id}`)
						}))
					})
				]
			});
		}
		function registerBrowserSettings(ctx, t) {
			ctx.inject(["configForms", "slots"], (settingsCtx) => {
				const native = settingsCtx;
				const scope = native.configForms.get("botharness-browser");
				return native.slots.inject("botharness.settings.item", () => native.slots.register({
					name: "botharness.settings.item",
					id: "browser",
					order: 11,
					locale: LOCALE_NS,
					inject: () => ({
						scope,
						t
					})
				}, BrowserTargetSettings));
			});
		}
		//#endregion
		//#region packages/browser/src/client/profile-browser.tsx
		function ProfileBrowserControl({ slug, view, paused, enabled, t, refresh }) {
			const [pair, setPair] = (0, react.useState)();
			const [busy, setBusy] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)();
			const active = (0, react.useRef)(false);
			const sequence = (0, react.useRef)(0);
			const resource = (0, react.useCallback)((node) => {
				active.current = node !== null;
				if (node === null) sequence.current += 1;
			}, []);
			const invoke = (action) => {
				if (slug === void 0 || busy) return;
				const request = ++sequence.current;
				setBusy(true);
				setError(void 0);
				setPair(void 0);
				fetch(action === "pause" ? "/api/browser/takeover" : `/api/browser/profile/${action}`, {
					method: "POST",
					cache: "no-store",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						slug,
						...action === "pause" ? { active: !paused } : {}
					})
				}).then(async (response) => {
					const body = await response.json();
					if (!response.ok || !body.ok) throw new Error(body.error ?? t("entry.error"));
					if (!active.current || sequence.current !== request) return;
					if (action === "pair" && body.code !== void 0 && body.expiresAt !== void 0) setPair({
						code: body.code,
						expiresAt: body.expiresAt
					});
				}).catch((cause) => {
					if (active.current && sequence.current === request) setError(cause instanceof Error ? cause.message : t("entry.error"));
				}).finally(() => {
					if (active.current && sequence.current === request) {
						setBusy(false);
						refresh();
					}
				});
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				ref: resource,
				className: "bh-browser-body bh-browser-borrow",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: t("settings.profile-control") }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("entry.profile.scope") }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("a", {
						className: "bh-browser-daily-install",
						href: "https://github.com/BotHarness/BotHarness/blob/main/docs/daily-browser.md#chrome-profile-control",
						target: "_blank",
						rel: "noreferrer",
						children: t("entry.profile.install")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						role: "status",
						children: [view?.paired ? t(view.connected ? "entry.profile.connected" : "entry.profile.disconnected") : t("entry.view.noTabs"), view?.connected ? ` · ${view.tabs}` : ""]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
						size: "sm",
						disabled: busy,
						onClick: () => invoke(view?.paired ? "forget" : "pair"),
						children: t(view?.paired ? "entry.profile.forget" : "entry.profile.pair")
					}),
					view?.connected ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
						size: "sm",
						disabled: !enabled || busy,
						onClick: () => invoke("pause"),
						children: t(paused ? "entry.view.resume" : "entry.view.pause")
					}) : null,
					view?.paired || pair === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("entry.profile.instructions") }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
							"aria-label": t("entry.borrow.code"),
							value: pair.code,
							readOnly: true
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: location.origin })
					] }),
					error === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						role: "alert",
						className: "bh-browser-error",
						children: error
					})
				]
			});
		}
		//#endregion
		//#region packages/browser/src/client/daily-browser.tsx
		function DailyBrowserControl({ slug, view, enabled, paused, t, refresh }) {
			const [busy, setBusy] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)();
			const mounted = (0, react.useRef)(false);
			const resource = (0, react.useCallback)((node) => {
				mounted.current = node !== null;
			}, []);
			const invoke = (action) => {
				if (busy || slug === void 0) return;
				setBusy(true);
				setError(void 0);
				fetch(action === "pause" ? "/api/browser/takeover" : `/api/browser/daily/${action}`, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						slug,
						...action === "pause" ? { active: !paused } : {}
					})
				}).then(async (response) => {
					const body = await response.json();
					if (!response.ok || !body.ok) throw new Error(body.error ?? t("entry.error"));
				}).catch((cause) => {
					if (mounted.current) setError(cause instanceof Error ? cause.message : t("entry.error"));
				}).finally(() => {
					if (mounted.current) {
						setBusy(false);
						refresh();
					}
				});
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				ref: resource,
				className: "bh-browser-body bh-browser-borrow",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: t("settings.daily-control") }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("a", {
						className: "bh-browser-daily-install",
						href: "https://chromewebstore.google.com/detail/playwright-extension/mmlmfjhmonkocbjadbfplnigmagldckm",
						target: "_blank",
						rel: "noreferrer",
						children: t("entry.daily.install")
					}),
					view === null || view.state === "error" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
						size: "sm",
						disabled: !enabled || busy,
						onClick: () => invoke("connect"),
						children: t("entry.daily.connect")
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							role: "status",
							children: t(view.state === "connecting" ? "entry.daily.select" : view.state === "confirm" ? "entry.daily.confirm" : "entry.daily.controlled")
						}),
						view.url === "" ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", {
							className: "bh-browser-borrow-title",
							children: view.title || view.url
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "bh-browser-borrow-url",
							children: view.url
						})] }),
						view.state === "confirm" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
							size: "sm",
							disabled: !enabled || busy,
							onClick: () => invoke("grant"),
							children: t("entry.daily.allow")
						}) : null,
						view.state === "controlled" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
							size: "sm",
							disabled: busy,
							onClick: () => invoke("pause"),
							children: t(paused ? "entry.view.resume" : "entry.view.pause")
						}) : null,
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
							size: "sm",
							disabled: busy,
							onClick: () => invoke("return"),
							children: t(view.state === "connecting" ? "entry.borrow.cancel" : "entry.borrow.return")
						})
					] }),
					view?.error === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						role: "alert",
						className: "bh-browser-error",
						children: view.error
					}),
					error === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						role: "alert",
						className: "bh-browser-error",
						children: error
					})
				]
			});
		}
		//#endregion
		//#region packages/browser/src/client/borrowed-browser.tsx
		function BorrowedBrowser({ slug, tab, enabled, t, refresh }) {
			const [pair, setPair] = (0, react.useState)();
			const [busy, setBusy] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)();
			const active = (0, react.useRef)(false);
			const sequence = (0, react.useRef)(0);
			const resource = (0, react.useCallback)((node) => {
				active.current = node !== null;
				if (node === null) sequence.current += 1;
			}, []);
			const invoke = (action) => {
				if (slug === void 0 || busy) return;
				const request = ++sequence.current;
				setBusy(true);
				setError(void 0);
				setPair(void 0);
				fetch(`/api/browser/borrow/${action}`, {
					method: "POST",
					cache: "no-store",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ slug })
				}).then(async (response) => {
					const body = await response.json();
					if (!response.ok || !body.ok) throw new Error(body.error ?? t("entry.error"));
					if (!active.current || sequence.current !== request) return;
					if (action === "pair" && body.code !== void 0 && body.expiresAt !== void 0) setPair({
						code: body.code,
						expiresAt: body.expiresAt
					});
				}).catch((cause) => {
					if (active.current && sequence.current === request) setError(cause instanceof Error ? cause.message : t("entry.error"));
				}).finally(() => {
					if (active.current && sequence.current === request) {
						setBusy(false);
						refresh();
					}
				});
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				ref: resource,
				className: "bh-browser-body bh-browser-borrow",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: t("settings.extension") }),
					tab == null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("entry.borrow.none") }) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("entry.borrow.readOnly") }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", {
							className: "bh-browser-borrow-title",
							children: tab.title || tab.url
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "bh-browser-borrow-url",
							children: tab.url
						})
					] }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
						size: "sm",
						disabled: !enabled || busy,
						onClick: () => invoke(tab == null ? "pair" : "return"),
						children: t(tab == null ? "entry.borrow.pair" : "entry.borrow.return")
					}),
					tab != null || pair === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("entry.borrow.instructions") }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
							"aria-label": t("entry.borrow.code"),
							value: pair.code,
							readOnly: true
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: location.origin }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
							size: "sm",
							onClick: () => {
								sequence.current += 1;
								setPair(void 0);
								invoke("return");
							},
							children: t("entry.borrow.cancel")
						})
					] }),
					error === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						role: "alert",
						className: "bh-browser-error",
						children: error
					})
				]
			});
		}
		//#endregion
		//#region packages/browser/src/client/styles.ts
		const styles = `
.bh-browser-access-control { position: relative; display: flex; align-items: center; }
.bh-browser-borrow { display: grid; gap: 8px; font-size: 12.5px; }
.bh-browser-borrow-title, .bh-browser-daily-install { color: var(--bh-browser-label); text-underline-offset: 3px; }
.bh-browser-borrow-url { overflow-wrap: anywhere; }
.bh-browser-borrow-url { color: var(--bh-browser-secondary); }
.bh-browser-access-power {
  display: flex; align-items: center; justify-content: center; width: 28px; height: 28px;
  padding: 0; border: 0; border-radius: var(--dsw-radius-md); background: transparent;
  color: var(--dsw-alias-label-secondary); cursor: pointer;
}
.bh-browser-access-power:hover { background: var(--dsw-alias-interactive-bg-hover); }
.bh-browser-access-power[aria-pressed='true'] { color: var(--dsw-alias-state-business-primary); background: var(--dsw-alias-interactive-bg-hover); }
.bh-browser-access-power:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary); outline-offset: 2px; }
.bh-browser-access-power:disabled { opacity: 0.5; cursor: default; }
.bh-browser-access-power.bh-access-failed { color: var(--dsw-alias-state-error-primary); }
.bh-browser-access-error { order: -1; padding: 0 4px; color: var(--dsw-alias-state-error-primary); font-size: 11px; line-height: 16px; white-space: nowrap; }

/* @bh-browser-aliases:start */
.bh-browser-body, .bh-browser-profiles, .bh-browser-settings {
  --bh-browser-error: var(--dsw-alias-state-error-primary);
  --bh-browser-secondary: var(--dsw-alias-label-secondary);
  --bh-browser-label: var(--dsw-alias-label-primary);
  --bh-browser-hover: var(--dsw-alias-interactive-bg-hover);
  --bh-browser-elevation: var(--dsw-elevation-prominent);
  --bh-browser-stroke: var(--dsw-alias-border-l1);
  --bh-browser-radius: var(--dsw-radius-md);
}
/* @bh-browser-aliases:end */
.bh-browser-profile-combobox { position: relative; flex: 1; min-width: 0; }
.bh-browser-profile-input { display: flex; padding-right: 26px; }
.bh-browser-profile-combobox input { width: 100%; }
.bh-browser-profile-toggle {
  position: absolute; right: 4px; top: 4px; width: 24px; height: 24px;
  display: flex; align-items: center; justify-content: center;
  border: 0; border-radius: var(--bh-browser-radius); padding: 0;
  color: var(--bh-browser-label); background: transparent; cursor: pointer;
}
.bh-browser-profile-toggle:hover { background: var(--bh-browser-hover); }
.bh-browser-profile-toggle:disabled { opacity: 0.5; cursor: default; }
.bh-browser-profiles {
  position: fixed; z-index: 1100; padding: 4px; box-sizing: border-box;
  max-height: 240px; overflow-y: auto;
  --dsw-elevation-stroke-color: var(--bh-browser-stroke);
  box-shadow: var(--bh-browser-elevation);
}
.bh-browser-profiles > button {
  display: block; width: 100%; min-height: 34px; padding: 6px 8px;
  border: 0; border-radius: var(--bh-browser-radius); background: transparent;
  color: var(--bh-browser-label); text-align: left; font: inherit; font-size: 13px; line-height: 20px; cursor: pointer;
  overflow-wrap: anywhere;
}
.bh-browser-profiles > button:hover, .bh-browser-profiles > button[data-active] {
  background: var(--bh-browser-hover);
}
.bh-browser-tab {
  display: grid; width: 100%; min-width: 0; gap: 2px; padding: 6px;
  border: 0; border-radius: var(--bh-browser-radius); background: transparent;
  color: var(--bh-browser-label); text-align: left; font: inherit; cursor: pointer;
}
.bh-browser-tab:hover, .bh-browser-tab[aria-pressed="true"] { background: var(--bh-browser-hover); }
.bh-browser-tab:focus-visible { outline: 1px solid var(--bh-browser-label); outline-offset: -1px; }
.bh-browser-tab[aria-current="true"] .bh-browser-tab-title { font-weight: 600; }
.bh-browser-tab-title, .bh-browser-tab-url { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bh-browser-tab-url { color: var(--bh-browser-secondary); }
.bh-browser-error { color: var(--bh-browser-error); overflow-wrap: anywhere; }
`;
		//#endregion
		//#region packages/browser/src/client/access-power-icon.tsx
		function AccessPowerIcon() {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
				width: "16",
				height: "16",
				viewBox: "0 0 24 24",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: "2",
				strokeLinecap: "round",
				strokeLinejoin: "round",
				"aria-hidden": "true",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M12 2v10" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M18.4 6.6a9 9 0 1 1-12.77.04" })]
			});
		}
		//#endregion
		//#region packages/browser/src/client/index.tsx
		const ENTRY_ID = "botharness-browser";
		const OBSERVATION_ENDPOINT = "/api/browser/observation";
		const TAKEOVER_ENDPOINT = "/api/browser/takeover";
		const OPEN_ENDPOINT = "/api/browser/open";
		const STOP_ENDPOINT = "/api/browser/stop";
		const name = "botharness-browser-client";
		const inject = [
			"channelSidebar",
			"connection",
			"locale"
		];
		let connectionRpc;
		async function requestJson(url, init) {
			const response = await fetch(url, {
				cache: "no-store",
				...init
			});
			const body = await response.json();
			if (!response.ok || body.ok === false) throw new Error(body.error ?? `HTTP ${String(response.status)}`);
			return body;
		}
		function createBotInfoStore(botSlug) {
			let info = {
				displayName: void 0,
				browserAccess: void 0,
				browserProfile: void 0,
				profiles: []
			};
			const listeners = /* @__PURE__ */ new Set();
			let started = false;
			const load = () => {
				const rpc = connectionRpc;
				if (rpc === void 0 || botSlug === void 0) return;
				rpc.call("/api", "botharness/list", { args: {} }).then((result) => {
					if (!result.ok) return;
					const bots = result.value.bots ?? [];
					const match = bots.find((bot) => bot.slug === botSlug);
					if (match === void 0) return;
					const profiles = [...new Set(bots.map((bot) => typeof bot.browserProfile === "string" ? bot.browserProfile : "").filter((name) => name !== ""))].sort();
					info = {
						displayName: typeof match.displayName === "string" && match.displayName.length > 0 ? match.displayName : void 0,
						browserAccess: match.browserAccess === true,
						browserProfile: typeof match.browserProfile === "string" && match.browserProfile !== "" ? match.browserProfile : void 0,
						profiles
					};
					for (const listener of listeners) listener();
				}).catch(() => void 0);
			};
			return {
				setAccess(enabled) {
					info = {
						...info,
						browserAccess: enabled
					};
					for (const listener of listeners) listener();
				},
				subscribe(listener) {
					if (!started) {
						started = true;
						load();
					}
					listeners.add(listener);
					return () => {
						listeners.delete(listener);
					};
				},
				getSnapshot: () => info,
				refresh: load
			};
		}
		function observationUrl(botSlug, tabId) {
			const base = `${OBSERVATION_ENDPOINT}?slug=${encodeURIComponent(botSlug ?? "")}`;
			return tabId === void 0 || tabId === "" ? base : `${base}&tab=${encodeURIComponent(tabId)}`;
		}
		function createObservationStore(botSlug) {
			let value;
			let tab;
			let timer;
			let refreshing = false;
			let revision = 0;
			let refreshAgain = false;
			const listeners = /* @__PURE__ */ new Set();
			const refresh = async () => {
				if (refreshing) {
					refreshAgain = true;
					return;
				}
				refreshing = true;
				const requestedTab = tab;
				const requestedRevision = revision;
				try {
					const next = await requestJson(observationUrl(botSlug, requestedTab));
					if (tab === requestedTab && revision === requestedRevision) value = next;
				} catch {
					if (tab === requestedTab && revision === requestedRevision) value = void 0;
				} finally {
					refreshing = false;
				}
				for (const listener of listeners) listener();
				if (refreshAgain && listeners.size > 0) {
					refreshAgain = false;
					refresh();
				}
			};
			return {
				subscribe(listener) {
					listeners.add(listener);
					if (listeners.size === 1) {
						refresh();
						timer = setInterval(() => void refresh(), 1500);
					}
					return () => {
						listeners.delete(listener);
						if (listeners.size === 0 && timer !== void 0) {
							clearInterval(timer);
							timer = void 0;
						}
					};
				},
				getSnapshot: () => value,
				setTab(targetId) {
					tab = targetId;
					refresh();
				},
				confirmTakeover(active) {
					revision += 1;
					if (value !== void 0) value = {
						...value,
						takeover: active
					};
					for (const listener of listeners) listener();
				},
				refresh: () => void refresh()
			};
		}
		function BrowserHeaderAction({ botSlug, t, setExpandable, setExpanded }) {
			const [store] = (0, react.useState)(() => createBotInfoStore(botSlug));
			const [busy, setBusy] = (0, react.useState)(false);
			const inFlight = (0, react.useRef)(false);
			const [error, setError] = (0, react.useState)(false);
			const subscribe = (listener) => {
				const sync = () => {
					const access = store.getSnapshot().browserAccess === true;
					setExpandable?.(access);
				};
				const unsubscribe = store.subscribe(() => {
					sync();
					listener();
				});
				sync();
				return unsubscribe;
			};
			const info = (0, react.useSyncExternalStore)(subscribe, store.getSnapshot);
			const accessOn = info.browserAccess === true;
			const onToggle = (next) => {
				const rpc = connectionRpc;
				if (rpc === void 0 || botSlug === void 0 || inFlight.current) return;
				inFlight.current = true;
				setBusy(true);
				setError(false);
				rpc.call("/api", "botharness/browserAccessSet", { args: {
					slug: botSlug,
					enabled: next
				} }).then((result) => {
					if (!result.ok) {
						setError(true);
						return;
					}
					const applied = result.value.bot?.browserAccess === true;
					store.setAccess(applied);
					setExpandable?.(applied);
					setExpanded?.(applied);
				}).catch(() => {
					setError(true);
				}).finally(() => {
					inFlight.current = false;
					setBusy(false);
				});
			};
			const label = t(accessOn ? "entry.access.disable" : "entry.access.enable");
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
				className: "bh-browser-access-control",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tooltip, {
					label: error ? t("entry.access.failed") + ": " + label : label,
					side: "bottom",
					delayMs: 500,
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: `bh-browser-access-power${error ? " bh-access-failed" : ""}`,
						"aria-label": label,
						"aria-pressed": accessOn,
						"aria-busy": busy,
						disabled: busy || botSlug === void 0 || connectionRpc === void 0 || info.browserAccess === void 0,
						onClick: () => onToggle(!accessOn),
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(AccessPowerIcon, {})
					})
				}), error ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: "bh-browser-access-error",
					role: "alert",
					title: t("entry.access.failed"),
					children: t("entry.access.failureHint")
				}) : null]
			});
		}
		const buttonStyle = {
			padding: "4px 10px",
			borderRadius: 6,
			border: "1px solid currentColor",
			background: "transparent",
			color: "inherit",
			cursor: "pointer",
			fontSize: 12
		};
		function BrowserBody({ botSlug, t }) {
			const [store] = (0, react.useState)(() => createObservationStore(botSlug));
			const [infoStore] = (0, react.useState)(() => createBotInfoStore(botSlug));
			const observation = (0, react.useSyncExternalStore)(store.subscribe, store.getSnapshot);
			const info = (0, react.useSyncExternalStore)(infoStore.subscribe, infoStore.getSnapshot);
			const [follow, setFollow] = (0, react.useState)(true);
			const [preview, setPreview] = (0, react.useState)(void 0);
			const [busy, setBusy] = (0, react.useState)(false);
			const errorId = (0, react.useId)();
			const [profileInvalid, setProfileInvalid] = (0, react.useState)(false);
			const [profileOverride, setProfileOverride] = (0, react.useState)(void 0);
			const [error, setError] = (0, react.useState)(void 0);
			const [viewer, setViewer] = (0, react.useState)();
			const [interaction, setInteraction] = (0, react.useState)(false);
			const viewerScope = (0, react.useRef)("");
			const previousViewer = (0, react.useRef)({
				identity: "",
				url: void 0
			});
			const mounted = (0, react.useRef)(true);
			const viewerRequest = (0, react.useRef)(0);
			const interactionResource = (0, react.useCallback)((node) => {
				mounted.current = node !== null;
				if (node === null) viewerRequest.current += 1;
			}, []);
			const disableInteraction = (0, react.useCallback)(() => {
				viewerRequest.current += 1;
				setInteraction(false);
			}, []);
			const tabs = observation?.tabs ?? [];
			const focused = observation?.focused ?? null;
			const currentTab = tabs.find((tab) => tab.current);
			const orderedTabs = currentTab === void 0 ? tabs : [currentTab, ...tabs.filter((tab) => !tab.current)];
			const paused = observation?.takeover === true;
			const viewerUrl = observation?.target === "container" && observation.running ? observation.viewerUrl ?? void 0 : void 0;
			const identity = `${botSlug ?? ""}:${profileOverride ?? info.browserProfile ?? ""}:${observation?.target ?? ""}`;
			const scope = `${identity}:${viewerUrl ?? ""}`;
			const previous = previousViewer.current;
			if (viewerScope.current !== scope) {
				viewerScope.current = scope;
				viewerRequest.current += 1;
				previousViewer.current = {
					identity,
					url: viewerUrl
				};
				if (interaction) setInteraction(false);
				if ((previous.identity !== identity || previous.url !== void 0) && viewer !== void 0) setViewer(void 0);
			}
			if (!paused && interaction) setInteraction(false);
			const viewerTranslate = (key) => t(key);
			const toggleInteraction = () => {
				if (interaction) {
					disableInteraction();
					return;
				}
				if (busy || botSlug === void 0 || viewerUrl === void 0) return;
				const request = ++viewerRequest.current;
				const expectedScope = viewerScope.current;
				setBusy(true);
				setError(void 0);
				requestJson(TAKEOVER_ENDPOINT, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						slug: botSlug,
						active: true
					})
				}).then((result) => {
					if (mounted.current && request === viewerRequest.current && viewerScope.current === expectedScope) {
						store.confirmTakeover(result.takeover);
						setInteraction(result.takeover);
					}
				}).catch((cause) => {
					if (mounted.current && request === viewerRequest.current) setError(String(cause));
				}).finally(() => {
					if (mounted.current) {
						setBusy(false);
						store.refresh();
					}
				});
			};
			const invoke = (endpoint, body = {}) => {
				if (busy || botSlug === void 0) return;
				setBusy(true);
				setProfileInvalid(false);
				setError(void 0);
				requestJson(endpoint, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						slug: botSlug,
						...body
					})
				}).then((result) => {
					if (typeof result.takeover === "boolean") store.confirmTakeover(result.takeover);
					if (endpoint === OPEN_ENDPOINT && result.viewerUrl !== void 0 && result.viewerUrl !== null) {
						setViewer(result.viewerUrl);
						setInteraction(false);
					}
					if (endpoint === STOP_ENDPOINT) {
						setViewer(void 0);
						setInteraction(false);
					}
				}).catch((cause) => setError(cause instanceof Error ? cause.message : String(cause))).finally(() => {
					setBusy(false);
					store.refresh();
				});
			};
			const onFollow = (next) => {
				setFollow(next);
				if (next) {
					setPreview(void 0);
					store.setTab(void 0);
				} else {
					const selected = focused ?? preview;
					setPreview(selected);
					store.setTab(selected);
				}
			};
			const onSelectTab = (targetId) => {
				setFollow(false);
				setPreview(targetId);
				store.setTab(targetId);
			};
			const onPause = () => {
				disableInteraction();
				invoke(TAKEOVER_ENDPOINT, { active: !paused });
			};
			const currentProfile = profileOverride ?? info.browserProfile ?? "";
			const saveProfile = (name) => {
				const rpc = connectionRpc;
				if (rpc === void 0 || botSlug === void 0 || busy) return;
				const trimmed = name.trim();
				const next = trimmed === "default" ? "" : trimmed;
				if (next === currentProfile) {
					setProfileInvalid(false);
					setError(void 0);
					return;
				}
				disableInteraction();
				setViewer(void 0);
				setBusy(true);
				setProfileInvalid(false);
				setError(void 0);
				rpc.call("/api", "botharness/browserProfileSet", { args: {
					slug: botSlug,
					profile: next
				} }).then((result) => {
					if (!result.ok) {
						setProfileInvalid(true);
						setError(result.error?.message ?? t("entry.profile.failed"));
						return;
					}
					const value = result.value;
					setProfileOverride(typeof value.bot?.browserProfile === "string" ? value.bot.browserProfile : "");
					setPreview(void 0);
					store.setTab(void 0);
					infoStore.refresh();
				}).catch((cause) => {
					setProfileInvalid(true);
					setError(cause instanceof Error ? cause.message : String(cause));
				}).finally(() => {
					setBusy(false);
					store.refresh();
				});
			};
			if (observation?.target === "profile-control") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ProfileBrowserControl, {
				slug: botSlug,
				view: observation.profile,
				enabled: info.browserAccess === true,
				paused,
				t,
				refresh: store.refresh
			}, botSlug);
			if (observation?.target === "daily-control") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(DailyBrowserControl, {
				slug: botSlug,
				view: observation.daily ?? null,
				enabled: info.browserAccess === true,
				paused,
				t,
				refresh: store.refresh
			}, botSlug);
			if (observation?.target === "extension") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(BorrowedBrowser, {
				slug: botSlug,
				tab: observation.borrowed,
				enabled: info.browserAccess === true,
				t,
				refresh: store.refresh
			}, botSlug);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				ref: interactionResource,
				className: "bh-browser-body",
				style: {
					display: "grid",
					gap: 8,
					fontSize: 12.5
				},
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: {
							display: "flex",
							alignItems: "center",
							gap: 8
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							style: { opacity: .8 },
							children: t("entry.profile.label")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ProfileCombobox, {
							value: currentProfile,
							profiles: [...info.profiles, ...observation?.profiles ?? []],
							disabled: busy || botSlug === void 0,
							invalid: profileInvalid,
							errorId,
							onSelect: saveProfile,
							t
						})]
					}),
					viewerUrl === void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: {
							display: "flex",
							alignItems: "center",
							justifyContent: "space-between",
							gap: 8
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							style: { opacity: .8 },
							children: t("entry.view.follow")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Switch, {
							checked: follow,
							onChange: onFollow,
							label: t("entry.view.follow"),
							disabled: botSlug === void 0
						})]
					}), observation?.frame === null || observation?.frame === void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: { opacity: .6 },
						children: t("entry.view.noFrame")
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("img", {
						src: observation.frame,
						alt: t("entry.label"),
						style: {
							width: "100%",
							borderRadius: 6,
							border: "1px solid currentColor"
						}
					})] }) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(RemoteViewer, {
						t: viewerTranslate,
						title: t("entry.view.container"),
						src: viewerUrl,
						design: {
							width: 1024,
							height: 768
						},
						notice: error === void 0 ? void 0 : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							role: "alert",
							className: "bh-browser-error",
							children: error
						}),
						busy,
						stopping: false,
						onStop: () => invoke(STOP_ENDPOINT),
						interactive: interaction && paused,
						onToggleInteractive: toggleInteraction,
						onDisableInteraction: disableInteraction,
						expanded: viewer === viewerUrl,
						onExpandedChange: (next) => {
							setViewer(next ? viewerUrl : void 0);
							if (!next) disableInteraction();
						},
						extraControls: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							style: buttonStyle,
							disabled: busy,
							onClick: onPause,
							children: t(paused ? "entry.view.resume" : "entry.view.pause")
						})
					}, scope),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: {
							display: "flex",
							gap: 8,
							flexWrap: "wrap"
						},
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								style: buttonStyle,
								disabled: busy,
								onClick: onPause,
								children: t(paused ? "entry.view.resume" : "entry.view.pause")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								style: buttonStyle,
								disabled: busy,
								onClick: () => invoke(OPEN_ENDPOINT, follow || preview === void 0 ? {} : { tab: preview }),
								children: t(busy ? "entry.view.opening" : "entry.view.open")
							}),
							observation?.running === true && viewerUrl === void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								style: buttonStyle,
								disabled: busy,
								onClick: () => invoke(STOP_ENDPOINT),
								children: t("entry.view.stop")
							}) : null
						]
					}),
					tabs.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: { opacity: .6 },
						children: t("entry.view.noTabs")
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: {
							display: "grid",
							gap: 2
						},
						children: orderedTabs.map((tab) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
							type: "button",
							className: "bh-browser-tab",
							"aria-current": tab.current ? true : void 0,
							"aria-pressed": tab.targetId === focused,
							title: tab.url,
							onClick: () => onSelectTab(tab.targetId),
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "bh-browser-tab-title",
								children: tab.title === "" ? tab.url : tab.title
							}), tab.title === "" ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "bh-browser-tab-url",
								children: tab.url
							})]
						}, tab.targetId))
					}),
					error !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						id: errorId,
						role: "alert",
						className: "bh-browser-error",
						children: error
					}) : null
				]
			});
		}
		function createBrowserBody(t) {
			return function BrowserBodyView(props) {
				return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(BrowserBody, {
					...props,
					t
				});
			};
		}
		function createBrowserHeader(t) {
			return function BrowserHeaderView(props) {
				return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(BrowserHeaderAction, {
					...props,
					t
				}, props.botSlug);
			};
		}
		function apply(ctx) {
			const t = ctx.locale.bind(LOCALE_NS);
			registerBrowserSettings(ctx, t);
			ctx.effect(() => {
				const sheet = document.createElement("style");
				sheet.textContent = styles;
				document.head.append(sheet);
				return () => sheet.remove();
			}, "botharness-browser: styles");
			ctx.effect(() => ctx.locale.register(LOCALE_NS, {
				zh,
				en
			}), "botharness-browser: dictionaries");
			ctx.inject(["channelSidebar", "connection"], (sidebarCtx) => {
				const registry = sidebarCtx.channelSidebar;
				connectionRpc = sidebarCtx.connection?.rpc;
				if (registry === void 0) return;
				ctx.effect(() => registry.register({
					id: ENTRY_ID,
					icon: "globe",
					label: t("entry.label"),
					order: 41,
					scope: "personabot",
					component: createBrowserBody(t),
					headerAction: createBrowserHeader(t)
				}), "botharness-browser: channel sidebar entry");
			});
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		exports.name = name;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map