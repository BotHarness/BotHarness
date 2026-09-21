import type { ChannelDraft, ChannelDraftEvent } from './draft.js';
import type { ChannelMessageCommit, ChannelStore } from './store.js';

export const CHANNEL_STREAM_PATH = '/api/botharness/stream';
export const CHANNEL_COMMIT_EVENT = 'channel/message';
export const CHANNEL_DRAFT_EVENT = 'channel/draft';
export const CHANNEL_DRAFT_END_EVENT = 'channel/draft-end';

interface Subscriber {
  push(commit: ChannelMessageCommit): void;
  pushDraft(event: ChannelDraftEvent): void;
  close(): void;
}

export interface ChannelLiveHub {
  open(request: Request): Response;
  publishCommitted(commit: ChannelMessageCommit): void;
  publishDraft(event: ChannelDraftEvent): void;
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

function draftFrame(event: ChannelDraftEvent): string {
  const name = event.type === 'update' ? CHANNEL_DRAFT_EVENT : CHANNEL_DRAFT_END_EVENT;
  const data = event.type === 'update' ? event.draft : event;
  return `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;
}

/** Process-local fanout; the Channel log is the durable authority. */
export function createChannelLiveHub(channels: ChannelStore): ChannelLiveHub {
  const subscribers = new Map<string, Set<Subscriber>>();
  const drafts = new Map<string, Map<string, ChannelDraft>>();
  const remove = (channelId: string, subscriber: Subscriber): void => {
    const group = subscribers.get(channelId);
    group?.delete(subscriber);
    if (group?.size === 0) subscribers.delete(channelId);
  };

  return {
    open(request) {
      const url = new URL(request.url);
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
          for (const draft of drafts.get(channelId)?.values() ?? []) {
            subscriber?.pushDraft({ type: 'update', draft });
          }
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
      for (const draft of drafts.get(commit.channelId)?.values() ?? []) {
        if (draft.botSlug === commit.message.author.slug) {
          this.publishDraft({ type: 'end', channelId: commit.channelId, draftId: draft.draftId });
        }
      }
    },
    publishDraft(event) {
      const channelId = event.type === 'update' ? event.draft.channelId : event.channelId;
      if (channels.get(channelId) === undefined) return;
      if (event.type === 'update') {
        let group = drafts.get(channelId);
        if (group === undefined) {
          group = new Map();
          drafts.set(channelId, group);
        }
        group.set(event.draft.draftId, event.draft);
      } else {
        const group = drafts.get(channelId);
        if (group?.has(event.draftId) !== true) return;
        group.delete(event.draftId);
        if (group.size === 0) drafts.delete(channelId);
      }
      for (const subscriber of subscribers.get(channelId) ?? []) subscriber.pushDraft(event);
    },
    close() {
      drafts.clear();
      for (const group of subscribers.values()) {
        for (const subscriber of group) subscriber.close();
      }
    },
  };
}
