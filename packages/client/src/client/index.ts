import type { Context as ClientContext } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-client-locale/client';
import type { InputTriggerSource } from '@deepseek-ai/dsh-client-ui-input-trigger/client';
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client';
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client';
// Type-only: the `settingsScope` Context merge and the settings slot contract.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client';
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client';

import { BOT_MODE_NAMESPACE, type BotModeSettings } from '../bot-mode-settings.js';
import { createActions, type BridgeActions } from './actions.js';
import { mountActivityPolling } from './activity-poll.js';
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
import { createBridgeCall } from './bridge.js';
import { mountChannelLive, mountRosterLive } from './channel-live.js';
import { en, LOCALE_NS, zh } from './locale.js';
import { registerModeShadow } from './mode.js';
import { browserSystemMotionSource, mountMotionPolicyAttribute } from './motion-preference.js';
import { defaultStorage, loadRosterConfig } from './roster-config.js';
import { migrateLegacyRoster } from './roster-migration.js';
import { CSS } from './styles.js';
import { store } from './store.js';

export const name = 'botharness-client';

export const inject = ['slots', 'connection', 'inputTriggers', 'layout', 'locale'];

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
  const t = ctx.locale.bind(LOCALE_NS);
  const call = createBridgeCall(ctx);
  const actions: BridgeActions = createActions(call, store);
  const prefs = new BotModePrefs(storage);
  const channelSidebar = createChannelSidebarRegistry();
  ctx.provide('channelSidebar', channelSidebar);
  ctx.effect(() => {
    // Labels resolve at build time, so re-register the entries when the locale
    // changes; the registry notifies the sidebar and it re-renders.
    let disposers: (() => void)[] = [];
    const reconcile = (): void => {
      for (const dispose of disposers) dispose();
      disposers = createChannelSidebarBuiltins(t).map((entry) => channelSidebar.register(entry));
    };
    reconcile();
    const unsubscribe = ctx.locale.subscribe(reconcile);
    return () => {
      unsubscribe();
      for (const dispose of disposers) dispose();
    };
  }, 'botharness: Channel sidebar entries');

  ctx.effect(installStyles, 'botharness: client styles');
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
  ctx.effect(() => mountActivityPolling(store, call), 'botharness: activity snapshot polling');
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

  ctx.inject(['settingsScope'], (settingsCtx) => {
    const scope = settingsCtx.settingsScope.bind<BotModeSettings>({
      namespace: BOT_MODE_NAMESPACE,
    });
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

  ctx.slots.inject('main', () =>
    ctx.slots.register(
      {
        name: 'main',
        key: PANEL_ID,
        locale: LOCALE_NS,
        inject: () => ({ actions, channelSidebar }),
      },
      BotPanel,
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
          inject: () => ({ actions, channelSidebar }),
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
      serialize: async (ref) => `@${ref}`,
    },
    onPick: (pick) => ({
      insert: {
        source: 'personabot',
        ref: pick.candidate.name,
        label: pick.candidate.description ?? pick.candidate.name,
        appearance: 'session',
        clipboardText: `@${pick.candidate.name}`,
      },
    }),
  };
  ctx.effect(() => ctx.inputTriggers.registerSource(mention), 'botharness: @ mention');
}
