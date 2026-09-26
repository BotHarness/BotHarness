import type { Context as ClientContext } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-client-locale/client';
import type { InputTriggerSource } from '@deepseek-ai/dsh-client-ui-input-trigger/client';
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client';
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client';
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client';
// Type-only: the `configForms` Context merge and the settings slot contract.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client';
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client';
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client';
import type {} from '@deepseek-ai/dsh-api-workspace-controller/client';
import type {} from '@deepseek-ai/dsh-api-session-controller/client';
import type { SessionId } from '@deepseek-ai/dsh-session/types';

import { BOT_MODE_NAMESPACE, type BotModeSettings } from '../bot-mode-settings.js';
import { createActions, type BridgeActions } from './actions.js';
import { BotModePrefs, botModePrefsFace } from './bot-mode-prefs.js';
import { subscribeBotColorScheme, readBotColorScheme } from './bot-color-scheme.js';
import { botIconMarkup } from './bot-icon.js';
import { installBotNavIcon } from './bot-icon-nav.js';
import { openBotSettings } from './bot-settings-open.js';
import { BotSettingsSection } from './bot-settings-section.js';
import './bot-settings-slot.js';
import { BotMain, BotPanel } from './bot-main.js';
import { BotSidebar, createBotPanelEntry } from './bot-sidebar.js';
import { createChannelSidebarBuiltins } from './channel-sidebar-builtins.js';
import { webBotModeShortcut, webShortcutBlocked } from './channel-shortcuts.js';
import { createChannelSidebarRegistry } from './channel-sidebar.js';
import { createBridgeCall, loadSessionBotOwner } from './bridge.js';
import {
  SessionOwnerLeading,
  SessionReturnAction,
  SessionReturnMenuItem,
} from './session-return-action.js';
import { mountChannelLive, mountRosterLive } from './channel-live.js';
import { sessionBotReference } from './mentions.js';
import { en, LOCALE_NS, zh } from './locale.js';
import { registerModeShadow } from './mode.js';
import { browserSystemMotionSource, mountMotionPolicyAttribute } from './motion-preference.js';
import { defaultStorage, loadRosterConfig } from './roster-config.js';
import { mountDevClientRefresh } from './dev-client-refresh.js';
import { saveHmrView, takeHmrView } from './hmr-view.js';
import { consumeLastView, writeLastView } from './last-view.js';
import { migrateLegacyRoster } from './roster-migration.js';
import { CSS } from './styles.js';
import { store } from './store.js';

export const name = 'botharness-client';

export const inject = [
  'slots',
  'connection',
  'inputTriggers',
  'layout',
  'locale',
  'sessions',
  'uiWorkspace',
  'workspaces',
];

export const PANEL_ID = 'botharness' as MainPanelId;

function installStyles(): () => void {
  if (typeof document === 'undefined') return () => {};
  const style = document.createElement('style');
  style.setAttribute('data-botharness', 'client');
  style.textContent = CSS;
  document.head.appendChild(style);
  return () => {
    style.remove();
  };
}

