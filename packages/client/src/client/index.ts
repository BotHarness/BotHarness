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
import { BotModePrefs, botModePrefsFace } from './bot-mode-prefs.js';
import { BotModeRow } from './bot-mode-row.js';
import { BotMain, BotPanel } from './bot-main.js';
import { BotSidebar, createBotPanelEntry } from './bot-sidebar.js';
import { createBridgeCall } from './bridge.js';
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
  const call = createBridgeCall(ctx);
  const actions: BridgeActions = createActions(call, store);
  const prefs = new BotModePrefs(storage);

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
    settingsCtx.slots.inject('settings.general.item', () =>
      settingsCtx.slots.register(
        {
          name: 'settings.general.item',
          id: 'bot-mode-sort',
          order: 30,
          locale: LOCALE_NS,
          inject: () => botModePrefsFace(prefs),
        },
        BotModeRow,
      ),
    );
    return () => {
      prefs.detach();
    };
  });

  ctx.slots.inject('sidebar.panellist', () =>
    ctx.slots.register(
      {
        name: 'sidebar.panellist',
        id: PANEL_ID,
        order: 10,
        label: 'BOT 模式',
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
        inject: () => ({ actions }),
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
          inject: () => ({ actions }),
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
