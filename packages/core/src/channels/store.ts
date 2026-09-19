import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import type { Dirent } from 'node:fs';
import { join } from 'node:path';

import { isValidSlug } from '../bots/slug.js';
import { atomicWriteFile } from '../fs/atomic-write.js';
import {
  dmChannelId,
  groupChannelIdBase,
  isChannelMessage,
  isChannelRecord,
  isValidChannelId,
  type ChannelMessage,
  type ChannelRecord,
} from './channel.js';

export const DEFAULT_MESSAGE_PAGE = 50;
export const MAX_MESSAGE_PAGE = 200;

export interface ChannelStoreOptions {
  rootDir: string;
  now?: () => Date;
}

export interface ChannelReadOptions {
  before?: string;
  limit?: number;
}

export interface CreateChannelGroupInput {
  name: string;
  members: string[];
}

export interface ChannelStore {
  rootDir: string;
  list(): ChannelRecord[];
  get(id: string): ChannelRecord | undefined;
  getOrCreateDm(botSlug: string, botName: string): ChannelRecord | undefined;
  createGroup(input: CreateChannelGroupInput): ChannelRecord;
  appendMessage(id: string, message: ChannelMessage): Promise<ChannelMessage | undefined>;
  readMessages(id: string, options?: ChannelReadOptions): ChannelMessage[];
}

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === 'ENOENT';
}

export function createChannelStore(options: ChannelStoreOptions): ChannelStore {
  const rootDir = options.rootDir;
  const now = options.now ?? (() => new Date());
  const channelDir = (id: string): string => join(rootDir, id);
  const recordFile = (id: string): string => join(channelDir(id), 'channel.json');
  const messagesFile = (id: string): string => join(channelDir(id), 'messages.ndjson');

  const read = (id: string): ChannelRecord | undefined => {
    if (!isValidChannelId(id)) return undefined;
    let text: string;
    try {
      text = readFileSync(recordFile(id), 'utf8');
    } catch (error) {
      if (isMissing(error)) return undefined;
      throw error;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return undefined;
    }
    return isChannelRecord(parsed, id) ? parsed : undefined;
  };

  const write = (record: ChannelRecord): void => {
    mkdirSync(channelDir(record.id), { recursive: true });
    atomicWriteFile(recordFile(record.id), `${JSON.stringify(record, null, 2)}\n`);
  };

  const queueTails = new Map<string, Promise<unknown>>();
  const enqueue = <T>(id: string, task: () => T): Promise<T> => {
    const previous = queueTails.get(id) ?? Promise.resolve();
    const run = previous.then(task, task);
    queueTails.set(
      id,
      run.then(
        () => undefined,
        () => undefined,
      ),
    );
    return run;
  };

  const nextGroupId = (name: string): string => {
    const base = groupChannelIdBase(name);
    let candidate = base;
    let suffix = 2;
    while (existsSync(channelDir(candidate))) {
      candidate = `${base}-${suffix}`;
      suffix += 1;
    }
    return candidate;
  };

  return {
    rootDir,
    get: read,
    list() {
      let entries: Dirent[];
      try {
        entries = readdirSync(rootDir, { withFileTypes: true });
      } catch (error) {
        if (isMissing(error)) return [];
        throw error;
      }
      return entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => read(entry.name))
        .filter((record): record is ChannelRecord => record !== undefined)
        .sort(
          (left, right) =>
            right.updatedAt.localeCompare(left.updatedAt) || left.id.localeCompare(right.id),
        );
    },
    getOrCreateDm(botSlug, botName) {
      if (!isValidSlug(botSlug)) return undefined;
      const id = dmChannelId(botSlug);
      const existing = read(id);
      if (existing !== undefined) return existing;
      const name = botName.trim();
      const timestamp = now().toISOString();
      const record: ChannelRecord = {
        id,
        type: 'dm',
        name: name.length > 0 ? name : botSlug,
        members: [botSlug],
        botSlug,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      write(record);
      return record;
    },
    createGroup(input) {
      const id = nextGroupId(input.name);
      const name = input.name.trim();
      const timestamp = now().toISOString();
      const record: ChannelRecord = {
        id,
        type: 'group',
        name: name.length > 0 ? name : id,
        members: [...input.members],
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      write(record);
      return record;
    },
    appendMessage(id, message) {
      return enqueue(id, () => {
        const record = read(id);
        if (record === undefined) return undefined;
        mkdirSync(channelDir(id), { recursive: true });
        appendFileSync(messagesFile(id), `${JSON.stringify(message)}\n`, 'utf8');
        write({ ...record, updatedAt: now().toISOString() });
        return message;
      });
    },
    readMessages(id, readOptions) {
      if (!isValidChannelId(id)) return [];
      let text: string;
      try {
        text = readFileSync(messagesFile(id), 'utf8');
      } catch (error) {
        if (isMissing(error)) return [];
        throw error;
      }
      const messages: ChannelMessage[] = [];
      for (const line of text.split('\n')) {
        if (line.trim().length === 0) continue;
        let parsed: unknown;
        try {
          parsed = JSON.parse(line);
        } catch {
          continue;
        }
        if (isChannelMessage(parsed)) messages.push(parsed);
      }
      const requested = readOptions?.limit ?? DEFAULT_MESSAGE_PAGE;
      const limit = Math.max(1, Math.min(requested, MAX_MESSAGE_PAGE));
      let end = messages.length;
      const before = readOptions?.before;
      if (before !== undefined) {
        const index = messages.findIndex((message) => message.id === before);
        if (index === -1) return [];
        end = index;
      }
      return messages.slice(Math.max(0, end - limit), end).reverse();
    },
  };
}
