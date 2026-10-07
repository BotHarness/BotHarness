import type { AvatarAppearance, RetainedAvatarAppearance } from '../bots/avatar-appearance.js';
import type { ChannelRecord } from '../channels/channel.js';
import type { PersonaBotOutputCommitted } from '../channels/output.js';
import type { PersonaBotActivitySnapshot } from '../state/bot-state.js';

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
  publish(event: PersonaBotOutputCommitted): void;
  close(): void;
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
  const encoder = new TextEncoder();
  let disposed = false;
  return {
    open(request) {
      if (disposed) return new Response('Companion unavailable', { status: 503 });
      const url = new URL(request.url);
      const botId = url.searchParams.get('botId');
      if (botId === null) return Response.json({ profileId: source.profileId });
      const bot = source.bot(botId);
      if (bot === undefined) return new Response('Unknown PersonaBot', { status: 404 });
      const dm = url.searchParams.get('dm') !== '0';
      let finish: (() => void) | undefined;
      let flush: (() => void) | undefined;
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          let ended = false;
          let pendingActivity: string | undefined;
          const messages: string[] = [];
          const frame = (name: string, value: unknown) =>
            `event: ${name}\ndata: ${JSON.stringify(value)}\n\n`;
          const snapshot = (): CompanionSnapshot => ({
            profileId: source.profileId,
            bot: source.bot(botId) ?? bot,
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
            publish(event: PersonaBotOutputCommitted) {
              if (ended || !dm || event.botId !== botId || source.bot(botId)?.paused === true)
                return;
              const channel = source.channel(event.channelId);
              if (
                channel?.deletedAt !== undefined ||
                channel?.type !== 'dm' ||
                channel.botSlug !== botId ||
                channel.members.length !== 1 ||
                channel.members[0] !== botId
              )
                return;
              const value: CompanionMessage = {
                generation: source.activity().generation,
                botId,
                messageId: event.messageId,
                channelId: channel.id,
                channelName: channel.name,
                body: event.content.body.slice(0, 2000),
              };
              const text = frame('companion/message', value);
              if ((controller.desiredSize ?? 0) > 0) write(text);
              else {
                messages.push(text);
                if (messages.length > 20) messages.shift();
              }
            },
            close() {
              if (ended) return;
              ended = true;
              offActivity?.();
              if (heartbeat !== undefined) clearInterval(heartbeat);
              messages.length = 0;
              consumers.delete(consumer);
              try {
                controller.close();
              } catch {}
            },
          };
          finish = () => consumer.close();
          flush = () => {
            if (ended) return;
            if (pendingActivity !== undefined && (controller.desiredSize ?? 0) > 0) {
              const next = pendingActivity;
              pendingActivity = undefined;
              write(next);
            }
            while (messages.length && (controller.desiredSize ?? 0) > 0) write(messages.shift()!);
          };
          consumers.add(consumer);
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
