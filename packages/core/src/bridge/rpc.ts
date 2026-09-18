import type { Context } from '@deepseek-ai/cordis';
import type { ConnectionRpcHandler, ConnectionRpcResult } from '@deepseek-ai/dsh-client-connection';

import type { BridgeMethods, BridgeResult } from './methods.js';

export const BRIDGE_ENDPOINT_PREFIX = 'botharness/';

function failure(code: string, message: string): ConnectionRpcResult<never> {
  return { ok: false, error: { code, message, details: {} } };
}

function toRpc<T>(result: BridgeResult<T>): ConnectionRpcResult<T> {
  return result.ok
    ? { ok: true, value: result.value }
    : failure(result.error.code, result.error.message);
}

/**
 * Adapt the Host read model to the shared `/api` RPC channel.
 *
 * The client calls `botharness/list` etc. through the generic Connection RPC
 * (ADR-0023); this handler owns only the endpoint -> method mapping and the
 * error envelope.
 */
export function createBridgeRpcHandler(methods: BridgeMethods): ConnectionRpcHandler {
  return async (endpoint, payload) => {
    switch (endpoint) {
      case `${BRIDGE_ENDPOINT_PREFIX}list`:
        return toRpc(methods.list(payload));
      case `${BRIDGE_ENDPOINT_PREFIX}get`:
        return toRpc(methods.get(payload));
      case `${BRIDGE_ENDPOINT_PREFIX}create`:
        return toRpc(methods.create(payload));
      case `${BRIDGE_ENDPOINT_PREFIX}update`:
        return toRpc(methods.update(payload));
      case `${BRIDGE_ENDPOINT_PREFIX}pause`:
        return toRpc(methods.pause(payload));
      case `${BRIDGE_ENDPOINT_PREFIX}resume`:
        return toRpc(methods.resume(payload));
      default:
        return failure('not-found', `unknown bridge endpoint: ${endpoint}`);
    }
  };
}

/**
 * Register the bridge on the optional Host Connection service.
 *
 * `connection` is injected dynamically so profiles without it keep loading the
 * plugin (ADR-0022's lesson): no `connection`, no bridge, no PENDING state.
 */
export function registerBridge(ctx: Context, methods: BridgeMethods): void {
  ctx.inject(['connection'], (scoped) => {
    scoped.effect(() => {
      const dispose = scoped.connection.rpc.intercept(
        '/api',
        (endpoint) => endpoint.startsWith(BRIDGE_ENDPOINT_PREFIX),
        createBridgeRpcHandler(methods),
      );
      return () => {
        void dispose();
      };
    }, 'botharness: client bridge rpc');
  });
}
