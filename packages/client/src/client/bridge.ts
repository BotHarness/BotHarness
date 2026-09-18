import type { Context as ClientContext } from '@deepseek-ai/cordis';
import type { ConnectionRpcResult } from '@deepseek-ai/dsh-client-connection/client';

import type { BotSummary } from './store.js';

export interface BridgeRpc {
  call(
    channel: string,
    endpoint: string,
    payload: unknown,
    signal?: AbortSignal,
  ): Promise<ConnectionRpcResult<unknown>>;
}

export type BridgeCall = (
  endpoint: string,
  payload: Record<string, unknown>,
  signal?: AbortSignal,
) => Promise<ConnectionRpcResult<unknown>>;

export function connectionRpc(ctx: ClientContext): BridgeRpc | undefined {
  const candidate = (ctx as unknown as { connection?: { rpc?: BridgeRpc } }).connection;
  return candidate?.rpc;
}

export function createBridgeCall(ctx: ClientContext): BridgeCall {
  return async (endpoint, payload, signal) => {
    const rpc = connectionRpc(ctx);
    if (rpc === undefined) {
      return {
        ok: false,
        error: { code: 'unavailable', message: 'Connection RPC is not available', details: {} },
      };
    }
    return rpc.call('/api', `botharness/${endpoint}`, payload, signal);
  };
}

export function parseBotSummaries(value: unknown): BotSummary[] {
  const bots = (value as { bots?: unknown }).bots;
  if (!Array.isArray(bots)) return [];
  return bots.flatMap((entry) => {
    if (typeof entry !== 'object' || entry === null) return [];
    const record = entry as Record<string, unknown>;
    const slug = record['slug'];
    const displayName = record['displayName'];
    if (typeof slug !== 'string' || slug.length === 0 || typeof displayName !== 'string') return [];
    const workspaces = Array.isArray(record['workspaces'])
      ? record['workspaces'].filter((item): item is string => typeof item === 'string')
      : [];
    const aggregateState = record['aggregateState'];
    const createdAt = record['createdAt'];
    const tag = record['tag'];
    const description = record['description'];
    const avatar = record['avatar'];
    const bot: BotSummary = {
      slug,
      displayName,
      aggregateState: typeof aggregateState === 'string' ? aggregateState : 'idle',
      workspaces,
      createdAt: typeof createdAt === 'string' ? createdAt : '',
      ...(typeof tag === 'string' ? { tag } : {}),
      ...(typeof description === 'string' ? { description } : {}),
      ...(typeof avatar === 'string' ? { avatar } : {}),
    };
    return [bot];
  });
}

export async function loadBots(call: BridgeCall, signal?: AbortSignal): Promise<BotSummary[]> {
  const result = await call('list', {}, signal);
  if (!result.ok) throw new Error(result.error.message);
  return parseBotSummaries(result.value);
}
