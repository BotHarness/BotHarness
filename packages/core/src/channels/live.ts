import type { ChannelDraft, ChannelDraftEvent } from './draft.js';
import type { ChannelMessage } from './channel.js';
import type { ChannelMessageCommit, ChannelStore } from './store.js';

export const CHANNEL_STREAM_PATH = '/api/botharness/stream';
export const CHANNEL_COMMIT_EVENT = 'channel/message';
export const CHANNEL_ADMISSION_EVENT = 'channel/admission';
export const CHANNEL_DRAFT_EVENT = 'channel/draft';
export const CHANNEL_DRAFT_BASELINE_EVENT = 'channel/draft-baseline';
export const CHANNEL_DRAFT_SETTLED_EVENT = 'channel/draft-settled';
export const CHANNEL_DRAFT_ABANDONED_EVENT = 'channel/draft-abandoned';
export const ROSTER_CHANGED_EVENT = 'roster/changed';

interface PublishedDraft extends ChannelDraft {
  revision: number;
}

type PublishedDraftEvent =
  | { type: 'update'; draft: PublishedDraft }
  | {
      type: 'settled' | 'abandoned';
      channelId: string;
      draftId: string;
      attemptId: string;
      revision: number;
      reason?: 'retargeted' | 'interrupted' | 'expired';
    };

interface Subscriber {
  push(commit: ChannelMessageCommit): void;
  pushDraft(event: PublishedDraftEvent): void;
  pushAdmission(messageId: string, message: ChannelMessage): void;
  close(): void;
}

export interface ChannelLiveHub {
  open(request: Request): Response;
  publishCommitted(commit: ChannelMessageCommit): void;
  publishAdmission(channelId: string, messageId: string, message: ChannelMessage): void;
  publishDraft(event: ChannelDraftEvent): void;
  publishRosterCommitted(): void;
  close(): void;
}

function parseRevision(value: string | null): number | undefined {
  if (value === null || !/^(0|[1-9][0-9]*)$/.test(value)) return undefined;
  const revision = Number(value);
  return Number.isSafeInteger(revision) ? revision : undefined;
}

function frame(commit: ChannelMessageCommit): string {
  return `id: ${commit.revision}\nevent: ${CHANNEL_COMMIT_EVENT}\ndata: ${JSON.stringify(commit)}\n\n`;
}

