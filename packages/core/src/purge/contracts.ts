import { z } from 'zod';

const identity = z.string().min(1).max(200);
export const purgeFactSchema = z
  .object({
    sourceEventId: identity,
    channelId: identity,
    messageId: identity,
    eventAt: z.iso.datetime(),
    author: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('human') }).strict(),
      z.object({ kind: z.literal('bot'), slug: identity }).strict(),
    ]),
    replyTo: identity.optional(),
    causation: z
      .object({
        rootSourceEventId: identity,
        parentSourceEventId: identity,
        hop: z.number().int().min(0),
      })
      .strict()
      .optional(),
    acceptedAt: z.iso.datetime(),
    actor: z.literal('local-human'),
    reason: z.literal('human-request'),
  })
  .strict();
export type PurgeFact = z.infer<typeof purgeFactSchema>;

export const purgeCheckpointSchema = z
  .object({
    format: z.literal('botharness-purge'),
    version: z.literal(1),
    facts: z.array(purgeFactSchema).max(1_000_000),
  })
  .strict();
export type PurgeCheckpoint = z.infer<typeof purgeCheckpointSchema>;

export interface ChannelHistoryItem {
  id: string;
  name: string;
  deletedAt: string;
}

export interface PurgeSource {
  sourceEventId: string;
  messageId: string;
  at: string;
  body: string;
  purgedAt?: string;
  refusal?: string;
}

export interface PurgePreview {
  token: string;
  expiresAt: string;
  channelId: string;
  sourceEventIds: string[];
  placements: { channelId: string; name: string; messageId: string }[];
  admissions: { botSlug: string; state: string }[];
}

export interface ContentPurge {
  history(): ChannelHistoryItem[];
  sources(channelId: string, before?: string): { sources: PurgeSource[]; before?: string };
  preview(channelId: string, sourceEventIds: readonly string[]): PurgePreview;
  confirm(
    channelId: string,
    sourceEventIds: readonly string[],
    token: string,
  ): { accepted: number };
  checkpoint(): PurgeCheckpoint;
  withCheckpoint<T>(exportSnapshot: (checkpoint: PurgeCheckpoint) => T): T;
  close(): void;
}

export class ContentPurgeError extends Error {
  constructor(
    readonly code: 'purge-unavailable' | 'purge-scope-unsupported' | 'purge-preview-stale',
    message: string,
  ) {
    super(message);
    this.name = 'ContentPurgeError';
  }
}
