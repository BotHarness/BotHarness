import type { AvatarAppearance, RetainedAvatarAppearance } from '../bots/avatar-appearance.js';
import type { ChannelRecord } from '../channels/channel.js';
import { messagePreview } from '../channels/message-preview.js';
import type { PersonaBotOutputCommitted } from '../channels/output.js';
import type { PersonaBotActivitySnapshot } from '../state/bot-state.js';
import { randomUUID } from 'node:crypto';

export const COMPANION_PATH = '/api/botharness/companion';
export interface CompanionBot {
  slug: string;
  name: string;
  paused: boolean;
  avatar?: string;
  appearance?: AvatarAppearance | RetainedAvatarAppearance;
}
export interface CompanionSnapshot {
  profileId: string;
  bot: CompanionBot;
  activity: PersonaBotActivitySnapshot;
}
export interface CompanionMessage {
  generation: string;
  botId: string;
  messageId: string;
  channelId: string;
  channelName: string;
  body: string;
}
export interface CompanionFeed {
  open(request: Request): Response;
  update(request: Request): Promise<Response>;
  publish(event: PersonaBotOutputCommitted): void;
  close(): void;
}
export interface CompanionSubscription {
  botId: string;
  dm: boolean;
}
interface FeedSource {
  profileId: string;
  bot(slug: string): CompanionBot | undefined;
  activity(): PersonaBotActivitySnapshot;
  onActivity(changed: () => void): () => void;
  channel(
    id: string,
  ): Pick<ChannelRecord, 'id' | 'type' | 'name' | 'botSlug' | 'members' | 'deletedAt'> | undefined;
}

