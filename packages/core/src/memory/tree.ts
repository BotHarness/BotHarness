import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { parseMemoryFile, type ParsedMemoryFile } from './front-matter.js';

export interface MemoryTreeFile {
  kind: 'file';
  path: string;
  summary: string;
  updatedAt: string;
}

export interface MemoryTreeFolder {
  kind: 'folder';
  path: string;
  count: number;
}

export interface MemoryTreeOverflow {
  kind: 'overflow';
  count: number;
}

export type MemoryTreeEntry = MemoryTreeFile | MemoryTreeFolder | MemoryTreeOverflow;

export const MEMORY_TREE_LIMIT = 1000;

export function listMemoryFiles(root: string): string[] {
  const files: string[] = [];
  const walk = (relativeDir: string): void => {
    let entries;
    try {
      entries = readdirSync(join(root, relativeDir), { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name === '.git') continue;
      const relativePath = relativeDir === '' ? entry.name : `${relativeDir}/${entry.name}`;
      if (entry.isDirectory()) {
        walk(relativePath);
      } else if (
        entry.isFile() &&
        entry.name.endsWith('.md') &&
        !(relativeDir === '' && (entry.name === 'MEMORY.md' || entry.name === 'PERSONA.md'))
      ) {
        files.push(relativePath);
      }
    }
  };
  walk('');
  files.sort(comparePaths);
  return files;
}

export function readMemoryDocument(
  root: string,
  relativePath: string,
): ParsedMemoryFile | undefined {
  const absolute = join(root, relativePath);
  try {
    const text = readFileSync(absolute, 'utf8');
    const stats = statSync(absolute);
    if (!stats.isFile()) return undefined;
    return parseMemoryFile(text, { mtime: stats.mtime });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

function comparePaths(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function hiddenFileCount(entry: MemoryTreeEntry): number {
  return entry.kind === 'folder' ? entry.count : 1;
}

function foldEntries(files: MemoryTreeFile[], limit: number): MemoryTreeEntry[] {
  if (files.length <= limit) return files;
  if (limit <= 0) return [];
  const rootFiles: MemoryTreeFile[] = [];
  const byDirectory = new Map<string, MemoryTreeFile[]>();
  for (const file of files) {
    const slash = file.path.indexOf('/');
    if (slash === -1) {
      rootFiles.push(file);
      continue;
    }
    const directory = file.path.slice(0, slash);
    const bucket = byDirectory.get(directory);
    if (bucket === undefined) byDirectory.set(directory, [file]);
    else bucket.push(file);
  }

  let total = files.length;
  const folded = new Set<string>();
  const bySize = [...byDirectory.entries()].sort(
    ([leftPath, left], [rightPath, right]) =>
      right.length - left.length || comparePaths(leftPath, rightPath),
  );
  for (const [directory, bucket] of bySize) {
    if (total <= limit) break;
    folded.add(directory);
    total -= bucket.length - 1;
  }

  const entries: (MemoryTreeFile | MemoryTreeFolder)[] = [...rootFiles];
  for (const directory of [...byDirectory.keys()].sort(comparePaths)) {
    const bucket = byDirectory.get(directory) ?? [];
    if (folded.has(directory)) {
      entries.push({ kind: 'folder', path: `${directory}/`, count: bucket.length });
    } else {
      entries.push(...bucket);
    }
  }
  entries.sort((left, right) => comparePaths(left.path, right.path));
  if (entries.length <= limit) return entries;
  const listed = entries.slice(0, limit - 1);
  const hidden = entries.slice(limit - 1).reduce((sum, entry) => sum + hiddenFileCount(entry), 0);
  return [...listed, { kind: 'overflow', count: hidden }];
}

export function collectTreeEntries(
  root: string,
  limit: number = MEMORY_TREE_LIMIT,
): MemoryTreeEntry[] {
  const files: MemoryTreeFile[] = [];
  for (const relativePath of listMemoryFiles(root)) {
    const parsed = readMemoryDocument(root, relativePath);
    if (parsed === undefined) continue;
    files.push({
      kind: 'file',
      path: relativePath,
      summary: parsed.document.summary,
      updatedAt: parsed.document.updatedAt,
    });
  }
  return foldEntries(files, limit);
}

export function formatMemoryTree(entries: MemoryTreeEntry[]): string {
  return entries
    .map((entry) => {
      if (entry.kind === 'folder') return `${entry.path} (${entry.count} files)`;
      if (entry.kind === 'overflow') {
        return `… and ${entry.count} more ${entry.count === 1 ? 'file' : 'files'} not shown`;
      }
      return `${entry.path} — ${entry.summary} (updated ${entry.updatedAt})`;
    })
    .join('\n');
}
