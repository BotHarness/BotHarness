import {
  constants,
  createReadStream,
  closeSync,
  fstatSync,
  openSync,
  realpathSync,
  statSync,
} from 'node:fs';
import { basename, relative } from 'node:path';
import { Readable } from 'node:stream';
import type { PersonaBotRegistry } from '../bots/registry.js';
import { MemoryPathError, resolveMemoryPath, toMemoryRelativePath } from './jail.js';

export interface MemoryFileTarget {
  path: string;
  relativePath: string;
  kind: 'file' | 'directory';
}

export class MemoryFileError extends Error {
  constructor(
    readonly code: 'unknown-bot' | 'not-found' | 'not-file',
    message: string,
  ) {
    super(message);
    this.name = 'MemoryFileError';
  }
}

export function createMemoryFiles(registry: PersonaBotRegistry) {
  const target = (slug: string, input: string): MemoryFileTarget => {
    const root = registry.get(slug) === undefined ? undefined : registry.memoryDirFor(slug);
    if (root === undefined) throw new MemoryFileError('unknown-bot', 'Unknown PersonaBot');
    try {
      const realRoot = realpathSync(root);
      const path = input === '' ? realRoot : realpathSync(resolveMemoryPath(realRoot, input));
      const relativePath = relative(realRoot, path).replaceAll('\\', '/');
      if (relativePath !== '') toMemoryRelativePath(relativePath);
      const info = statSync(path);
      if (!info.isFile() && !info.isDirectory())
        throw new MemoryFileError('not-file', 'Not a regular file or directory');
      return { path, relativePath, kind: info.isDirectory() ? 'directory' : 'file' };
    } catch (error) {
      if (error instanceof MemoryPathError || error instanceof MemoryFileError) throw error;
      if (['ENOENT', 'ENOTDIR', 'ELOOP'].includes((error as NodeJS.ErrnoException).code ?? '')) {
        throw new MemoryFileError('not-found', 'Memory file or directory is missing');
      }
      throw error;
    }
  };
  const download = (
    slug: string,
    input: string,
    signal?: AbortSignal,
  ): {
    name: string;
    size: number;
    body: ReadableStream<Uint8Array>;
  } => {
    signal?.throwIfAborted();
    const checked = target(slug, input);
    if (checked.kind !== 'file')
      throw new MemoryFileError('not-file', 'Only files can be downloaded');
    let fd: number;
    try {
      fd = openSync(checked.path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    } catch {
      throw new MemoryFileError('not-found', 'Memory file is no longer available');
    }
    try {
      const current = target(slug, input);
      const info = fstatSync(fd);
      const latest = statSync(current.path);
      if (
        current.path !== checked.path ||
        !info.isFile() ||
        info.dev !== latest.dev ||
        info.ino !== latest.ino
      ) {
        throw new MemoryFileError('not-found', 'Memory file changed while opening; retry');
      }
      const source = createReadStream(checked.path, {
        fd,
        autoClose: true,
        ...(signal === undefined ? {} : { signal }),
      });
      return {
        name: basename(checked.path),
        size: info.size,
        body: Readable.toWeb(source) as ReadableStream<Uint8Array>,
      };
    } catch (error) {
      closeSync(fd);
      throw error;
    }
  };
  return { fileTarget: target, downloadFile: download };
}
