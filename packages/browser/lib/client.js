window.__ModuleLoader__.load({
  id: '@botharness/browser',
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
    let react = require('react');
    let _deepseek_ai_dsh_client_ui_primitives = require('@deepseek-ai/dsh-client-ui-primitives');
    let react_jsx_runtime = require('react/jsx-runtime');
    //#region packages/browser/src/client/locale.ts
    const LOCALE_NS = 'botharness-browser';
    const zh = {
      'entry.label': '浏览器',
      'entry.shared':
        'Bot Browser 由本 profile 的所有 PersonaBot 共享：各自拥有自己的窗口，共享登录态与 Cookie。',
      'entry.access.title': 'Browser Access',
      'entry.access.description': '开启后，该 Bot 的会话可以使用 Bot Browser 工具',
      'entry.access.failed': '切换 Browser Access 失败',
      'entry.status.stopped': '未运行',
      'entry.status.running': '运行中',
      'entry.status.url': '当前页面：{url}',
      'entry.binary': '浏览器：{path}',
      'entry.open': '打开 Bot 浏览器',
      'entry.opening': '正在打开…',
      'entry.stop': '停止',
      'entry.stopping': '正在停止…',
      'entry.hint': '首次使用请在打开的窗口里登录需要的网站；登录态会保留在这个浏览器 profile 中。',
      'entry.error': '浏览器操作失败',
    };
    const en = {
      'entry.label': 'Browser',
      'entry.shared':
        'The Bot Browser is shared by every PersonaBot of this profile: each owns its own window, while cookies and sign-ins are shared.',
      'entry.access.title': 'Browser Access',
      'entry.access.description': "Lets this Bot's sessions use the Bot Browser tools",
      'entry.access.failed': 'Failed to switch Browser Access',
      'entry.status.stopped': 'Not running',
      'entry.status.running': 'Running',
      'entry.status.url': 'Current page: {url}',
      'entry.binary': 'Browser: {path}',
      'entry.open': 'Open Bot Browser',
      'entry.opening': 'Opening…',
      'entry.stop': 'Stop',
      'entry.stopping': 'Stopping…',
      'entry.hint':
        'Sign in to the sites you need in the window that opens; logins persist in this browser profile.',
      'entry.error': 'Browser action failed',
    };
    //#endregion
    //#region packages/browser/src/client/index.tsx
    const ENTRY_ID = 'botharness-browser';
    const STATUS_ENDPOINT = '/api/browser/status';
    const OPEN_ENDPOINT = '/api/browser/open';
    const STOP_ENDPOINT = '/api/browser/stop';
    let connectionRpc;
    async function requestJson(url, init) {
      const response = await fetch(url, {
        cache: 'no-store',
        ...init,
      });
      const body = await response.json();
      if (!response.ok || body.ok === false)
        throw new Error(body.error ?? `HTTP ${String(response.status)}`);
      return body;
    }
    function createBotInfoStore(botSlug) {
      let info = {
        displayName: void 0,
        browserAccess: void 0,
      };
      const listeners = /* @__PURE__ */ new Set();
      const load = () => {
        const rpc = connectionRpc;
        if (rpc === void 0 || botSlug === void 0) return;
        rpc
          .call('/api', 'botharness/list', { args: {} })
          .then((result) => {
            if (!result.ok) return;
            const match = (result.value.bots ?? []).find((bot) => bot.slug === botSlug);
            if (match === void 0) return;
            info = {
              displayName:
                typeof match.displayName === 'string' && match.displayName.length > 0
                  ? match.displayName
                  : void 0,
              browserAccess:
                typeof match.browserAccess === 'boolean' ? match.browserAccess : void 0,
            };
            for (const listener of listeners) listener();
          })
          .catch(() => void 0);
      };
      return {
        subscribe(listener) {
          if (listeners.size === 0) load();
          listeners.add(listener);
          return () => {
            listeners.delete(listener);
          };
        },
        getSnapshot: () => info,
      };
    }
    function createStatusStore() {
      let status;
      let timer;
      const listeners = /* @__PURE__ */ new Set();
      const refresh = async () => {
        try {
          status = await requestJson(STATUS_ENDPOINT);
        } catch {
          status = void 0;
        }
        for (const listener of listeners) listener();
      };
      return {
        subscribe(listener) {
          listeners.add(listener);
          if (listeners.size === 1) {
            refresh();
            timer = setInterval(() => void refresh(), 3e3);
          }
          return () => {
            listeners.delete(listener);
            if (listeners.size === 0 && timer !== void 0) {
              clearInterval(timer);
              timer = void 0;
            }
          };
        },
        getSnapshot: () => status,
        refresh: () => void refresh(),
      };
    }
    const buttonStyle = {
      padding: '4px 10px',
      borderRadius: 6,
      border: '1px solid currentColor',
      background: 'transparent',
      color: 'inherit',
      cursor: 'pointer',
      fontSize: 12,
    };
    function BrowserEntryView({ botSlug, t }) {
      const [botInfoStore] = (0, react.useState)(() => createBotInfoStore(botSlug));
      const [statusStore] = (0, react.useState)(createStatusStore);
      const botInfo = (0, react.useSyncExternalStore)(
        botInfoStore.subscribe,
        botInfoStore.getSnapshot,
      );
      const status = (0, react.useSyncExternalStore)(
        statusStore.subscribe,
        statusStore.getSnapshot,
      );
      const [accessOverride, setAccessOverride] = (0, react.useState)(void 0);
      const [accessBusy, setAccessBusy] = (0, react.useState)(false);
      const [accessError, setAccessError] = (0, react.useState)(void 0);
      const [busy, setBusy] = (0, react.useState)(false);
      const [error, setError] = (0, react.useState)(void 0);
      const accessOn = accessOverride ?? botInfo.browserAccess === true;
      const onToggleAccess = (next) => {
        const rpc = connectionRpc;
        if (rpc === void 0 || botSlug === void 0 || accessBusy) return;
        const previous = accessOn;
        setAccessError(void 0);
        setAccessOverride(next);
        setAccessBusy(true);
        rpc
          .call('/api', 'botharness/browserAccessSet', {
            args: {
              slug: botSlug,
              enabled: next,
            },
          })
          .then((result) => {
            if (!result.ok) {
              setAccessOverride(previous);
              setAccessError(result.error?.message ?? t('entry.access.failed'));
              return;
            }
            const value = result.value;
            setAccessOverride(value.bot?.browserAccess === true);
          })
          .catch((cause) => {
            setAccessOverride(previous);
            setAccessError(cause instanceof Error ? cause.message : String(cause));
          })
          .finally(() => setAccessBusy(false));
      };
      const invoke = (endpoint) => {
        if (busy) return;
        setBusy(true);
        setError(void 0);
        requestJson(endpoint, { method: 'POST' })
          .catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)))
          .finally(() => {
            setBusy(false);
            statusStore.refresh();
          });
      };
      return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)('div', {
        style: {
          display: 'grid',
          gap: 8,
          fontSize: 12.5,
        },
        children: [
          /* @__PURE__ */ (0, react_jsx_runtime.jsxs)('div', {
            style: {
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
            },
            children: [
              /* @__PURE__ */ (0, react_jsx_runtime.jsx)('span', {
                style: { opacity: 0.85 },
                children: t('entry.access.title'),
              }),
              /* @__PURE__ */ (0, react_jsx_runtime.jsx)(
                _deepseek_ai_dsh_client_ui_primitives.Switch,
                {
                  checked: accessOn,
                  disabled: accessBusy || botSlug === void 0,
                  onChange: onToggleAccess,
                  label: t('entry.access.title'),
                },
              ),
            ],
          }),
          /* @__PURE__ */ (0, react_jsx_runtime.jsx)('div', {
            style: { opacity: 0.7 },
            children: t('entry.access.description'),
          }),
          accessError !== void 0
            ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)('div', { children: accessError })
            : null,
          /* @__PURE__ */ (0, react_jsx_runtime.jsx)('div', {
            style: { opacity: 0.8 },
            children:
              status?.running === true
                ? `${t('entry.status.running')}${status.url === null ? '' : ` · ${t('entry.status.url', { url: status.url })}`}`
                : t('entry.status.stopped'),
          }),
          status?.binary === null || status?.binary === void 0
            ? null
            : /* @__PURE__ */ (0, react_jsx_runtime.jsx)('div', {
                style: {
                  opacity: 0.6,
                  wordBreak: 'break-all',
                },
                children: t('entry.binary', { path: status.binary }),
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
                disabled: busy,
                onClick: () => invoke(OPEN_ENDPOINT),
                children: t(busy ? 'entry.opening' : 'entry.open'),
              }),
              status?.running === true
                ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)('button', {
                    type: 'button',
                    style: buttonStyle,
                    disabled: busy,
                    onClick: () => invoke(STOP_ENDPOINT),
                    children: t(busy ? 'entry.stopping' : 'entry.stop'),
                  })
                : null,
            ],
          }),
          error !== void 0
            ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)('div', { children: error })
            : null,
          /* @__PURE__ */ (0, react_jsx_runtime.jsx)('div', {
            style: { opacity: 0.6 },
            children: t('entry.hint'),
          }),
        ],
      });
    }
    function createBrowserEntry(t) {
      return function BrowserEntry(props) {
        return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(BrowserEntryView, {
          ...props,
          t,
        });
      };
    }
    function apply(ctx) {
      const t = ctx.locale.bind(LOCALE_NS);
      ctx.effect(
        () =>
          ctx.locale.register(LOCALE_NS, {
            zh,
            en,
          }),
        'botharness-browser: dictionaries',
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
              order: 41,
              scope: 'personabot',
              component: createBrowserEntry(t),
            }),
          'botharness-browser: channel sidebar entry',
        );
      });
    }
    //#endregion
    exports.apply = apply;
    return module.exports;
  },
});

//# sourceMappingURL=client.js.map
