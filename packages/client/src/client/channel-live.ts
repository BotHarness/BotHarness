import { parseChannelMessage } from './bridge.js';
import type { BridgeActions } from './actions.js';
import type { ChannelDraft, ClientStore } from './store.js';

const EVENT_NAME = 'channel/message';
const DRAFT_EVENT = 'channel/draft';
const DRAFT_END_EVENT = 'channel/draft-end';

interface ChannelFrame {
  channelId: string;
  revision: number;
  message: ReturnType<typeof parseChannelMessage>;
}

function parseFrame(value: string): ChannelFrame | undefined {
  let decoded: unknown;
  try {
    decoded = JSON.parse(value);
  } catch {
    return undefined;
  }
  if (typeof decoded !== 'object' || decoded === null) return undefined;
  const record = decoded as Record<string, unknown>;
  const revision = record['revision'];
  const message = parseChannelMessage(record['message']);
  if (
    typeof record['channelId'] !== 'string' ||
    typeof revision !== 'number' ||
    !Number.isSafeInteger(revision) ||
    revision < 1 ||
    message === undefined
  ) {
    return undefined;
  }
  return { channelId: record['channelId'], revision, message };
}

function parseDraft(value: string): ChannelDraft | undefined {
  let decoded: unknown;
  try {
    decoded = JSON.parse(value);
  } catch {
    return undefined;
  }
  if (typeof decoded !== 'object' || decoded === null) return undefined;
  const item = decoded as Record<string, unknown>;
  if (
    typeof item['channelId'] !== 'string' ||
    typeof item['draftId'] !== 'string' ||
    typeof item['botSlug'] !== 'string' ||
    typeof item['body'] !== 'string'
  )
    return undefined;
  return {
    channelId: item['channelId'],
    draftId: item['draftId'],
    botSlug: item['botSlug'],
    body: item['body'],
  };
}

function parseDraftEnd(value: string): { channelId: string; draftId: string } | undefined {
  try {
    const decoded: unknown = JSON.parse(value);
    if (typeof decoded !== 'object' || decoded === null) return undefined;
    if (!('channelId' in decoded) || !('draftId' in decoded)) return undefined;
    if (typeof decoded.channelId !== 'string' || typeof decoded.draftId !== 'string')
      return undefined;
    return { channelId: decoded.channelId, draftId: decoded.draftId };
  } catch {
    return undefined;
  }
}

/**
 * Own exactly one SSE connection for the selected Channel. The snapshot RPC
 * establishes the cursor; EventSource reconnects with Last-Event-ID.
 */
export function mountChannelLive(
  store: ClientStore,
  actions: BridgeActions,
  makeSource: (url: string) => EventSource = (url) => new EventSource(url),
): () => void {
  let activeChannelId: string | undefined;
  let source: EventSource | undefined;
  let recovering = false;
  let disposed = false;

  const close = (): void => {
    source?.close();
    source = undefined;
    activeChannelId = undefined;
  };

  const recover = async (channelId: string): Promise<void> => {
    if (recovering || disposed) return;
    recovering = true;
    close();
    store.setConversation({ drafts: [] });
    try {
      await actions.refreshChannelMessages(channelId);
    } catch (error) {
      console.warn('botharness: Channel live refresh failed', error);
    } finally {
      recovering = false;
      sync();
    }
  };

  const sync = (): void => {
    if (disposed || recovering) return;
    const snapshot = store.getSnapshot();
    const channel =
      snapshot.mode === 'bot' && snapshot.conversation.status === 'ready'
        ? snapshot.conversation.channel
        : undefined;
    if (channel?.id === activeChannelId) return;
    close();
    if (channel === undefined) return;
    activeChannelId = channel.id;
    const query = new URLSearchParams({
      channelId: channel.id,
      after: String(snapshot.conversation.revision),
    });
    const next = makeSource(`/api/botharness/stream?${query.toString()}`);
    source = next;
    next.addEventListener(EVENT_NAME, (event) => {
      if (!(event instanceof MessageEvent)) return;
      const frame = parseFrame(event.data as string);
      if (frame === undefined || frame.channelId !== activeChannelId) return;
      const latest = store.getSnapshot();
      if (latest.conversation.channel?.id !== frame.channelId) return;
      if (frame.revision <= latest.conversation.revision) return;
      if (frame.revision !== latest.conversation.revision + 1) {
        void recover(frame.channelId);
        return;
      }
      const message = frame.message;
      if (message === undefined) return;
      const updatedChannel = {
        ...latest.conversation.channel,
        updatedAt: message.at,
        latestMessage: message,
      };
      store.upsertChannel(updatedChannel);
      const author = message.author;
      store.setConversation({
        channel: updatedChannel,
        revision: frame.revision,
        drafts:
          author.kind === 'bot'
            ? latest.conversation.drafts.filter((draft) => draft.botSlug !== author.slug)
            : latest.conversation.drafts,
        messages: [
          ...latest.conversation.messages.filter((item) => item.id !== message.id),
          message,
        ],
      });
    });
    next.addEventListener(DRAFT_EVENT, (event) => {
      if (!(event instanceof MessageEvent)) return;
      const draft = parseDraft(event.data as string);
      if (draft === undefined || draft.channelId !== activeChannelId) return;
      const latest = store.getSnapshot();
      if (latest.conversation.channel?.id !== draft.channelId) return;
      store.setConversation({
        drafts: [
          ...latest.conversation.drafts.filter((item) => item.draftId !== draft.draftId),
          draft,
        ],
      });
    });
    next.addEventListener(DRAFT_END_EVENT, (event) => {
      if (!(event instanceof MessageEvent)) return;
      const ended = parseDraftEnd(event.data as string);
      if (ended === undefined || ended.channelId !== activeChannelId) return;
      const latest = store.getSnapshot();
      if (latest.conversation.channel?.id !== ended.channelId) return;
      const drafts = latest.conversation.drafts.filter((item) => item.draftId !== ended.draftId);
      if (drafts.length !== latest.conversation.drafts.length) store.setConversation({ drafts });
    });
    next.onerror = () => {
      // A permanently rejected cursor (e.g. after log replacement) is not
      // automatically recoverable by EventSource; re-snapshot it instead.
      if (next.readyState === 2 && activeChannelId === channel.id) {
        void recover(channel.id);
      }
    };
  };

  const unsubscribe = store.subscribe(sync);
  sync();
  return () => {
    disposed = true;
    unsubscribe();
    close();
  };
}
