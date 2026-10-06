import { execFileSync } from 'node:child_process';
import { lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import {
  BOT_DESCRIPTOR_PATH,
  parseBotDescriptor,
  type BotDescriptor,
} from '../marketplace/descriptor.js';
import {
  readZip,
  writeZip,
  ZipArchiveError,
  type ZipEntry,
  type ZipEntryInput,
} from './zip-archive.js';

export const BOT_ZIP_MAX_BYTES = 100 * 1024 * 1024;
export const BOT_ZIP_MAX_ENTRIES = 20_000;

const IGNORED_NAMES = new Set(['.DS_Store', 'Thumbs.db', 'desktop.ini']);

function excludedPath(path: string): boolean {
  const parts = path.split('/');
  return (
    parts[0] === '__MACOSX' ||
    parts.some((part) => part === '.git') ||
    IGNORED_NAMES.has(parts.at(-1) ?? '')
  );
}

export function listBotFiles(memoryDir: string): string[] {
  const output = execFileSync(
    'git',
    ['-c', 'core.quotePath=false', 'ls-files', '-z', '--cached', '--others', '--exclude-standard'],
    { cwd: memoryDir, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, windowsHide: true },
  );
  const files = new Set<string>();
  for (const path of output.split('\0')) {
    if (path.length === 0 || excludedPath(path)) continue;
    try {
      if (lstatSync(join(memoryDir, path)).isFile()) files.add(path);
    } catch {}
  }
  return [...files].sort();
}

export interface BotFileListing {
  files: Array<{ path: string; size: number }>;
  always: string[];
}

export function alwaysIncludedFiles(memoryDir: string, files: readonly string[]): string[] {
  if (!files.includes(BOT_DESCRIPTOR_PATH)) return [];
  const always = [BOT_DESCRIPTOR_PATH];
  try {
    const avatar = parseBotDescriptor(
      readFileSync(join(memoryDir, BOT_DESCRIPTOR_PATH), 'utf8'),
    )?.avatar;
    if (avatar !== undefined && 'image' in avatar && files.includes(avatar.image)) {
      always.push(avatar.image);
    }
  } catch {}
  return always;
}

export function listBotZipFiles(memoryDir: string): BotFileListing {
  const paths = listBotFiles(memoryDir);
  const files: BotFileListing['files'] = [];
  for (const path of paths) {
    try {
      files.push({ path, size: lstatSync(join(memoryDir, path)).size });
    } catch {}
  }
  return { files, always: alwaysIncludedFiles(memoryDir, paths) };
}

export function exportBotZip(memoryDir: string, include?: ReadonlySet<string>): Buffer {
  const entries: ZipEntryInput[] = [];
  let total = 0;
  const listed = listBotFiles(memoryDir);
  const always = new Set(alwaysIncludedFiles(memoryDir, listed));
  const files =
    include === undefined ? listed : listed.filter((path) => include.has(path) || always.has(path));
  if (files.length > BOT_ZIP_MAX_ENTRIES) {
    throw new ZipArchiveError('too-large', 'This Bot has too many files to export');
  }
  for (const path of files) {
    const target = join(memoryDir, path);
    const stat = lstatSync(target);
    total += stat.size;
    if (total > BOT_ZIP_MAX_BYTES) {
      throw new ZipArchiveError('too-large', 'This Bot is too large to export');
    }
    entries.push({ path, data: readFileSync(target), modifiedAt: stat.mtime });
  }
  return writeZip(entries);
}

export interface BotZipContents {
  files: ZipEntry[];
  descriptor?: BotDescriptor;
}

function stripSharedRoot(files: ZipEntry[]): ZipEntry[] {
  if (files.some((file) => !file.path.includes('/'))) return files;
  const root = files[0]!.path.split('/')[0]!;
  if (!files.every((file) => file.path.startsWith(`${root}/`))) return files;
  return files.map((file) => ({ path: file.path.slice(root.length + 1), data: file.data }));
}

export function readBotZip(archive: Buffer): BotZipContents {
  if (archive.length > BOT_ZIP_MAX_BYTES) {
    throw new ZipArchiveError('too-large', 'The zip file is too large');
  }
  const entries = readZip(archive, {
    maxEntries: BOT_ZIP_MAX_ENTRIES,
    maxTotalBytes: BOT_ZIP_MAX_BYTES,
  }).filter((entry) => !excludedPath(entry.path));
  if (entries.length === 0) throw new ZipArchiveError('empty', 'The zip file has no files');
  const files = stripSharedRoot(entries);
  const descriptorFile = files.find((file) => file.path === BOT_DESCRIPTOR_PATH);
  const descriptor =
    descriptorFile === undefined
      ? undefined
      : parseBotDescriptor(descriptorFile.data.toString('utf8'));
  return { files, ...(descriptor === undefined ? {} : { descriptor }) };
}

export function writeBotFiles(root: string, files: readonly ZipEntry[]): void {
  for (const file of files) {
    const target = join(root, file.path);
    try {
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, file.data, { flag: 'wx' });
    } catch {
      throw new ZipArchiveError('invalid-zip', `Cannot unpack ${file.path}`);
    }
  }
}
