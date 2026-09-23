import { randomUUID } from 'node:crypto';

/**
 * Single-use transfer grants for browser download/upload: the export and
 * upload-init routes mint a token bound to one archive path, and the
 * byte-moving routes consume it. Tokens never touch the settings store or
 * the disk — process memory only, so a Host restart invalidates them.
 * @module @botharness/computer/transfer-tokens
 */

export type TransferKind = 'download' | 'upload';

export interface TransferTokenStore {
  /** Mint a grant for an absolute archive path; evicts oldest past the cap. */
  mint(target: string, kind: TransferKind): string;
  /**
   * Consume a grant, returning its target. Unknown, expired, or
   * wrong-kind tokens yield undefined — a mismatched consume still burns
   * the grant (fail closed).
   */
  consume(token: string, kind: TransferKind): string | undefined;
}

export interface TransferTokensOptions {
  readonly now?: () => number;
  /** Grant lifetime; defaults to five minutes. */
  readonly ttlMs?: number;
  /** Maximum live grants; defaults to 20. */
  readonly max?: number;
  /** Token source; defaults to randomUUID. Injected in tests. */
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