export function apply(ctx: ClientContext): void {
  const storage = defaultStorage();
  const hmrView =
    typeof window === 'undefined'
      ? undefined
      : takeHmrView(window as unknown as Record<string, unknown>);
  const t = ctx.locale.bind(LOCALE_NS);
  const nativeChatT = ctx.locale.bind('chat');
  const call = createBridgeCall(ctx);
  const actions: BridgeActions = createActions(call, store, {
    pickDirectory: () => {
      const picker = ctx.get('uiWorkspace');
      if (picker === undefined) throw new Error('DSH folder picker is unavailable');
      return picker.pickDirectory();
    },
    listDirectory: (path, signal) => {
      const picker = ctx.get('uiWorkspace');
      if (picker === undefined) throw new Error('DSH folder browser is unavailable');
      return picker.listDirectory(path, signal);
    },
    createWorkspace: (input) => {
      const workspaces = ctx.get('workspaces');
      if (workspaces === undefined) throw new Error('DSH Workspace controller is unavailable');
      return workspaces.create(input);
    },
    openSession: (sessionId) => ctx.uiWorkspace.openSession(sessionId as SessionId),
  });
  const prefs = new BotModePrefs(storage);
  // Read the last actual view once per document. HMR has its own in-document handoff.
  const lastView =
    typeof window === 'undefined'
      ? undefined
      : consumeLastView(window as unknown as Record<string, unknown>, storage);
  let restoreBotMode = hmrView === undefined && lastView?.mode === 'bot';
  const nativeSessions = {
    subscribe: (listener: () => void) => ctx.sessions.list.subscribe(listener),
    getSnapshot: () => ctx.sessions.list.getSnapshot(),
  };
  const channelSidebar = createChannelSidebarRegistry();
  ctx.provide('channelSidebar', channelSidebar);
  ctx.effect(() => {
    // Labels resolve at build time, so re-register the entries when the locale
    // changes; the registry notifies the sidebar and it re-renders.
    let disposers: (() => void)[] = [];
    const reconcile = (): void => {
      for (const dispose of disposers) dispose();
      disposers = createChannelSidebarBuiltins(t, prefs, nativeSessions).map((entry) =>
        channelSidebar.register(entry),
      );
    };
    reconcile();
    const unsubscribe = ctx.locale.subscribe(reconcile);
    return () => {
      unsubscribe();
      for (const dispose of disposers) dispose();
    };
  }, 'botharness: Channel sidebar entries');

  ctx.effect(installStyles, 'botharness: client styles');
  ctx.effect(mountDevClientRefresh, 'botharness: local development refresh');
  ctx.effect(
    () => prefs.attachSystemMotion(browserSystemMotionSource()),
    'botharness: system motion preference',
  );
  ctx.effect(() => {
    if (typeof document === 'undefined') return () => {};
    return mountMotionPolicyAttribute(prefs.source, document.documentElement);
  }, 'botharness: motion policy boundary');
  ctx.effect(() => ctx.locale.register(LOCALE_NS, { zh, en }), 'botharness: dictionaries');
  ctx.effect(() => {
    if (typeof document === 'undefined') return () => {};
    const onKeyDown = (event: KeyboardEvent): void => {
      if (
        !webBotModeShortcut(event.code, {
          alt: event.altKey,
          ctrl: event.ctrlKey,
          meta: event.metaKey,
          shift: event.shiftKey,
          altGraph: event.getModifierState('AltGraph'),
          composing: event.isComposing,
          repeat: event.repeat,
          prevented: event.defaultPrevented,
        })
      ) {
        return;
      }
      if (webShortcutBlocked(event.target, document)) return;
      event.preventDefault();
      ctx.layout.selectPanel(store.getSnapshot().mode === 'bot' ? null : PANEL_ID);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, 'botharness: Bot mode keyboard shortcut');
  ctx.effect(
    () => (typeof EventSource === 'undefined' ? () => {} : mountChannelLive(store, actions)),
    'botharness: Channel live subscription',
  );
  ctx.effect(
    () => (typeof EventSource === 'undefined' ? () => {} : mountRosterLive(store, actions)),
    'botharness: Roster live subscription',
  );
  ctx.effect(() => {
    store.setConfig(loadRosterConfig(storage));
    const controller = new AbortController();
    void actions.load(controller.signal).then(async () => {
      if (controller.signal.aborted) return;
      const outcome = await migrateLegacyRoster({
        storage,
        call,
        remapSortModes: (mapping) => prefs.remapSectionSortModes(mapping),
      });
      if (outcome === 'migrated') await actions.refreshRoster(controller.signal);
      if (controller.signal.aborted) return;
      await actions.ensureChannelPins();
      if (controller.signal.aborted) return;
      await actions.ensureFlatTopOrder();
    });
    return () => {
      controller.abort();
    };
  }, 'botharness: roster load');

  ctx.inject(['configForms'], (settingsCtx) => {
    const scope = settingsCtx.configForms.get<BotModeSettings>(BOT_MODE_NAMESPACE);
    prefs.attach(scope);
    // The shell owns the Settings nav glyph; tag our cell and wear the chosen
    // mark instead of its gear fallback (see bot-icon-nav).
    const releaseNavIcon = installBotNavIcon({
      labels: () => [t('settings.nav')],
      markup: () => botIconMarkup(prefs.source.getSnapshot().botIcon, readBotColorScheme()),
      subscribe: (listener) => {
        const offPrefs = prefs.source.subscribe(listener);
        const offScheme = subscribeBotColorScheme(listener);
        return () => {
          offPrefs();
          offScheme();
        };
      },
    });
    settingsCtx.slots.inject('settings.section', () =>
      settingsCtx.slots.register(
        {
          name: 'settings.section',
          id: 'botharness',
          order: 25,
          label: () => t('settings.nav'),
          locale: LOCALE_NS,
          inject: () => botModePrefsFace(prefs),
          children: { 'botharness.settings.item': { kind: 'list', scope: 'root' } },
        },
        BotSettingsSection,
      ),
    );
    return () => {
      releaseNavIcon();
      prefs.detach();
    };
  });

  ctx.slots.inject('sidebar.panellist', () =>
    ctx.slots.register(
      {
        name: 'sidebar.panellist',
        id: PANEL_ID,
        order: 10,
        label: () => t('panel.label'),
        locale: LOCALE_NS,
        inject: () => ({
          ...botModePrefsFace(prefs),
          openSettings: () => {
            openBotSettings(() => [t('settings.nav')]);
          },
        }),
      },
      createBotPanelEntry(() => {
        ctx.layout.selectPanel(null);
      }),
    ),
  );

  ctx.slots.inject('main', () => {
    const dispose = ctx.slots.register(
      {
        name: 'main',
        key: PANEL_ID,
        locale: LOCALE_NS,
        inject: () => ({ actions, channelSidebar, nativeChatT }),
      },
      BotPanel,
    );
    if (restoreBotMode) {
      restoreBotMode = false;
      queueMicrotask(() => {
        if (ctx.layout.panelInfo.getSnapshot().activePanelId !== null) return;
        try {
          ctx.layout.selectPanel(PANEL_ID);
        } catch (error) {
          ctx.logger.warn('botharness: failed to restore Bot mode', error);
        }
      });
    }
    return dispose;
  });

  const resolveSessionOwner = (sessionId: string, signal: AbortSignal) =>
    loadSessionBotOwner(call, sessionId, signal);
  const returnToBot = async (slug: string): Promise<void> => {
    if (!store.getSnapshot().bots.some((bot) => bot.slug === slug)) await actions.load();
    if (!store.getSnapshot().bots.some((bot) => bot.slug === slug))
      throw new Error('PersonaBot is unavailable');
    ctx.layout.selectPanel(PANEL_ID);
    await actions.openBot(slug);
  };
  ctx.slots.inject('conversation.session.header.actions', () =>
    ctx.slots.register(
      {
        name: 'conversation.session.header.actions',
        id: 'botharness-return-to-bot',
        order: 15,
        label: () => t('sessions.return.label'),
        locale: LOCALE_NS,
        inject: () => ({ resolveOwner: resolveSessionOwner, returnToBot }),
      },
      SessionReturnAction,
    ),
  );
  ctx.slots.inject('sidebar.session.row.leading', () =>
    ctx.slots.register(
      {
        name: 'sidebar.session.row.leading',
        id: 'botharness-session-owner-avatar',
        order: 20,
        locale: LOCALE_NS,
        inject: () => ({ resolveOwner: resolveSessionOwner }),
      },
      SessionOwnerLeading,
    ),
  );
  ctx.slots.inject('sidebar.workspaces.session.menu.item', () =>
    ctx.slots.register(
      {
        name: 'sidebar.workspaces.session.menu.item',
        id: 'botharness-return-to-bot-menu',
        order: 500,
        label: () => t('sessions.return.label'),
        locale: LOCALE_NS,
        inject: () => ({ resolveOwner: resolveSessionOwner, returnToBot }),
      },
      SessionReturnMenuItem,
    ),
  );

  registerModeShadow(
    ctx,
    'sidebar.workspaces',
    () =>
      ctx.slots.register(
        {
          name: 'sidebar.workspaces',
          priority: -100,
          locale: LOCALE_NS,
          inject: () => ({ actions, ...botModePrefsFace(prefs) }),
        },
        BotSidebar,
      ),
    store,
  );
  registerModeShadow(
    ctx,
    'main',
    () =>
      ctx.slots.register(
        {
          name: 'main',
          key: 'conversation' as MainPanelId,
          priority: -100,
          inject: () => ({ actions, channelSidebar, nativeChatT }),
        },
        BotMain,
      ),
    store,
  );

  const mention: InputTriggerSource = {
    trigger: '@',
    name: 'personabot',
    candidates: async (_session, request) => {
      const result = await call('list', { query: request.query }, request.signal);
      if (!result.ok) return [];
      const value = result.value as { bots?: readonly { slug?: unknown; displayName?: unknown }[] };
      return (value.bots ?? []).flatMap((bot) =>
        typeof bot.slug === 'string' && bot.slug.length > 0
          ? [
              {
                name: bot.slug,
                ...(typeof bot.displayName === 'string' ? { description: bot.displayName } : {}),
              },
            ]
          : [],
      );
    },
    codec: {
      clipboardText: (ref) => `@${ref}`,
      serialize: async (ref) => sessionBotReference(ref),
    },
    onPick: (pick) => ({
      insert: {
        source: 'personabot',
        ref: pick.candidate.name,
        label: pick.candidate.description ?? pick.candidate.name,
        clipboardText: `@${pick.candidate.name}`,
      },
    }),
  };
  ctx.effect(() => ctx.inputTriggers.registerSource(mention), 'botharness: @ mention');

  const viewToRestore =
    hmrView ?? (lastView?.mode === 'bot' ? { selection: lastView.selection } : undefined);
  if (viewToRestore !== undefined) {
    ctx.effect(() => {
      let restored = false;
      const restore = (): void => {
        if (restored || store.getSnapshot().status !== 'ready') return;
        restored = true;
        unsubscribe();
        try {
          if (hmrView !== undefined) ctx.layout.selectPanel(PANEL_ID);
          if (ctx.layout.panelInfo.getSnapshot().activePanelId !== PANEL_ID) return;
          const selection = viewToRestore.selection;
          const snapshot = store.getSnapshot();
          const opening =
            selection?.kind === 'bot' && snapshot.bots.some((bot) => bot.slug === selection.slug)
              ? actions.openBot(selection.slug)
              : selection?.kind === 'channel' &&
                  snapshot.channels.some((channel) => channel.id === selection.channelId)
                ? actions.openChannel(selection.channelId)
                : selection?.kind === 'inbox'
                  ? actions.openHumanInbox()
                  : undefined;
          void opening?.catch((error: unknown) => {
            ctx.logger.warn('botharness: Bot view restore failed', error);
          });
        } catch (error) {
          ctx.logger.warn('botharness: Bot view restore failed', error);
        }
      };
      const unsubscribe = store.subscribe(restore);
      restore();
      return unsubscribe;
    }, 'botharness: Bot view restore');
  }
  ctx.effect(() => {
    let enteredBotMode = false;
    let lastWritten: string | undefined;
    const persist = (): void => {
      const active = ctx.layout.panelInfo.getSnapshot().activePanelId === PANEL_ID;
      if (active) enteredBotMode = true;
      if (!enteredBotMode) return;
      const view = {
        mode: active ? 'bot' : 'dsh',
        selection: store.getSnapshot().selection,
      } as const;
      const serialized = JSON.stringify(view);
      if (serialized === lastWritten) return;
      lastWritten = serialized;
      writeLastView(storage, view);
    };
    const unsubscribePanel = ctx.layout.panelInfo.subscribe(persist);
    const unsubscribeStore = store.subscribe(() => {
      if (ctx.layout.panelInfo.getSnapshot().activePanelId === PANEL_ID) persist();
    });
    persist();
    return () => {
      unsubscribePanel();
      unsubscribeStore();
    };
  }, 'botharness: last visible view');
  ctx.effect(
    () => () => {
      if (typeof window === 'undefined') return;
      if (ctx.layout.panelInfo.getSnapshot().activePanelId !== PANEL_ID) return;
      saveHmrView(window as unknown as Record<string, unknown>, store.getSnapshot().selection);
    },
    'botharness: HMR view handoff',
  );
}
