import type { DatabaseSync } from 'node:sqlite';
import { messagingDefaults } from './defaults.js';
import { MessagingError } from './provider.js';

export interface MessagingIdentity {
  id: string;
  botSlug: string;
  providerId: string;
  platform: string;
  accountRef: string;
  fingerprint: string;
  name: string;
  enabled: boolean;
  enabledInheritance?: 'inherit' | 'custom';
  newConversations: MessagingNewConversations;
  defaultRevision?: number;
  revision: number;
  createdAt: string;
  revokedAt?: string;
}
export type MessagingNewConversations = 'auto' | 'ask';
export type MessagingIdentityInput =
  | { kind: 'bind'; providerId: string; accountRef: string; fingerprint: string }
  | {
      kind: 'update';
      id: string;
      expectedRevision: number;
      name: string;
      enabled: boolean;
      inheritEnabled?: boolean | undefined;
      expectedDefaultRevision?: number | undefined;
      newConversations?: MessagingNewConversations | undefined;
    }
  | { kind: 'reconnect'; id: string; expectedRevision: number }
  | { kind: 'unbind'; id: string; expectedRevision: number };
export type MessagingIdentityView = MessagingIdentity & {
  availability: 'available' | 'paused' | 'unavailable' | 'rebind-required';
  reception?: 'off' | 'connecting' | 'receiving' | 'unavailable';
  grantCount: number;
  scopes: string[];
};
interface BindingRow {
  id: string;
  bot_slug: string;
  provider_id: string;
  platform: string;
  account_ref: string;
  fingerprint: string;
  display_name: string;
  enabled: number;
  enabled_inherited: number;
  new_conversations: MessagingNewConversations;
  revision: number;
  created_at: string;
  revoked_at: string | null;
}
export function readMessagingIdentity(db: DatabaseSync, id: string): MessagingIdentity {
  const r = db.prepare('SELECT * FROM messaging_bindings WHERE id = ?').get(id) as unknown as
    | BindingRow
    | undefined;
  if (!r) throw new MessagingError('identity-unavailable');
  return {
    id: r.id,
    botSlug: r.bot_slug,
    providerId: r.provider_id,
    platform: r.platform,
    accountRef: r.account_ref,
    fingerprint: r.fingerprint,
    name: r.display_name,
    enabled:
      r.enabled_inherited === 1
        ? messagingDefaults(db, r.platform).identityEnabled
        : r.enabled === 1,
    enabledInheritance: r.enabled_inherited === 1 ? 'inherit' : 'custom',
    newConversations: r.new_conversations,
    defaultRevision: messagingDefaults(db, r.platform).revision,
    revision: r.revision,
    createdAt: r.created_at,
    ...(r.revoked_at ? { revokedAt: r.revoked_at } : {}),
  };
}
export function assertMessagingIdentity(
  db: DatabaseSync,
  id: string,
  expectedRevision?: number,
): MessagingIdentity {
  const value = readMessagingIdentity(db, id);
  if (value.revokedAt) throw new MessagingError('identity-unbound');
  if (!value.enabled) throw new MessagingError('identity-paused');
  if (expectedRevision !== undefined && value.revision !== expectedRevision)
    throw new MessagingError('identity-changed');
  return value;
}
