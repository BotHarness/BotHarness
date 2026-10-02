import { z } from 'zod';
import type { MessagingGrant, MessagingSnapshot } from './outbound.js';

export interface ChannelBridgeConfiguration {
  name: string;
  enabled: boolean;
  collection: 'mentions' | 'all';
  revision: number;
  intakeAfter?: string;
}
const fields = {
  grantId: z.string().uuid(),
  expectedGrantRevision: z.number().int().positive(),
};
const configuration = {
  name: z.string().trim().min(1).max(120),
  enabled: z.boolean(),
  collection: z.enum(['mentions', 'all']),
};
export const channelBridgeInput = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('add'), ...fields, ...configuration }).strict(),
  z
    .object({
      kind: z.literal('update'),
      ...fields,
      expectedRevision: z.number().int().positive(),
      ...configuration,
    })
    .strict(),
  z
    .object({ kind: z.literal('delete'), ...fields, expectedRevision: z.number().int().positive() })
    .strict(),
]);
export type ChannelBridgeInput = z.infer<typeof channelBridgeInput>;
export interface ChannelBridgeSource {
  grantId: string;
  grantRevision: number;
  botSlug: string;
  platform: string;
  accountName: string;
  conversationName: string;
  ordinaryDelivery: 'verified' | 'unverified';
}
export interface ChannelBridgeRow extends ChannelBridgeSource, ChannelBridgeConfiguration {
  availability: MessagingSnapshot['grants'][number]['availability'];
  reception: MessagingSnapshot['grants'][number]['reception'];
}
export interface ChannelBridgeSnapshot {
  channelId: string;
  bridges: ChannelBridgeRow[];
  sources: ChannelBridgeSource[];
}
export function channelBridgeConfiguration(grant: MessagingGrant): ChannelBridgeConfiguration {
  return (
    grant.channelBridge ?? {
      name: grant.targetName,
      enabled: grant.receiveScope !== undefined,
      collection: 'mentions',
      revision: 1,
    }
  );
}
