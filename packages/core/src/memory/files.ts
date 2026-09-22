import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { parseMemoryFile, type ParsedMemoryFile } from './front-matter.js';

function comparePaths(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

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
