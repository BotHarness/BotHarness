import { deflateSync } from 'node:zlib';
import {
  DEFAULT_ILLUSTRATED_RECIPE,
  PART_SLOTS,
  canonicalCustomPart,
  customPartId,
  isPixelCustomPart,
  partToneColor,
  type PixelCustomPart,
} from './avatar-appearance.js';
import { MAX_PART_NAME } from './part-library.js';
import { crc32, readZip, writeZip, ZipArchiveError } from './zip-archive.js';

export const PART_FILE_KEYWORD = 'botharness-part';
export const MAX_PART_FILE_BYTES = 256 * 1024;
export const MAX_PART_LIBRARY_FILE_BYTES = 8 * 1024 * 1024;
export const MAX_PART_LIBRARY_FILES = 500;
const SCALE = 8;
const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export interface PartFile {
  part: PixelCustomPart;
  name: string;
  author?: string;
}

export type PartFileError = 'not-png' | 'no-part-data' | 'invalid-part' | 'too-large';

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([length, body, crc]);
}

function preview(part: PixelCustomPart): Buffer {
  const { width, height } = PART_SLOTS[part.slot];
  const w = width * SCALE;
  const h = height * SCALE;
  const pixels = Buffer.alloc((w * 4 + 1) * h);
  const paint = (cells: PixelCustomPart['front']) => {
    for (const [x, y, color, tone] of cells) {
      const base = color.startsWith('#') ? color : DEFAULT_ILLUSTRATED_RECIPE[color as 'hairColor'];
      const hex = partToneColor(base, tone);
      const rgb = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
      for (let dy = 0; dy < SCALE; dy++)
        for (let dx = 0; dx < SCALE; dx++) {
          const offset = (y * SCALE + dy) * (w * 4 + 1) + 1 + (x * SCALE + dx) * 4;
          pixels[offset] = rgb[0]!;
          pixels[offset + 1] = rgb[1]!;
          pixels[offset + 2] = rgb[2]!;
          pixels[offset + 3] = 255;
        }
    }
  };
  paint(part.back);
  paint(part.front);
  const header = Buffer.alloc(13);
  header.writeUInt32BE(w, 0);
  header.writeUInt32BE(h, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([chunk('IHDR', header), chunk('IDAT', deflateSync(pixels))]);
}

export function encodePartFile(file: PartFile): Buffer {
  const part = canonicalCustomPart(file.part);
  const data = JSON.stringify({
    format: 1,
    part,
    name: file.name,
    ...(file.author ? { author: file.author } : {}),
  });
  return Buffer.concat([
    SIGNATURE,
    preview(part),
    chunk(
      'tEXt',
      Buffer.concat([Buffer.from(`${PART_FILE_KEYWORD}\0`, 'latin1'), Buffer.from(data, 'utf8')]),
    ),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

export function decodePartFile(bytes: Buffer): PartFile | PartFileError {
  if (bytes.length > MAX_PART_FILE_BYTES) return 'too-large';
  if (bytes.length < 8 || !bytes.subarray(0, 8).equals(SIGNATURE)) return 'not-png';
  let offset = 8;
  let text: string | undefined;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const end = offset + 12 + length;
    if (end > bytes.length) return 'not-png';
    const body = bytes.subarray(offset + 4, offset + 8 + length);
    if (crc32(body) >>> 0 !== bytes.readUInt32BE(offset + 8 + length)) return 'not-png';
    const type = body.subarray(0, 4).toString('latin1');
    if (type === 'tEXt') {
      const data = body.subarray(4);
      const zero = data.indexOf(0);
      if (zero > 0 && data.subarray(0, zero).toString('latin1') === PART_FILE_KEYWORD)
        text = data.subarray(zero + 1).toString('utf8');
    }
    if (type === 'IEND') break;
    offset = end;
  }
  if (text === undefined) return 'no-part-data';
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return 'invalid-part';
  }
  if (typeof parsed !== 'object' || parsed === null) return 'invalid-part';
  const record = parsed as Record<string, unknown>;
  const name = record['name'];
  const author = record['author'];
  if (
    record['format'] !== 1 ||
    !isPixelCustomPart(record['part']) ||
    typeof name !== 'string' ||
    name.length > MAX_PART_NAME ||
    (author !== undefined && (typeof author !== 'string' || author.length > MAX_PART_NAME))
  )
    return 'invalid-part';
  return {
    part: canonicalCustomPart(record['part']),
    name,
    ...(typeof author === 'string' && author ? { author } : {}),
  };
}

export function partFileName(file: PartFile): string {
  const stem = Array.from(
    file.name
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/gu, ''),
  )
    .slice(0, 40)
    .join('');
  return `${stem || 'part'}-${customPartId(file.part).slice(0, 8)}.png`;
}

export function encodePartLibrary(files: readonly PartFile[]): Buffer {
  return writeZip(files.map((file) => ({ path: partFileName(file), data: encodePartFile(file) })));
}

export function decodePartFiles(
  bytes: Buffer,
): { files: PartFile[]; refused: { name: string; reason: PartFileError }[] } | PartFileError {
  if (bytes.length > MAX_PART_LIBRARY_FILE_BYTES) return 'too-large';
  if (bytes.subarray(0, 8).equals(SIGNATURE)) {
    const file = decodePartFile(bytes);
    return typeof file === 'string' ? file : { files: [file], refused: [] };
  }
  let entries;
  try {
    entries = readZip(bytes, {
      maxEntries: MAX_PART_LIBRARY_FILES,
      maxTotalBytes: MAX_PART_LIBRARY_FILE_BYTES * 4,
    });
  } catch (error) {
    if (error instanceof ZipArchiveError)
      return error.code === 'too-large' ? 'too-large' : 'not-png';
    throw error;
  }
  const files: PartFile[] = [];
  const refused: { name: string; reason: PartFileError }[] = [];
  for (const entry of entries) {
    if (!entry.path.toLowerCase().endsWith('.png')) continue;
    const file = decodePartFile(entry.data);
    if (typeof file === 'string') refused.push({ name: entry.path, reason: file });
    else files.push(file);
  }
  return { files, refused };
}
