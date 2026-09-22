import { createHash, randomUUID } from 'node:crypto';
import {
  closeSync,
  createReadStream,
  lstatSync,
  openSync,
  readSync,
  readdirSync,
  unlinkSync,
} from 'node:fs';
import { link, mkdir, open, readdir, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { ATTACHMENT_HASH_PATTERN, type ChannelAttachmentRef } from './ref.js';

export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
const STAGED = /^[0-9a-f-]{36}\.part$/u;

export class ChannelAttachmentError extends Error {
  constructor(
    message: string,
    readonly code: 'invalid-ref' | 'too-large' | 'not-found' | 'corrupt',
  ) {
    super(message);
    this.name = 'ChannelAttachmentError';
  }
}

export interface AttachmentStore {
  readonly rootDir: string;
  readonly maxBytes: number;
  upload(input: {
    data: AsyncIterable<Uint8Array>;
    name?: string;
    signal?: AbortSignal;
  }): Promise<ChannelAttachmentRef>;
  has(ref: ChannelAttachmentRef): boolean;
  download(
    hash: string,
    name?: string,
    signal?: AbortSignal,
  ): Promise<{ ref: ChannelAttachmentRef; body: ReadableStream<Uint8Array> }>;
  /** Incomplete upload temps can be swept after an age grace period. */
  sweepStaged(olderThan: Date): Promise<number>;
  /** Synchronous mark-and-sweep seam. Caller supplies current durable Channel references. */
  sweepUnreferenced(olderThan: Date, readReferences: () => ReadonlySet<string>): number;
}

export function safeAttachmentName(raw?: string): string {
  const leaf = (raw ?? '').replaceAll('\\', '/').split('/').at(-1) ?? '';
  const clean = leaf
    .normalize('NFC')
    .replace(/[\u0000-\u001f\u007f/\\]/gu, '_')
    .trim()
    .slice(0, 180);
  return clean && clean !== '.' && clean !== '..' ? clean : 'attachment';
}

export function sniffAttachmentMime(b: Uint8Array): string {
  const ascii = (from: number, to: number): string => String.fromCharCode(...b.subarray(from, to));
  if (b.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => b[i] === v))
    return 'image/png';
  if (b.length >= 3 && b[0] === 255 && b[1] === 216 && b[2] === 255) return 'image/jpeg';
  if (b.length >= 6 && ['GIF87a', 'GIF89a'].includes(ascii(0, 6))) return 'image/gif';
  if (b.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  if (b.length >= 5 && ascii(0, 5) === '%PDF-') return 'application/pdf';
  if (b.length === 0) return 'application/octet-stream';
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(b);
    if (!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(text)) return 'text/plain';
  } catch {
    // Unknown bytes are never rendered inline.
  }
  return 'application/octet-stream';
}

function pathFor(root: string, hash: string): string {
  if (!ATTACHMENT_HASH_PATTERN.test(hash))
    throw new ChannelAttachmentError('Invalid attachment hash', 'invalid-ref');
  const hex = hash.slice(7);
  return join(root, 'objects', hex.slice(0, 2), hex);
}

function inspect(root: string, hash: string, name?: string): ChannelAttachmentRef {
  const path = pathFor(root, hash);
  let size: number;
  try {
    const info = lstatSync(path);
    if (!info.isFile()) throw new ChannelAttachmentError('Attachment is missing', 'not-found');
    size = info.size;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT')
      throw new ChannelAttachmentError('Attachment is missing', 'not-found');
    throw error;
  }
  const fd = openSync(path, 'r');
  const head = Buffer.alloc(Math.min(size, 512));
  let headSize = 0;
  try {
    headSize = readSync(fd, head, 0, head.length, 0);
  } finally {
    closeSync(fd);
  }
  return {
    hash,
    name: safeAttachmentName(name),
    mime: sniffAttachmentMime(head.subarray(0, headSize)),
    size,
  };
}

function streamVerified(
  root: string,
  ref: ChannelAttachmentRef,
  signal?: AbortSignal,
): ReadableStream<Uint8Array> {
  const source = createReadStream(pathFor(root, ref.hash), { highWaterMark: 64 * 1024 });
  const iterator = source[Symbol.asyncIterator]();
  const digest = createHash('sha256');
  let size = 0;
  const abort = (): void => {
    source.destroy(signal?.reason);
  };
  signal?.addEventListener('abort', abort, { once: true });
  const cleanup = (): void => signal?.removeEventListener('abort', abort);
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const next = await iterator.next();
        if (next.done) {
          cleanup();
          if (size !== ref.size || `sha256:${digest.digest('hex')}` !== ref.hash)
            controller.error(
              new ChannelAttachmentError('Attachment integrity check failed', 'corrupt'),
            );
          else controller.close();
          return;
        }
        const bytes = new Uint8Array(next.value);
        size += bytes.byteLength;
        digest.update(bytes);
        controller.enqueue(bytes);
      } catch (error) {
        cleanup();
        controller.error(error);
      }
    },
    cancel() {
      cleanup();
      source.destroy();
    },
  });
}

