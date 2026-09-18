import type { Context as ClientContext } from '@deepseek-ai/cordis';
import type { ConnectionRpcResult } from '@deepseek-ai/dsh-client-connection/client';
import type { InputTriggerSource } from '@deepseek-ai/dsh-client-ui-input-trigger/client';
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client';
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client';
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client';

import { RosterIcon } from './roster-icon.js';
import { RosterPanel, type RosterPanelFace } from './roster-panel.js';

export const name = 'botharness-client';

export const inject = ['slots', 'connection', 'inputTriggers'];

export const PANEL_ID = 'botharness' as MainPanelId;

interface BridgeRpc {
  call(
    channel: string,
    endpoint: string,
    payload: unknown,
    signal?: AbortSignal,
  ): Promise<ConnectionRpcResult<unknown>>;
}

/**
 * Read the browser Connection service structurally: DSH ships the
 * `Context.connection` merge on the Host root only, and the assembled app
 * provides the service at runtime through the Connection plugin.
 */
function connectionRpc(ctx: ClientContext): BridgeRpc | undefined {
  const candidate = (ctx as unknown as { connection?: { rpc?: BridgeRpc } }).connection;
  return candidate?.rpc;
}

export function apply(ctx: ClientContext): void {
  const call = async (
    endpoint: string,
    payload: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<ConnectionRpcResult<unknown>> => {
    const rpc = connectionRpc(ctx);
    if (rpc === undefined) {
      return {
        ok: false,
        error: { code: 'unavailable', message: 'Connection RPC is not available', details: {} },
      };
    }
    return rpc.call('/api', `botharness/${endpoint}`, payload, signal);
  };

  const face: RosterPanelFace = {
    async list(query) {
      const result = await call('list', query === undefined ? {} : { query });
      if (!result.ok) throw new Error(result.error.message);
      return result.value;
    },
  };

  ctx.slots.inject('sidebar.panellist', () =>
    ctx.slots.register(
      {
        name: 'sidebar.panellist',
        id: PANEL_ID,
        order: 20,
        label: () => 'PersonaBots',
      },
      RosterIcon,
    ),
  );
  ctx.slots.inject('main', () =>
    ctx.slots.register(
      {
        name: 'main',
        key: PANEL_ID,
        inject: () => face,
      },
      RosterPanel,
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