function draftFrame(event: PublishedDraftEvent): string {
  const name =
    event.type === 'update'
      ? CHANNEL_DRAFT_EVENT
      : event.type === 'settled'
        ? CHANNEL_DRAFT_SETTLED_EVENT
        : CHANNEL_DRAFT_ABANDONED_EVENT;
  const data = event.type === 'update' ? event.draft : event;
  return `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;
}

/** Process-local fanout; the Channel log is the durable authority. */
export function createChannelLiveHub(channels: ChannelStore): ChannelLiveHub {
  const subscribers = new Map<string, Set<Subscriber>>();
  const drafts = new Map<string, Map<string, PublishedDraft>>();
  const draftRevisions = new Map<string, number>();
  const rosterSubscribers = new Set<{ push(): void; close(): void }>();
  const openRoster = (): Response => {
    const encoder = new TextEncoder();
    let subscriber: { push(): void; close(): void } | undefined;
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        let ended = false;
        subscriber = {
          push() {
            if (ended) return;
            try {
              controller.enqueue(encoder.encode(`event: ${ROSTER_CHANGED_EVENT}\ndata: {}\n\n`));
            } catch {
              this.close();
            }
          },
          close() {
            if (ended) return;
            ended = true;
            if (heartbeat !== undefined) clearInterval(heartbeat);
            rosterSubscribers.delete(this);
            try {
              controller.close();
            } catch {
              // The browser may already have cancelled the stream.
            }
          },
        };
        rosterSubscribers.add(subscriber);
        controller.enqueue(encoder.encode('retry: 1500\n\n'));
        heartbeat = setInterval(() => {
          if (ended) return;
          try {
            controller.enqueue(encoder.encode(': heartbeat\n\n'));
          } catch {
            subscriber?.close();
          }
        }, 15_000);
      },
      cancel() {
        subscriber?.close();
      },
    });
    return new Response(body, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'X-Accel-Buffering': 'no',
      },
    });
  };
  const remove = (channelId: string, subscriber: Subscriber): void => {
    const group = subscribers.get(channelId);
    group?.delete(subscriber);
    if (group?.size === 0) subscribers.delete(channelId);
  };

  return {
    open(request) {
      const url = new URL(request.url);
      if (url.searchParams.get('scope') === 'roster') return openRoster();
      const channelId = url.searchParams.get('channelId');
      if (channelId === null || channels.get(channelId) === undefined) {
        return new Response('Unknown Channel', { status: 404 });
      }
      const query = url.searchParams.get('after');
      const lastEventId = request.headers.get('Last-Event-ID');
      const requested = query === null ? 0 : parseRevision(query);
      const resumed = lastEventId === null ? 0 : parseRevision(lastEventId);
      if (requested === undefined || resumed === undefined) {
        return new Response('Invalid Channel revision', { status: 400 });
      }
      const after = Math.max(requested, resumed);
      if (channels.messagesAfter(channelId, after) === undefined) {
        return new Response('Channel revision is ahead of the log', { status: 409 });
      }

      const encoder = new TextEncoder();
      let subscriber: Subscriber | undefined;
      let heartbeat: ReturnType<typeof setInterval> | undefined;
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          let delivered = after;
          let ended = false;
          const push = (commit: ChannelMessageCommit): void => {
            if (ended || commit.revision <= delivered) return;
            try {
              controller.enqueue(encoder.encode(frame(commit)));
              delivered = commit.revision;
            } catch {
              subscriber?.close();
            }
          };
          subscriber = {
            push,
            pushAdmission(messageId, message) {
              if (ended) return;
              try {
                controller.enqueue(
                  encoder.encode(
                    `event: ${CHANNEL_ADMISSION_EVENT}\ndata: ${JSON.stringify({
                      channelId,
                      messageId,
                      deliveries: message.deliveries ?? [],
                    })}\n\n`,
                  ),
                );
              } catch {
                this.close();
              }
            },
            pushDraft(event) {
              if (ended) return;
              try {
                controller.enqueue(encoder.encode(draftFrame(event)));
              } catch {
                this.close();
              }
            },
            close() {
              if (ended) return;
              ended = true;
              if (heartbeat !== undefined) clearInterval(heartbeat);
              remove(channelId, this);
              try {
                controller.close();
              } catch {
                // The browser may have cancelled the stream already.
              }
            },
          };
          let group = subscribers.get(channelId);
          if (group === undefined) {
            group = new Set();
            subscribers.set(channelId, group);
          }
          group.add(subscriber);
          controller.enqueue(encoder.encode('retry: 1500\n\n'));
          // Subscribe before replay so there is no query/subscribe gap.
          for (const commit of channels.messagesAfter(channelId, after) ?? []) push(commit);
          controller.enqueue(
            encoder.encode(
              `event: ${CHANNEL_DRAFT_BASELINE_EVENT}\ndata: ${JSON.stringify({
                channelId,
                revision: draftRevisions.get(channelId) ?? 0,
                drafts: [...(drafts.get(channelId)?.values() ?? [])],
              })}\n\n`,
            ),
          );
          heartbeat = setInterval(() => {
            if (ended) return;
            try {
              controller.enqueue(encoder.encode(': heartbeat\n\n'));
            } catch {
              subscriber?.close();
            }
          }, 15_000);
        },
        cancel() {
          subscriber?.close();
        },
      });
      return new Response(body, {
        headers: {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          'X-Accel-Buffering': 'no',
        },
      });
    },
    publishCommitted(commit) {
      for (const subscriber of subscribers.get(commit.channelId) ?? []) subscriber.push(commit);
      if (commit.message.author.kind !== 'bot') return;
      const botSlug = commit.message.author.slug;
      const candidates = [...(drafts.get(commit.channelId)?.values() ?? [])].filter(
        (draft) => draft.botSlug === botSlug,
      );
      const matching = candidates.filter((draft) => commit.message.body.startsWith(draft.body));
      const settled = matching.length > 0 ? matching : candidates.length === 1 ? candidates : [];
      for (const draft of settled) {
        this.publishDraft({
          type: 'settled',
          channelId: commit.channelId,
          draftId: draft.draftId,
          attemptId: draft.attemptId,
        });
      }
    },
    publishAdmission(channelId, messageId, message) {
      for (const subscriber of subscribers.get(channelId) ?? [])
        subscriber.pushAdmission(messageId, message);
    },
    publishDraft(event) {
      const channelId = event.type === 'update' ? event.draft.channelId : event.channelId;
      if (channels.get(channelId) === undefined) return;
      const revision = (draftRevisions.get(channelId) ?? 0) + 1;
      let published: PublishedDraftEvent;
      if (event.type === 'update') {
        let group = drafts.get(channelId);
        if (group === undefined) {
          group = new Map();
          drafts.set(channelId, group);
        }
        const draft = { ...event.draft, revision };
        group.set(draft.draftId, draft);
        published = { type: 'update', draft };
      } else {
        const group = drafts.get(channelId);
        if (group?.get(event.draftId)?.attemptId !== event.attemptId) return;
        group.delete(event.draftId);
        if (group.size === 0) drafts.delete(channelId);
        published = { ...event, revision };
      }
      draftRevisions.set(channelId, revision);
      for (const subscriber of subscribers.get(channelId) ?? []) subscriber.pushDraft(published);
    },
    publishRosterCommitted() {
      for (const subscriber of rosterSubscribers) subscriber.push();
    },
    close() {
      drafts.clear();
      for (const group of subscribers.values()) {
        for (const subscriber of group) subscriber.close();
      }
      for (const subscriber of rosterSubscribers) subscriber.close();
    },
  };
}
