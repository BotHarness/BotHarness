import { inflateSync } from 'node:zlib';
import {
  MAX_PART_FIXED_COLORS,
  PART_SLOTS,
  canonicalCustomPart,
  type PartSlot,
  type PixelCustomPart,
} from './avatar-appearance.js';
import { crc32 } from './zip-archive.js';

export const MAX_PART_IMAGE_BYTES = 1024 * 1024;
export const MAX_PART_IMAGE_SCALE = 16;
export const MAX_PART_IMAGE_COLORS = 256;
const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export type PartImageError =
  | 'not-png'
  | 'unsupported'
  | 'too-large'
  | 'wrong-size'
  | 'too-many-colors'
  | 'empty';

export interface PartImage {
  width: number;
  height: number;
  scale: number;
  slots: PartSlot[];
  cells: { x: number; y: number; color: string; count: number }[];
  colors: number;
}

interface Raster {
  width: number;
  height: number;
  rgba: Uint8Array;
}

function decodePng(bytes: Buffer): Raster | PartImageError {
  if (bytes.length > MAX_PART_IMAGE_BYTES) return 'too-large';
  if (bytes.length < 8 || !bytes.subarray(0, 8).equals(SIGNATURE)) return 'not-png';
  let offset = 8;
  let header: Buffer | undefined;
  let palette: Buffer | undefined;
  let transparency: Buffer | undefined;
  const data: Buffer[] = [];
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const end = offset + 12 + length;
    if (end > bytes.length) return 'not-png';
    const body = bytes.subarray(offset + 4, offset + 8 + length);
    if (crc32(body) >>> 0 !== bytes.readUInt32BE(offset + 8 + length)) return 'not-png';
    const type = body.subarray(0, 4).toString('latin1');
    const chunk = body.subarray(4);
    if (type === 'IHDR') header = chunk;
    else if (type === 'PLTE') palette = chunk;
    else if (type === 'tRNS') transparency = chunk;
    else if (type === 'IDAT') data.push(chunk);
    else if (type === 'IEND') break;
    offset = end;
  }
  if (!header || header.length !== 13 || data.length === 0) return 'not-png';
  const width = header.readUInt32BE(0);
  const height = header.readUInt32BE(4);
  const depth = header[8]!;
  const colorType = header[9]!;
  if (header[12] !== 0) return 'unsupported';
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
  if (channels === undefined) return 'unsupported';
  if (depth !== 8 && !(colorType === 3 && (depth === 1 || depth === 2 || depth === 4)))
    return 'unsupported';
  if (colorType === 3 && !palette) return 'not-png';
  if (
    width === 0 ||
    height === 0 ||
    width > 32 * MAX_PART_IMAGE_SCALE ||
    height > 32 * MAX_PART_IMAGE_SCALE
  )
    return 'wrong-size';
  const stride = Math.ceil((width * channels * depth) / 8);
  const bpp = Math.max(1, Math.ceil((channels * depth) / 8));
  let raw: Buffer;
  try {
    raw = inflateSync(Buffer.concat(data), { maxOutputLength: (stride + 1) * height });
  } catch {
    return 'not-png';
  }
  if (raw.length !== (stride + 1) * height) return 'not-png';
  const lines = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]!;
    const source = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const line = lines.subarray(y * stride, (y + 1) * stride);
    const previous = y > 0 ? lines.subarray((y - 1) * stride, y * stride) : undefined;
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? line[i - bpp]! : 0;
      const b = previous ? previous[i]! : 0;
      const c = previous && i >= bpp ? previous[i - bpp]! : 0;
      const value = source[i]!;
      if (filter === 0) line[i] = value;
      else if (filter === 1) line[i] = value + a;
      else if (filter === 2) line[i] = value + b;
      else if (filter === 3) line[i] = value + ((a + b) >> 1);
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        line[i] = value + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
      } else return 'not-png';
    }
  }
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const line = lines.subarray(y * stride, (y + 1) * stride);
      const out = (y * width + x) * 4;
      if (colorType === 3) {
        const bit = x * depth;
        const index = (line[bit >> 3]! >> (8 - depth - (bit & 7))) & ((1 << depth) - 1);
        if (index * 3 + 2 >= palette!.length) return 'not-png';
        rgba[out] = palette![index * 3]!;
        rgba[out + 1] = palette![index * 3 + 1]!;
        rgba[out + 2] = palette![index * 3 + 2]!;
        rgba[out + 3] = transparency && index < transparency.length ? transparency[index]! : 255;
      } else {
        const px = line.subarray(x * channels, x * channels + channels);
        const gray = colorType === 0 || colorType === 4;
        rgba[out] = px[0]!;
        rgba[out + 1] = gray ? px[0]! : px[1]!;
        rgba[out + 2] = gray ? px[0]! : px[2]!;
        rgba[out + 3] = colorType === 4 ? px[1]! : colorType === 6 ? px[3]! : 255;
      }
    }
  return { width, height, rgba };
}