export function createCompanionFeed(source: FeedSource): CompanionFeed {
  const consumers = new Set<{ publish(event: PersonaBotOutputCommitted): void; close(): void }>();
  const controls = new Map<
    string,
    {
      replace(
        selections: readonly CompanionSubscription[],
        capacity: number,
        revision: number,
      ): void;
    }
  >();
  const encoder = new TextEncoder();
  let disposed = false;
  return {
    async update(request) {
      if (disposed) return new Response('Companion unavailable', { status: 503 });
      let value: unknown;
      try {
        value = await request.json();
      } catch {
        return new Response('Invalid subscription', { status: 400 });
      }
      if (
        typeof value !== 'object' ||
        value === null ||
        !('consumerId' in value) ||
        typeof value.consumerId !== 'string' ||
        !('selections' in value) ||
        !Array.isArray(value.selections)
      )
        return new Response('Invalid subscription', { status: 400 });
      const consumer = controls.get(value.consumerId);
      if (!consumer) return new Response('Subscription unavailable', { status: 404 });
      const capacity = 'capacity' in value ? value.capacity : 20;
      const revision = 'revision' in value ? value.revision : 0;
      if (typeof revision !== 'number' || !Number.isSafeInteger(revision) || revision < 0)
        return new Response('Invalid revision', { status: 400 });
      if (
        typeof capacity !== 'number' ||
        !Number.isInteger(capacity) ||
        capacity < 1 ||
        capacity > 100
      )
        return new Response('Invalid capacity', { status: 400 });
      const selections: CompanionSubscription[] = [];
      const seen = new Set<string>();
      for (const item of value.selections) {
        if (
          typeof item !== 'object' ||
          item === null ||
          !('botId' in item) ||
          typeof item.botId !== 'string' ||
          !('dm' in item) ||
          typeof item.dm !== 'boolean' ||
          seen.has(item.botId)
        )
          return new Response('Invalid selection', { status: 400 });
        if (!source.bot(item.botId)) return new Response('Unknown PersonaBot', { status: 404 });
        seen.add(item.botId);
        selections.push({ botId: item.botId, dm: item.dm });
      }
      consumer.replace(selections, capacity, revision);
      return Response.json({ updated: true });
    },
    open(request) {
      if (disposed) return new Response('Companion unavailable', { status: 503 });
      const url = new URL(request.url);
      const botId = url.searchParams.get('botId');
      const multiplexed = url.searchParams.get('subscribe') === '1';
      if (botId === null && !multiplexed) return Response.json({ profileId: source.profileId });
      const bot = botId === null ? undefined : source.bot(botId);
      if (!multiplexed && bot === undefined)
        return new Response('Unknown PersonaBot', { status: 404 });
      const consumerId = multiplexed ? randomUUID() : undefined;
      const dm = url.searchParams.get('dm') !== '0';
      let selected = new Map<string, { dm: boolean; bot: CompanionBot }>();
      if (!multiplexed && bot && botId) selected.set(botId, { dm, bot });
      let capacity = 20;
      let selectionRevision = 0;
      let finish: (() => void) | undefined;
      let flush: (() => void) | undefined;
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          let ended = false;
          let pendingActivity: string | undefined;
          let pendingSelection: string | undefined;
          const messages = new Map<string, string[]>();
          const frame = (name: string, value: unknown) =>
            `event: ${name}\ndata: ${JSON.stringify(value)}\n\n`;
          const snapshot = () => ({
            profileId: source.profileId,
            ...(multiplexed
              ? {
                  consumerId,
                  selectionRevision,
                  bots: [...selected].map(([id, value]) => source.bot(id) ?? value.bot),
                }
              : { bot: botId === null ? bot : (source.bot(botId) ?? bot) }),
            activity: source.activity(),
          });
          const write = (value: string) => {
            try {
              controller.enqueue(encoder.encode(value));
            } catch {
              consumer.close();
            }
          };
          const changed = () => {
            if (ended) return;
            const value = frame('companion/activity', snapshot());
            if ((controller.desiredSize ?? 0) > 0) write(value);
            else pendingActivity = value;
          };
          let offActivity: (() => void) | undefined;
          let heartbeat: ReturnType<typeof setInterval> | undefined;
          const consumer = {
            replace(
              selections: readonly CompanionSubscription[],
              nextCapacity: number,
              revision: number,
            ) {
              if (ended) return;
              selectionRevision = revision;
              selected = new Map(
                selections.map((selection) => [
                  selection.botId,
                  { dm: selection.dm, bot: source.bot(selection.botId)! },
                ]),
              );
              capacity = nextCapacity;
              for (const [id, queue] of messages) {
                if (!selected.get(id)?.dm) messages.delete(id);
                else messages.set(id, queue.slice(-capacity));
              }
              const value = frame('companion/selection', snapshot());
              if ((controller.desiredSize ?? 0) > 0) write(value);
              else pendingSelection = value;
            },
            publish(event: PersonaBotOutputCommitted) {
              const selection = selected.get(event.botId);
              if (ended || !selection?.dm || source.bot(event.botId)?.paused === true) return;
              const channel = source.channel(event.channelId);
              if (
                channel?.deletedAt !== undefined ||
                channel?.type !== 'dm' ||
                channel.botSlug !== event.botId ||
                channel.members.length !== 1 ||
                channel.members[0] !== event.botId
              )
                return;
              const value: CompanionMessage = {
                generation: source.activity().generation,
                botId: event.botId,
                messageId: event.messageId,
                channelId: channel.id,
                channelName: channel.name,
                body: messagePreview(event.content.body),
              };
              const text = frame('companion/message', value);
              if ((controller.desiredSize ?? 0) > 0) write(text);
              else {
                const queue = messages.get(event.botId) ?? [];
                queue.push(text);
                if (queue.length > capacity) queue.shift();
                messages.set(event.botId, queue);
              }
            },
            close() {
              if (ended) return;
              ended = true;
              offActivity?.();
              if (heartbeat !== undefined) clearInterval(heartbeat);
              messages.clear();
              if (consumerId) controls.delete(consumerId);
              consumers.delete(consumer);
              try {
                controller.close();
              } catch {}
            },
          };
          finish = () => consumer.close();
          flush = () => {
            if (ended) return;
            if (pendingSelection !== undefined && (controller.desiredSize ?? 0) > 0) {
              const next = pendingSelection;
              pendingSelection = undefined;
              write(next);
            }
            if (pendingActivity !== undefined && (controller.desiredSize ?? 0) > 0) {
              const next = pendingActivity;
              pendingActivity = undefined;
              write(next);
            }
            while (messages.size && (controller.desiredSize ?? 0) > 0) {
              const next = messages.entries().next().value;
              if (!next) break;
              const [id, queue] = next;
              messages.delete(id);
              const text = queue.shift();
              if (queue.length) messages.set(id, queue);
              if (text) write(text);
            }
          };
          consumers.add(consumer);
          if (consumerId) controls.set(consumerId, consumer);
          offActivity = source.onActivity(changed);
          write(frame('companion/baseline', snapshot()));
          heartbeat = setInterval(() => {
            if (!ended && (controller.desiredSize ?? 0) > 0) write(': heartbeat\n\n');
          }, 15_000);
        },
        pull() {
          flush?.();
        },
        cancel() {
          finish?.();
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
    publish(event) {
      for (const consumer of consumers) consumer.publish(event);
    },
    close() {
      disposed = true;
      for (const consumer of consumers) consumer.close();
    },
  };
}
