window.__ModuleLoader__.load({
	id: "@botharness/browser",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		let react_dom = require("react-dom");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region packages/browser/src/client/locale.ts
		const LOCALE_NS = "botharness-browser";
		const zh = {
			"settings.target": "操作目标",
			"settings.local": "本机 Browser",
			"settings.container": "Docker Browser",
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
			"settings.target": "Browser Target",
			"settings.local": "Local Browser",
			"settings.container": "Docker Browser",
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
		function BrowserTargetSettings({ scope, t }) {
			const store = (0, react.useMemo)(() => ({
				subscribe: (listener) => scope.subscribe(listener),
				getSnapshot: () => scope.getSnapshot()
			}), [scope]);
			const snapshot = (0, react.useSyncExternalStore)(store.subscribe, store.getSnapshot);
			const [open, setOpen] = (0, react.useState)(false);
			const [saving, setSaving] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)();
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
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "bh-settings-row",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "bh-settings-row-title",
							children: t("settings.target")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Menu, {
							portal: true,
							align: "end",
							open,
							selectedId: target,
							items: ["local", "container"].map((id) => ({
								id,
								label: t(`settings.${id}`)
							})),
							onClose: () => setOpen(false),
							onSelect: (id) => {
								setOpen(false);
								if (id !== "local" && id !== "container") return;
								setSaving(true);
								setError(void 0);
								scope.set("target", id).then(() => {
									if (scope.getSnapshot().value?.target !== id) throw new Error("Browser Target was not saved");
								}).catch((cause) => setError(String(cause))).finally(() => setSaving(false));
							},
							anchor: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
								type: "button",
								className: "bh-settings-selector",
								"aria-haspopup": "menu",
								"aria-expanded": open,
								disabled: !snapshot.writable || saving,
								onClick: () => setOpen(!open),
								children: [t(`settings.${target}`), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronDownOutlineRegular, {})]
							})
						})]
					}),
					error === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						role: "alert",
						className: "bh-browser-error",
						children: error
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
		//#region packages/browser/src/client/styles.ts
		const styles = `
.bh-browser-access-control { position: relative; display: flex; align-items: center; }
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
.bh-browser-body, .bh-browser-profiles, .bh-browser-settings, .bh-browser-viewer {
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
.bh-browser-viewer { width: 1100px; max-width: calc(100vw - 48px); }
.bh-browser-viewer-controls { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; flex-wrap: wrap; }
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
			let refreshAgain = false;
			const listeners = /* @__PURE__ */ new Set();
			const refresh = async () => {
				if (refreshing) {
					refreshAgain = true;
					return;
				}
				refreshing = true;
				const requestedTab = tab;
				try {
					const next = await requestJson(observationUrl(botSlug, requestedTab));
					if (tab === requestedTab) value = next;
				} catch {
					if (tab === requestedTab) value = void 0;
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
			const tabs = observation?.tabs ?? [];
			const focused = observation?.focused ?? null;
			const currentTab = tabs.find((tab) => tab.current);
			const orderedTabs = currentTab === void 0 ? tabs : [currentTab, ...tabs.filter((tab) => !tab.current)];
			const paused = observation?.takeover === true;
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
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
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
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
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
					}),
					observation?.frame === null || observation?.frame === void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
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
					}),
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
							observation?.running === true ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								style: buttonStyle,
								disabled: busy,
								onClick: () => invoke(STOP_ENDPOINT),
								children: t("entry.view.stop")
							}) : null
						]
					}),
					viewer === void 0 || observation?.target !== "container" || observation.viewerUrl !== viewer ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(_deepseek_ai_dsh_client_ui_primitives.Modal, {
						open: true,
						title: t("entry.view.container"),
						closeLabel: t("entry.view.close"),
						className: "bh-browser-viewer",
						onClose: () => {
							setViewer(void 0);
							setInteraction(false);
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "bh-browser-viewer-controls",
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									style: buttonStyle,
									disabled: busy,
									onClick: onPause,
									children: t(paused ? "entry.view.resume" : "entry.view.pause")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("entry.view.interaction") }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Switch, {
									checked: interaction && paused,
									label: t("entry.view.interaction"),
									onChange: (next) => {
										if (!next) {
											setInteraction(false);
											return;
										}
										if (busy || botSlug === void 0) return;
										setBusy(true);
										setError(void 0);
										requestJson(TAKEOVER_ENDPOINT, {
											method: "POST",
											headers: { "content-type": "application/json" },
											body: JSON.stringify({
												slug: botSlug,
												active: true
											})
										}).then((result) => setInteraction(result.takeover)).catch((cause) => setError(String(cause))).finally(() => {
											setBusy(false);
											store.refresh();
										});
									},
									disabled: busy
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									style: buttonStyle,
									disabled: busy,
									onClick: () => invoke(STOP_ENDPOINT),
									children: t("entry.view.stop")
								})
							]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("iframe", {
							src: viewer,
							title: t("entry.view.container"),
							tabIndex: interaction && paused ? 0 : -1,
							style: {
								width: "100%",
								height: "min(70vh, 768px)",
								border: 0,
								pointerEvents: interaction && paused ? "auto" : "none"
							}
						}, interaction && paused ? "interactive" : "readonly")]
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