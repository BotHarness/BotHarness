import type { Context } from '@deepseek-ai/cordis';
import { RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';

import type { PersonaBotPatch } from '../bots/persona-bot.js';
import type {
  BridgeError,
  BridgeMethods,
  BridgeResult,
  PersonaBotDetail,
  PersonaBotSummary,
} from './methods.js';
import type { ChannelMessage, ChannelRecord } from '../channels/channel.js';
import type { RosterSection, RosterSnapshot } from '../roster/store.js';
import type { TopOrderEntry } from '../roster/spec.js';
import type { SessionSummary } from '../sessions/source.js';

export const BRIDGE_NAMESPACE = 'botharness';
export const BRIDGE_SERVICE_KEY = 'botharnessBridge';

declare module '@deepseek-ai/dsh-typert-protocol/types' {
  interface RemoteErrorDetailsMap {
    'invalid-input': Record<string, never>;
    'invalid-slug': Record<string, never>;
    duplicate: Record<string, never>;
    'not-found': Record<string, never>;
    'storage-unavailable': Record<string, never>;
  }
}

/**
 * The Typert descriptor key, owned by `@deepseek-ai/dsh-typert-protocol`
 * (`REMOTE_METHOD_DESCRIPTOR`). The standard decorator syntax cannot survive
 * this repo's rolldown/oxc pipeline — Vite and tsdown both pass `@Remote`
 * through untouched — so the same descriptor is written directly instead.
 * Keep `markRemoteMethods` in sync with the methods below.
 */
const REMOTE_METHOD_DESCRIPTOR = '@deepseek-ai/dsh-typert-protocol/remote-methods';

interface RemoteMethodDescriptor {
  readonly version: 1;
  readonly methods: readonly {
    readonly method: string;
    readonly invocation: { readonly kind: 'direct' };
  }[];
}

function markRemoteMethods(prototype: object, methods: readonly string[]): void {
  const descriptor: RemoteMethodDescriptor = {
    version: 1,
    methods: methods.map((method) =>
      Object.freeze({ method, invocation: Object.freeze({ kind: 'direct' }) }),
    ),
  };
  Object.defineProperty(prototype, REMOTE_METHOD_DESCRIPTOR, {
    configurable: true,
    value: Object.freeze(descriptor),
  });
}

function toRemoteError(error: BridgeError): RemoteError {
  return new RemoteError(error.code as RemoteError['code'], error.message, {});
}

function unwrap<T>(result: BridgeResult<T>): T {
  if (result.ok) return result.value;
  throw toRemoteError(result.error);
}

async function unwrapAsync<T>(result: Promise<BridgeResult<T>>): Promise<T> {
  return unwrap(await result);
}

/**
 * Host half of the client bridge.
 *
 * The service is registered through the Cordis `Service` machinery with a
 * visible `typertRemote` binding (namespace `botharness`), so
 * `@deepseek-ai/dsh-api-gateway` claims the `botharness/<method>` endpoints
 * from the Typert registry and dispatches them through `/api`. Failures ride
 * `RemoteError` so the gateway encodes `{ code, message, details }` onto the
 * wire, matching the pre-migration `BridgeResult` error branch.
 */
export class BotharnessBridgeService extends TypertRemoteService {
  private readonly methods: BridgeMethods;

  constructor(ctx: Context, methods: BridgeMethods) {
    super(ctx, BRIDGE_SERVICE_KEY, { namespace: BRIDGE_NAMESPACE });
    this.methods = methods;
  }

  list(query?: string): { bots: PersonaBotSummary[] } {
    return unwrap(this.methods.list({ query }));
  }

  get(slug: string): { bot: PersonaBotDetail } {
    return unwrap(this.methods.get({ slug }));
  }

  create(
    slug: string,
    displayName: string,
    persona?: string,
    tag?: string,
    description?: string,
    model?: string,
    preset?: string,
    workspaces?: string[],
    avatarSeed?: string,
  ): { bot: PersonaBotDetail } {
    return unwrap(
      this.methods.create({
        slug,
        displayName,
        persona,
        tag,
        description,
        model,
        preset,
        workspaces,
        avatarSeed,
      }),
    );
  }

  update(slug: string, patch: PersonaBotPatch): { bot: PersonaBotDetail } {
    return unwrap(this.methods.update({ slug, patch }));
  }

  pause(slug: string): { bot: PersonaBotDetail } {
    return unwrap(this.methods.pause({ slug }));
  }

  resume(slug: string): { bot: PersonaBotDetail } {
    return unwrap(this.methods.resume({ slug }));
  }

  channels(): { channels: ChannelRecord[] } {
    return unwrap(this.methods.channels({}));
  }

  channelDm(slug: string, displayName?: string): { channel: ChannelRecord } {
    return unwrap(this.methods.channelDm({ slug, displayName }));
  }

  channelCreate(name: string, members: string[]): { channel: ChannelRecord } {
    return unwrap(this.methods.channelCreate({ name, members }));
  }

  channelMessages(
    channelId: string,
    before?: string,
    limit?: number,
  ): { messages: ChannelMessage[] } {
    return unwrap(this.methods.channelMessages({ channelId, before, limit }));
  }

  async channelSend(channelId: string, body: string): Promise<{ message: ChannelMessage }> {
    return unwrap(await this.methods.channelSend({ channelId, body }));
  }

  sessions(slug: string): { sessions: SessionSummary[] } {
    return unwrap(this.methods.sessions({ slug }));
  }

  rosterGet(): RosterSnapshot {
    return unwrap(this.methods.rosterGet({}));
  }

  sectionCreate(name: string): Promise<{ section: RosterSection }> {
    return unwrapAsync(this.methods.sectionCreate({ name }));
  }

  sectionRename(sectionId: string, name: string): Promise<{ section: RosterSection }> {
    return unwrapAsync(this.methods.sectionRename({ sectionId, name }));
  }

  sectionRemove(sectionId: string): Promise<{ removed: boolean }> {
    return unwrapAsync(this.methods.sectionRemove({ sectionId }));
  }

  channelAssign(
    channelId: string,
    sectionId?: string | null,
    index?: number,
  ): Promise<Record<string, never>> {
    return unwrapAsync(this.methods.channelAssign({ channelId, sectionId, index }));
  }

  sectionReorder(order: string[]): Promise<{ sectionOrder: string[] }> {
    return unwrapAsync(this.methods.sectionReorder({ order }));
  }

  topReorder(order: TopOrderEntry[]): Promise<{ topOrder: TopOrderEntry[] }> {
    return unwrapAsync(this.methods.topReorder({ order }));
  }

  pinsSet(pins: string[]): Promise<{ pins: string[] }> {
    return unwrapAsync(this.methods.pinsSet({ pins }));
  }
}

markRemoteMethods(BotharnessBridgeService.prototype, [
  'list',
  'get',
  'create',
  'update',
  'pause',
  'resume',
  'channels',
  'channelDm',
  'channelCreate',
  'channelMessages',
  'channelSend',
  'sessions',
  'rosterGet',
  'sectionCreate',
  'sectionRename',
  'sectionRemove',
  'channelAssign',
  'sectionReorder',
  'topReorder',
  'pinsSet',
]);

/**
 * Register the bridge Service for the Typert Gateway.
 *
 * No `connection` dependency: claims are discovered from the Typert registry,
 * so profiles without a web connection keep loading the plugin (ADR-0022).
 */
export function registerBridge(ctx: Context, methods: BridgeMethods): BotharnessBridgeService {
  return new BotharnessBridgeService(ctx, methods);
}
