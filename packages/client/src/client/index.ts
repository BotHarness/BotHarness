import type { Context as ClientContext } from '@deepseek-ai/cordis';
import type { InputTriggerSource } from '@deepseek-ai/dsh-client-ui-input-trigger/client';
import type { ILayout, MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client';
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client';
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client';

import { BotPanelIcon, BotModeToggle, BotSidebar } from './bot-sidebar.js';
import { BotMain, BotPanel } from './bot-main.js';
import { createBridgeCall, loadBots } from './bridge.js';
import { CSS } from './styles.js';
import { store } from './store.js';

export const name = 'botharness-client';

export const inject = ['slots', 'connection', 'inputTriggers', 'layout'];

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

function toggleMode(ctx: ClientContext): void {
  const next = store.getSnapshot().mode === 'bot' ? 'dsh' : 'bot';
  const layout = (ctx as unknown as { layout?: ILayout }).layout;
  if (layout === undefined) {
    store.setMode(next);
    return;
  }
  layout.selectPanel(next === 'bot' ? PANEL_ID : null);
}

function registerModeShadow(
  ctx: ClientContext,
  name: 'sidebar.workspaces' | 'main',
  register: () => () => void,
): void {
  ctx.slots.inject(name, () => {
    let dispose: (() => void) | undefined;
    const reconcile = (): void => {
      if (store.getSnapshot().mode === 'bot') {
        if (dispose === undefined) dispose = register();
      } else if (dispose !== undefined) {
        dispose();
        dispose = undefined;
      }
    };
    const unsubscribe = store.subscribe(reconcile);
    reconcile();
    return () => {
      unsubscribe();
      dispose?.();
      dispose = undefined;
    };
  });
}

export function apply(ctx: ClientContext): void {
  const call = createBridgeCall(ctx);

  ctx.effect(installStyles, 'botharness: client styles');
  ctx.effect(() => {
    const controller = new AbortController();
    void store.load((signal) => loadBots(call, signal), controller.signal);
    return () => {
      controller.abort();
    };
  }, 'botharness: roster load');

  ctx.slots.inject('sidebar.panellist', () =>
    ctx.slots.register(
      {
        name: 'sidebar.panellist',
        id: PANEL_ID,
        order: 20,
        label: () => 'PersonaBots',
      },
      BotPanelIcon,
    ),
  );

  ctx.slots.inject('sidebar.footer.action', () =>
    ctx.slots.register(
      {
        name: 'sidebar.footer.action',
        id: 'botharness-mode',
        order: 100,
        inject: () => ({ toggleMode: () => toggleMode(ctx) }),
      },
      BotModeToggle,
    ),
  );

  ctx.slots.inject('main', () =>
    ctx.slots.register(
      {
        name: 'main',
        key: PANEL_ID,
      },
      BotPanel,
    ),
  );

  registerModeShadow(ctx, 'sidebar.workspaces', () =>
    ctx.slots.register({ name: 'sidebar.workspaces', priority: -100 }, BotSidebar),
  );
  registerModeShadow(ctx, 'main', () =>
    ctx.slots.register(
      { name: 'main', key: 'conversation' as MainPanelId, priority: -100 },
      BotMain,
    ),
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