export function createAttachmentStore(options: {
  rootDir: string;
  maxBytes?: number;
}): AttachmentStore {
  const { rootDir } = options;
  const maxBytes = options.maxBytes ?? MAX_ATTACHMENT_BYTES;
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1)
    throw new Error('Attachment maxBytes must be a positive integer');
  return {
    rootDir,
    maxBytes,
    async upload({ data, name, signal }) {
      signal?.throwIfAborted();
      const staging = join(rootDir, 'staging');
      await mkdir(staging, { recursive: true });
      const temp = join(staging, `${randomUUID()}.part`);
      const file = await open(temp, 'wx', 0o600);
      const digest = createHash('sha256');
      const head = Buffer.alloc(512);
      let headSize = 0;
      let size = 0;
      let closed = false;
      try {
        for await (const chunk of data) {
          signal?.throwIfAborted();
          size += chunk.byteLength;
          if (size > maxBytes)
            throw new ChannelAttachmentError('Attachment exceeds upload limit', 'too-large');
          digest.update(chunk);
          const count = Math.min(head.length - headSize, chunk.byteLength);
          head.set(chunk.subarray(0, count), headSize);
          headSize += count;
          let offset = 0;
          while (offset < chunk.byteLength) {
            const result = await file.write(chunk, offset, chunk.byteLength - offset);
            if (result.bytesWritten < 1) throw new Error('Attachment write made no progress');
            offset += result.bytesWritten;
          }
        }
        signal?.throwIfAborted();
        await file.sync();
        await file.close();
        closed = true;
        const hash = `sha256:${digest.digest('hex')}`;
        const target = pathFor(rootDir, hash);
        await mkdir(join(rootDir, 'objects', hash.slice(7, 9)), { recursive: true });
        try {
          await link(temp, target);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        }
        const ref = inspect(rootDir, hash, name);
        if (ref.size !== size || ref.mime !== sniffAttachmentMime(head.subarray(0, headSize)))
          throw new ChannelAttachmentError('Attachment integrity check failed', 'corrupt');
        return ref;
      } finally {
        if (!closed) await file.close();
        await unlink(temp).catch((error: unknown) => {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        });
      }
    },
    has(ref) {
      try {
        const actual = inspect(rootDir, ref.hash, ref.name);
        return actual.name === ref.name && actual.size === ref.size && actual.mime === ref.mime;
      } catch {
        return false;
      }
    },
    async download(hash, name, signal) {
      signal?.throwIfAborted();
      const ref = inspect(rootDir, hash, name);
      return { ref, body: streamVerified(rootDir, ref, signal) };
    },
    sweepUnreferenced(olderThan, readReferences) {
      // No await may separate the durable mark snapshot from deletion: Channel append is synchronous.
      const referenced = readReferences();
      const objects = join(rootDir, 'objects');
      let shards;
      try {
        shards = readdirSync(objects, { withFileTypes: true });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 0;
        throw error;
      }
      let removed = 0;
      for (const shard of shards) {
        if (!shard.isDirectory() || !/^[0-9a-f]{2}$/u.test(shard.name)) continue;
        for (const object of readdirSync(join(objects, shard.name), { withFileTypes: true })) {
          if (
            !object.isFile() ||
            !/^[0-9a-f]{64}$/u.test(object.name) ||
            !object.name.startsWith(shard.name)
          )
            continue;
          const hash = `sha256:${object.name}`;
          if (referenced.has(hash)) continue;
          const path = join(objects, shard.name, object.name);
          const info = lstatSync(path);
          if (!info.isFile() || info.mtimeMs >= olderThan.getTime()) continue;
          unlinkSync(path);
          removed += 1;
        }
      }
      return removed;
    },
    async sweepStaged(olderThan) {
      let entries;
      try {
        entries = await readdir(join(rootDir, 'staging'), { withFileTypes: true });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 0;
        throw error;
      }
      let removed = 0;
      for (const entry of entries) {
        if (!entry.isFile() || !STAGED.test(entry.name)) continue;
        const path = join(rootDir, 'staging', entry.name);
        if ((await stat(path)).mtimeMs >= olderThan.getTime()) continue;
        await unlink(path);
        removed += 1;
      }
      return removed;
    },
  };
}
