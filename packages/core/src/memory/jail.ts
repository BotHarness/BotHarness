import { existsSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, join, relative } from 'node:path';

export class MemoryPathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MemoryPathError';
  }
}

export function toMemoryRelativePath(input: string): string {
  if (typeof input !== 'string' || input.trim().length === 0) {
    throw new MemoryPathError('memory path must be a non-empty string');
  }
  if (input.includes('\0')) {
    throw new MemoryPathError('memory path must not contain NUL bytes');
  }
  const slashed = input.replaceAll('\\', '/');
  if (slashed.startsWith('/') || /^[A-Za-z]:\//.test(slashed)) {
    throw new MemoryPathError(`memory path must be relative: ${input}`);
  }
  const segments: string[] = [];
  for (const segment of slashed.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      throw new MemoryPathError(`memory path escapes the memory directory: ${input}`);
    }
    if (segment.toLowerCase().startsWith('.git')) {
      throw new MemoryPathError(`memory path is reserved: ${input}`);
    }
    segments.push(segment);
  }
  if (segments.length === 0) {
    throw new MemoryPathError(`memory path must name a file: ${input}`);
  }
  return segments.join('/');
}

export function toMemoryWritePath(input: string): string {
  const relativePath = toMemoryRelativePath(input);
  const segments = relativePath.split('/');
  const file = segments[segments.length - 1] ?? '';
  if (!file.toLowerCase().endsWith('.md')) {
    throw new MemoryPathError(`memory write path must end with .md: ${input}`);
  }
  for (const segment of segments.slice(0, -1)) {
    if (segment.startsWith('.')) {
      throw new MemoryPathError(`memory write path must not contain dot-directories: ${input}`);
    }
  }
  return relativePath;
}

export function resolveMemoryPath(root: string, input: string): string {
  const relativePath = toMemoryRelativePath(input);
  const realRoot = realpathSync(root);
  const target = join(realRoot, relativePath);
  let probe = target;
  while (!existsSync(probe)) {
    const parent = dirname(probe);
    if (parent === probe) break;
    probe = parent;
  }
  const realProbe = realpathSync(probe);
  const fromRoot = relative(realRoot, realProbe);
  if (fromRoot.startsWith('..') || isAbsolute(fromRoot)) {
    throw new MemoryPathError(`memory path escapes the memory directory through a link: ${input}`);
  }
  return target;
}
