window.__ModuleLoader__.load({
	id: "@botharness/browser",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
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
			"entry.view.follow": "跟随 Bot",
			"entry.view.pause": "暂停 Bot",
			"entry.view.resume": "继续",
			"entry.view.paused": "已暂停 · 你可以直接操作浏览器窗口",
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
			"entry.view.follow": "Follow the Bot",
			"entry.view.pause": "Pause Bot",
			"entry.view.resume": "Resume",
			"entry.view.paused": "Paused · you can use the browser window directly",
			"entry.view.open": "Open Bot Browser",
			"entry.view.stop": "Stop",
			"entry.view.opening": "Opening…",
			"entry.view.noFrame": "No frame yet",
			"entry.view.noTabs": "No tabs yet",
			"entry.error": "Browser action failed"
		};
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
				browserProfile: void 0
			};
			const listeners = /* @__PURE__ */ new Set();
			let started = false;
			const load = () => {
				const rpc = connectionRpc;
				if (rpc === void 0 || botSlug === void 0) return;
				rpc.call("/api", "botharness/list", { args: {} }).then((result) => {
					if (!result.ok) return;
					const match = (result.value.bots ?? []).find((bot) => bot.slug === botSlug);
					if (match === void 0) return;
					info = {
						displayName: typeof match.displayName === "string" && match.displayName.length > 0 ? match.displayName : void 0,
						browserAccess: typeof match.browserAccess === "boolean" ? match.browserAccess : void 0,
						browserProfile: typeof match.browserProfile === "string" && match.browserProfile !== "" ? match.browserProfile : void 0
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
				getSnapshot: () => info
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
			const [draft, setDraft] = (0, react.useState)(void 0);
			const [profileOverride, setProfileOverride] = (0, react.useState)(void 0);
			const [error, setError] = (0, react.useState)(void 0);
			const tabs = observation?.tabs ?? [];
			const focused = observation?.focused ?? null;
			const focusedTab = tabs.find((tab) => tab.targetId === focused);
			const paused = observation?.takeover === true;
			const invoke = (endpoint, init) => {
				if (busy) return;
				setBusy(true);
				setError(void 0);
				requestJson(endpoint, {
					method: "POST",
					...init
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
				if (botSlug === void 0) return;
				invoke(TAKEOVER_ENDPOINT, {
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						slug: botSlug,
						active: !paused
					})
				});
			};
			const currentProfile = profileOverride ?? info.browserProfile ?? "";
			const saveProfile = () => {
				const rpc = connectionRpc;
				if (rpc === void 0 || botSlug === void 0 || draft === void 0) return;
				const next = draft.trim();
				setDraft(void 0);
				if (next === currentProfile) return;
				setError(void 0);
				rpc.call("/api", "botharness/browserProfileSet", { args: {
					slug: botSlug,
					profile: next
				} }).then((result) => {
					if (!result.ok) {
						setError(result.error?.message ?? t("entry.profile.failed"));
						return;
					}
					const value = result.value;
					setProfileOverride(typeof value.bot?.browserProfile === "string" ? value.bot.browserProfile : "");
				}).catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)));
			};
			const onProfileChange = (event) => {
				setDraft(event.target.value);
			};
			const onProfileKey = (event) => {
				if (event.key === "Enter") saveProfile();
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
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
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							value: draft ?? currentProfile,
							placeholder: t("entry.profile.default"),
							disabled: botSlug === void 0,
							onChange: onProfileChange,
							onBlur: saveProfile,
							onKeyDown: onProfileKey,
							style: {
								flex: 1,
								minWidth: 0,
								padding: "2px 6px",
								borderRadius: 4,
								border: "1px solid currentColor",
								background: "transparent",
								color: "inherit",
								fontSize: 12
							}
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
					paused ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: { opacity: .8 },
						children: t("entry.view.paused")
					}) : null,
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
					focusedTab === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: {
							opacity: .7,
							wordBreak: "break-all"
						},
						children: focusedTab.title === "" ? focusedTab.url : focusedTab.title
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
								onClick: () => invoke(OPEN_ENDPOINT),
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
					error !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { children: error }) : null
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