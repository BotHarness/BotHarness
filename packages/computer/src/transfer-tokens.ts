import { randomUUID } from 'node:crypto';

export type TransferKind = 'download' | 'upload';

export interface TransferTokenStore {
  mint(target: string, kind: TransferKind): string;
  consume(token: string, kind: TransferKind): string | undefined;
}

export interface TransferTokensOptions {
  readonly now?: () => number;
  readonly ttlMs?: number;
  readonly max?: number;
  readonly uuid?: () => string;
}

const DEFAULT_TTL_MS = 5 * 60_000;
const DEFAULT_MAX = 20;

export function createTransferTokens(options: TransferTokensOptions = {}): TransferTokenStore {
  const now = options.now ?? Date.now;
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const max = options.max ?? DEFAULT_MAX;
  const uuid = options.uuid ?? randomUUID;
  const grants = new Map<string, { target: string; kind: TransferKind; expiresAt: number }>();

  const evictExpired = (): void => {
    const at = now();
    for (const [token, grant] of grants) {
      if (grant.expiresAt <= at) grants.delete(token);
    }
  };

  return {
    mint(target: string, kind: TransferKind): string {
      evictExpired();
      while (grants.size >= max) {
        const oldest = grants.keys().next();
        if (oldest.done === true) break;
        grants.delete(oldest.value);
      }
      const token = uuid();
      grants.set(token, { target, kind, expiresAt: now() + ttlMs });
      return token;
    },
    consume(token: string, kind: TransferKind): string | undefined {
      const grant = grants.get(token);
      grants.delete(token);
      if (grant === undefined || grant.kind !== kind || grant.expiresAt <= now()) {
        return undefined;
      }
      return grant.target;
    },
  };
}
