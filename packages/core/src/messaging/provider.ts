export interface MessagingAccount {
  ref: string;
  platform: string;
  name: string;
  fingerprint: string;
  connected: boolean;
}

export interface MessagingTarget {
  ref: string;
  name: string;
  digest: string;
  receiveScope?: { kind: 'group'; conversationId: string };
}

export interface MessagingAttachment {
  id: string;
  messageId: string;
  resourceKey: string;
  name: string;
}

export interface MessagingInboundEvent {
  version: 1;
  channel: 'feishu';
  botId: string;
  fingerprint: string;
  eventId: string;
  messageId: string;
  actor: { kind: 'user'; id: string; name?: string };
  conversation: { kind: 'group' | 'dm'; id: string };
  mentions: { id: string; key: string; name?: string }[];
  mentionedAccount: boolean;
  at: string;
  text: string;
  attachments?: MessagingAttachment[];
  reply: MessagingReplyRoute;
  replay: { kind: 'provider-redelivery'; resumeCursor: false; gapPossible: true };
}

export interface MessagingReplyRoute {
  messageId: string;
  conversationId: string;
  actorId: string;
  threadId?: string;
  rootId?: string;
  parentId?: string;
}

export type MessagingHistoryScope = 'group' | 'nearby' | 'thread';
export interface MessagingHistoryQuery {
  scope: MessagingHistoryScope;
  limit: number;
  cursor?: string;
}
export interface MessagingHistoryPage {
  version: 1;
  scope: MessagingHistoryScope;
  events: MessagingInboundEvent[];
  omitted: number;
  hasMore: boolean;
  nextCursor?: string;
  window?: { start: number; end: number };
  coverage: 'provider-visible-human-text';
}

export interface MessagingReceipt {
  version: 1;
  messageId: string;
  conversationId: string;
}

export interface MessagingOwnEcho {
  version: 1;
  botId: string;
  fingerprint: string;
  eventId: string;
  messageId: string;
  conversationId: string;
  text: string;
  at: string;
}

export interface MessagingProvider {
  id: string;
  accounts(): Promise<MessagingAccount[]>;
  targets(accountRef: string): Promise<MessagingTarget[]>;
  inspectAccount?(accountRef: string): Promise<MessagingAccount>;
  inspect(
    accountRef: string,
    targetRef: string,
  ): Promise<{
    account: MessagingAccount;
    target: MessagingTarget;
  }>;
  consume?(input: {
    accountRef: string;
    fingerprint: string;
    signal: AbortSignal;
    onEvent(event: MessagingInboundEvent, signal: AbortSignal): Promise<{ accepted: true }>;
    onEcho?(event: MessagingOwnEcho, signal: AbortSignal): Promise<{ accepted: true }>;
  }): Promise<() => void>;
  reply?(input: {
    accountRef: string;
    fingerprint: string;
    route: MessagingReplyRoute;
    text: string;
    signal: AbortSignal;
  }): Promise<{ accepted: true }>;
  history?(input: {
    accountRef: string;
    fingerprint: string;
    route: MessagingReplyRoute;
    query: MessagingHistoryQuery;
    signal: AbortSignal;
  }): Promise<MessagingHistoryPage>;
  readFile?(input: {
    accountRef: string;
    fingerprint: string;
    route: MessagingReplyRoute;
    attachment: MessagingAttachment;
    signal: AbortSignal;
  }): Promise<AsyncIterable<Uint8Array>>;
  replyFile?(input: {
    accountRef: string;
    fingerprint: string;
    route: MessagingReplyRoute;
    file: { id: string; name: string; bytes: Uint8Array };
    signal: AbortSignal;
  }): Promise<{ accepted: true }>;
  post?(input: {
    accountRef: string;
    targetRef: string;
    fingerprint: string;
    targetDigest: string;
    conversationId: string;
    text: string;
    signal: AbortSignal;
  }): Promise<{ accepted: true; receipt: MessagingReceipt }>;
  send(input: {
    accountRef: string;
    targetRef: string;
    fingerprint: string;
    targetDigest: string;
    text: string;
    signal: AbortSignal;
  }): Promise<{ accepted: true }>;
}

export class MessagingError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'MessagingError';
  }
}

export class MessagingProviderError extends Error {
  constructor(
    readonly code: string,
    readonly disposition: 'not-started' | 'unknown',
  ) {
    super(code);
    this.name = 'MessagingProviderError';
  }
}
