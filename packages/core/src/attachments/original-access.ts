import { dirname } from 'node:path';
import type { ChannelAttachmentRef } from './ref.js';

export interface OriginalAttachmentInput {
  channelId?: string;
  messageId: string;
  fileId: string;
  access: 'read' | 'edit-original';
  signal?: AbortSignal;
}

export interface OriginalAttachmentTarget {
  path: string;
  source: ChannelAttachmentRef;
}

export class OriginalAttachmentAccess {
  readonly #sessions = new Map<
    string,
    Map<
      string,
      {
        path: string;
        writable: boolean;
        current(): OriginalAttachmentTarget;
      }
    >
  >();

  open(
    sessionId: string,
    input: OriginalAttachmentInput,
    current: () => OriginalAttachmentTarget,
  ): OriginalAttachmentTarget & { access: OriginalAttachmentInput['access'] } {
    input.signal?.throwIfAborted();
    const target = current();
    const entries = this.#sessions.get(sessionId) ?? new Map();
    entries.set(target.path, {
      path: target.path,
      writable: input.access === 'edit-original',
      current,
    });
    this.#sessions.set(sessionId, entries);
    return { ...target, access: input.access };
  }

  root(sessionId: string, path: string, kind: 'read' | 'write', shell = false): string | undefined {
    const entries = this.#sessions.get(sessionId);
    if (entries === undefined) return undefined;
    for (const entry of entries.values()) {
      const root = dirname(entry.path);
      if (path !== (shell ? root : entry.path)) continue;
      const current = entry.current();
      if (current.path !== entry.path) throw new Error('Original attachment path is unavailable');
      if ((kind === 'write' || shell) && !entry.writable)
        throw new Error('Original attachment requires explicit edit-original access');
      return root;
    }
    return undefined;
  }

  clear(sessionId: string): void {
    this.#sessions.delete(sessionId);
  }
}
