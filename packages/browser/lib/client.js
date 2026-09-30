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
			"entry.label": "浏览器",
			"entry.access.title": "Browser Access",
			"entry.access.failed": "切换 Browser Access 失败",
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
			"entry.label": "Browser",
			"entry.access.title": "Browser Access",
			"entry.access.failed": "Failed to switch Browser Access",
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
		//#region packages/browser/src/client/styles.ts
		const styles = `
/* @bh-browser-aliases:start */
.bh-browser-body, .bh-browser-profiles {
  --bh-browser-error: var(--dsw-alias-state-error-primary);
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
.bh-browser-error { color: var(--bh-browser-error); overflow-wrap: anywhere; }
`;
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
						browserAccess: typeof match.browserAccess === "boolean" ? match.browserAccess : void 0,
						browserProfile: typeof match.browserProfile === "string" && match.browserProfile !== "" ? match.browserProfile : void 0,
						profiles
					};
					for (const listener of listeners) listener();
				}).catch(() => void 0);
			};
			return {
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
			const listeners = /* @__PURE__ */ new Set();
			const refresh = async () => {
				try {
					value = await requestJson(observationUrl(botSlug, tab));
				} catch {
					value = void 0;
				}
				for (const listener of listeners) listener();
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
			const [override, setOverride] = (0, react.useState)(void 0);
			const [busy, setBusy] = (0, react.useState)(false);
			const subscribe = (listener) => {
				const sync = () => {
					const access = override ?? store.getSnapshot().browserAccess === true;
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
			const accessOn = override ?? info.browserAccess === true;
			const onToggle = (next) => {
				const rpc = connectionRpc;
				if (rpc === void 0 || botSlug === void 0 || busy) return;
				const previous = accessOn;
				setOverride(next);
				setBusy(true);
				setExpandable?.(next);
				if (next) setExpanded?.(true);
				rpc.call("/api", "botharness/browserAccessSet", { args: {
					slug: botSlug,
					enabled: next
				} }).then((result) => {
					if (!result.ok) {
						setOverride(previous);
						setExpandable?.(previous);
						return;
					}
					const applied = result.value.bot?.browserAccess === true;
					setOverride(applied);
					setExpandable?.(applied);
				}).catch(() => {
					setOverride(previous);
					setExpandable?.(previous);
				}).finally(() => setBusy(false));
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Switch, {
				checked: accessOn,
				disabled: busy || botSlug === void 0,
				onChange: onToggle,
				label: t("entry.access.title")
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
		const tabRowStyle = {
			display: "block",
			width: "100%",
			textAlign: "left",
			padding: "3px 6px",
			borderRadius: 4,
			border: "none",
			background: "transparent",
			color: "inherit",
			cursor: "pointer",
			fontSize: 12,
			overflow: "hidden",
			textOverflow: "ellipsis",
			whiteSpace: "nowrap"
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
			const tabs = observation?.tabs ?? [];
			const focused = observation?.focused ?? null;
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
				} else store.setTab(preview);
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
					tabs.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: { opacity: .6 },
						children: t("entry.view.noTabs")
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: {
							display: "grid",
							gap: 2
						},
						children: tabs.map((tab) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							style: {
								...tabRowStyle,
								opacity: tab.targetId === focused ? 1 : .75,
								fontWeight: tab.targetId === focused ? 600 : 400
							},
							title: tab.url,
							onClick: () => onSelectTab(tab.targetId),
							children: tab.title === "" ? tab.url : tab.title
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
				});
			};
		}
		function apply(ctx) {
			const t = ctx.locale.bind(LOCALE_NS);
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