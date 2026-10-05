import manifest from '../../package.json' with { type: 'json' };
import { registerManagementRpc } from '../management-rpc.mjs';
import { productManagedUpdate } from './update-policy.mjs';

export const UPDATE_RPC_CHANNEL = '/dsh-im';
export const UPDATE_ENDPOINTS = Object.freeze(['update.status', 'update.check', 'update.install']);

export function installUpdateRpc(ctx) {
  return registerManagementRpc(
    ctx,
    UPDATE_RPC_CHANNEL,
    async (endpoint, payload, signal) =>
      productManagedUpdate(endpoint, payload, signal, manifest.version),
    { authority: 'loopback' },
  );
}