const hex = (r: number, g: number, b: number) =>
  `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;

export function readPartImage(bytes: Buffer): PartImage | PartImageError {
  const raster = decodePng(bytes);
  if (typeof raster === 'string') return raster;
  const { width, height, rgba } = raster;
  const scale = width / 32;
  if (!Number.isInteger(scale) || scale < 1 || scale > MAX_PART_IMAGE_SCALE) return 'wrong-size';
  const slots = (Object.keys(PART_SLOTS) as PartSlot[]).filter(
    (slot) =>
      PART_SLOTS[slot].width * scale === width && PART_SLOTS[slot].height * scale === height,
  );
  if (slots.length === 0) return 'wrong-size';
  const counts = new Map<string, number>();
  const cells: PartImage['cells'] = [];
  const half = Math.floor(scale / 2);
  for (let y = 0; y < height / scale; y++)
    for (let x = 0; x < 32; x++) {
      const at = ((y * scale + half) * width + x * scale + half) * 4;
      if (rgba[at + 3]! < 128) continue;
      const color = hex(rgba[at]!, rgba[at + 1]!, rgba[at + 2]!);
      counts.set(color, (counts.get(color) ?? 0) + 1);
      cells.push({ x, y, color, count: 0 });
    }
  if (cells.length === 0) return 'empty';
  if (counts.size > MAX_PART_IMAGE_COLORS) return 'too-many-colors';
  for (const cell of cells) cell.count = counts.get(cell.color)!;
  return { width, height, scale, slots, cells, colors: counts.size };
}

const rgb = (color: string) => [1, 3, 5].map((i) => Number.parseInt(color.slice(i, i + 2), 16));

export function quantizedPalette(image: PartImage, colors: number): string[] {
  const counts = new Map(image.cells.map((cell) => [cell.color, cell.count]));
  return [...counts.entries()]
    .sort(([a, x], [b, y]) => y - x || a.localeCompare(b))
    .slice(0, colors)
    .map(([color]) => color);
}

export function partFromImage(
  image: PartImage,
  slot: PartSlot,
  colors: number,
): PixelCustomPart | 'wrong-size' | 'too-many-colors' {
  if (!image.slots.includes(slot)) return 'wrong-size';
  if (!Number.isInteger(colors) || colors < 1 || colors > MAX_PART_FIXED_COLORS)
    return 'too-many-colors';
  const palette = quantizedPalette(image, colors).map((color) => ({ color, rgb: rgb(color) }));
  const nearest = (color: string) => {
    const [r, g, b] = rgb(color);
    let best = palette[0]!;
    let distance = Number.POSITIVE_INFINITY;
    for (const entry of palette) {
      const d = (entry.rgb[0]! - r!) ** 2 + (entry.rgb[1]! - g!) ** 2 + (entry.rgb[2]! - b!) ** 2;
      if (d < distance) {
        distance = d;
        best = entry;
      }
    }
    return best.color;
  };
  return canonicalCustomPart({
    slot,
    front: image.cells.map(({ x, y, color }) => [x, y, nearest(color) as `#${string}`, 0]),
    back: [],
  });
}
