import { deflateRawSync, inflateRawSync } from 'node:zlib';

export interface ZipEntryInput {
  path: string;
  data: Uint8Array;
  modifiedAt?: Date;
}

export interface ZipEntry {
  path: string;
  data: Buffer;
}

export type ZipArchiveErrorCode = 'invalid-zip' | 'unsafe-path' | 'too-large' | 'empty';

export class ZipArchiveError extends Error {
  constructor(
    readonly code: ZipArchiveErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ZipArchiveError';
  }
}

export interface ZipReadLimits {
  maxEntries: number;
  maxTotalBytes: number;
}

const LOCAL_HEADER = 0x04034b50;
const CENTRAL_HEADER = 0x02014b50;
const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const UTF8_FLAG = 0x0800;
const ENCRYPTED_FLAG = 0x0001;
const METHOD_STORED = 0;
const METHOD_DEFLATED = 8;
const SYMLINK_MODE = 0o120000;
const FILE_TYPE_MASK = 0o170000;
const MAX_EOCD_SCAN = 22 + 0xffff;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date: Date): { time: number; date: number } {
  const year = Math.min(Math.max(date.getFullYear(), 1980), 2107);
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

export function writeZip(entries: readonly ZipEntryInput[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.path, 'utf8');
    const raw = Buffer.from(entry.data.buffer, entry.data.byteOffset, entry.data.byteLength);
    const deflated = deflateRawSync(raw);
    const stored = deflated.length >= raw.length;
    const body = stored ? raw : deflated;
    const method = stored ? METHOD_STORED : METHOD_DEFLATED;
    const checksum = crc32(raw);
    const stamp = dosDateTime(entry.modifiedAt ?? new Date());

    const local = Buffer.alloc(30);
    local.writeUInt32LE(LOCAL_HEADER, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(UTF8_FLAG, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(stamp.time, 10);
    local.writeUInt16LE(stamp.date, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, name, body);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(CENTRAL_HEADER, 0);
    central.writeUInt16LE((3 << 8) | 20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(UTF8_FLAG, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(stamp.time, 12);
    central.writeUInt16LE(stamp.date, 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(((0o100644 << 16) >>> 0) as number, 38);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);

    offset += local.length + name.length + body.length;
  }
  const centralSize = centrals.reduce((total, part) => total + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(END_OF_CENTRAL_DIRECTORY, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, end]);
}

function invalid(message: string): ZipArchiveError {
  return new ZipArchiveError('invalid-zip', message);
}

function decodeName(bytes: Buffer, utf8: boolean): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    if (utf8) throw invalid('Entry name is not valid UTF-8');
    try {
      return new TextDecoder('gbk', { fatal: true }).decode(bytes);
    } catch {
      throw invalid('Entry name encoding is not supported');
    }
  }
}

export function safeArchivePath(name: string): string {
  const normalized = name.replaceAll('\\', '/');
  if (
    normalized.length === 0 ||
    normalized.startsWith('/') ||
    /^[A-Za-z]:/u.test(normalized) ||
    [...normalized].some((char) => char.charCodeAt(0) < 0x20 || char.charCodeAt(0) === 0x7f)
  ) {
    throw new ZipArchiveError('unsafe-path', `Unsafe entry path: ${name}`);
  }
  const trimmed = normalized.endsWith('/') ? normalized.slice(0, -1) : normalized;
  const parts = trimmed.split('/');
  if (parts.some((part) => part === '' || part === '.' || part === '..')) {
    throw new ZipArchiveError('unsafe-path', `Unsafe entry path: ${name}`);
  }
  return trimmed;
}

function findEndOfCentralDirectory(archive: Buffer): number {
  const floor = Math.max(0, archive.length - MAX_EOCD_SCAN);
  for (let index = archive.length - 22; index >= floor; index -= 1) {
    if (archive.readUInt32LE(index) === END_OF_CENTRAL_DIRECTORY) return index;
  }
  throw invalid('Not a zip archive');
}

export function readZip(archive: Buffer, limits: ZipReadLimits): ZipEntry[] {
  if (archive.length < 22) throw invalid('Not a zip archive');
  const end = findEndOfCentralDirectory(archive);
  const count = archive.readUInt16LE(end + 10);
  const centralSize = archive.readUInt32LE(end + 12);
  const centralOffset = archive.readUInt32LE(end + 16);
  if (count === 0xffff || centralOffset === 0xffffffff || centralSize === 0xffffffff) {
    throw new ZipArchiveError('too-large', 'ZIP64 archives are not supported');
  }
  if (count > limits.maxEntries) {
    throw new ZipArchiveError('too-large', 'The archive has too many entries');
  }
  if (centralOffset + centralSize > end) throw invalid('Corrupt central directory');

  const headers: Array<{
    path: string;
    directory: boolean;
    method: number;
    crc: number;
    compressedSize: number;
    size: number;
    localOffset: number;
  }> = [];
  let cursor = centralOffset;
  let declaredTotal = 0;
  for (let index = 0; index < count; index += 1) {
    if (cursor + 46 > end || archive.readUInt32LE(cursor) !== CENTRAL_HEADER) {
      throw invalid('Corrupt central directory');
    }
    const flags = archive.readUInt16LE(cursor + 8);
    const method = archive.readUInt16LE(cursor + 10);
    const crc = archive.readUInt32LE(cursor + 16);
    const compressedSize = archive.readUInt32LE(cursor + 20);
    const size = archive.readUInt32LE(cursor + 24);
    const nameLength = archive.readUInt16LE(cursor + 28);
    const extraLength = archive.readUInt16LE(cursor + 30);
    const commentLength = archive.readUInt16LE(cursor + 32);
    const mode = archive.readUInt32LE(cursor + 38) >>> 16;
    const localOffset = archive.readUInt32LE(cursor + 42);
    const nameEnd = cursor + 46 + nameLength;
    if (nameEnd > end) throw invalid('Corrupt central directory');
    const rawName = decodeName(archive.subarray(cursor + 46, nameEnd), (flags & UTF8_FLAG) !== 0);
    cursor = nameEnd + extraLength + commentLength;

    if ((flags & ENCRYPTED_FLAG) !== 0) throw invalid('Encrypted archives are not supported');
    if ((mode & FILE_TYPE_MASK) === SYMLINK_MODE) {
      throw new ZipArchiveError('unsafe-path', `Symbolic links are not allowed: ${rawName}`);
    }
    const directory = rawName.endsWith('/') || rawName.endsWith('\\');
    const path = safeArchivePath(rawName);
    if (!directory && method !== METHOD_STORED && method !== METHOD_DEFLATED) {
      throw invalid(`Unsupported compression method in ${path}`);
    }
    if (size === 0xffffffff || compressedSize === 0xffffffff) {
      throw new ZipArchiveError('too-large', 'ZIP64 archives are not supported');
    }
    declaredTotal += size;
    if (declaredTotal > limits.maxTotalBytes) {
      throw new ZipArchiveError('too-large', 'The archive is too large once unpacked');
    }
    headers.push({ path, directory, method, crc, compressedSize, size, localOffset });
  }

  const seen = new Set<string>();
  const entries: ZipEntry[] = [];
  for (const header of headers) {
    if (header.directory) continue;
    if (seen.has(header.path)) throw invalid(`Duplicate entry: ${header.path}`);
    seen.add(header.path);
    const local = header.localOffset;
    if (local + 30 > archive.length || archive.readUInt32LE(local) !== LOCAL_HEADER) {
      throw invalid(`Corrupt entry: ${header.path}`);
    }
    const start = local + 30 + archive.readUInt16LE(local + 26) + archive.readUInt16LE(local + 28);
    const stop = start + header.compressedSize;
    if (stop > archive.length) throw invalid(`Truncated entry: ${header.path}`);
    const body = archive.subarray(start, stop);
    let data: Buffer;
    if (header.method === METHOD_STORED) {
      data = Buffer.from(body);
    } else {
      try {
        data = inflateRawSync(body, { maxOutputLength: Math.max(header.size, 1) });
      } catch {
        throw invalid(`Corrupt entry: ${header.path}`);
      }
    }
    if (data.length !== header.size || crc32(data) !== header.crc) {
      throw invalid(`Corrupt entry: ${header.path}`);
    }
    entries.push({ path: header.path, data });
  }
  return entries;
}
