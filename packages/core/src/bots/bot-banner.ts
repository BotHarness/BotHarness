import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';

import {
  isPixelBannerRecipe,
  pixelBannerImage,
  seededBannerRecipe,
  type PixelBannerRecipe,
} from '@botharness/pixel-banner';

export { BANNER_SCENES, type PixelBannerScene } from '@botharness/pixel-banner';

export type BotBanner = { recipe: PixelBannerRecipe } | { image: string };

export const BOT_BANNER_FILE = '.botharness/banner.png';
export const MAX_BOT_BANNER_BYTES = 2_000_000;
const MAX_BOT_BANNER_WIDTH = 3_000;
const PNG_PREFIX = 'data:image/png;base64,';
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function isBotBannerImage(value: unknown): value is string {
  if (typeof value !== 'string' || !value.startsWith(PNG_PREFIX)) return false;
  const encoded = value.slice(PNG_PREFIX.length);
  if (encoded.length > Math.ceil(MAX_BOT_BANNER_BYTES / 3) * 4) return false;
  if (!/^[A-Za-z0-9+/]+={0,2}$/u.test(encoded)) return false;
  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.length < 24 || bytes.length > MAX_BOT_BANNER_BYTES) return false;
  if (!bytes.subarray(0, 8).equals(PNG_MAGIC) || bytes.toString('ascii', 12, 16) !== 'IHDR') {
    return false;
  }
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  return width > 0 && width <= MAX_BOT_BANNER_WIDTH && width === height * 3;
}

export function isBotBanner(value: unknown): value is BotBanner {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  if (keys.length !== 1) return false;
  const source = value as Record<string, unknown>;
  if (keys[0] === 'recipe') return isPixelBannerRecipe(source['recipe']);
  return keys[0] === 'image' && isBotBannerImage(source['image']);
}

export function seededBotBanner(name: string): BotBanner {
  return { recipe: seededBannerRecipe(name) };
}

export function botBannerRevision(banner: BotBanner): string {
  return createHash('sha256')
    .update('recipe' in banner ? JSON.stringify(banner.recipe) : banner.image)
    .digest('hex')
    .slice(0, 16);
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes: Buffer): number {
  let c = 0xffffffff;
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}

export function encodeRgbaPng(
  width: number,
  height: number,
  rgba: Uint8Array | Uint8ClampedArray,
): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.writeUInt8(8, 8);
  header.writeUInt8(6, 9);
  const stride = width * 4;
  const rows = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride);
    rows[y * (stride + 1)] = y === 0 ? 0 : 2;
    const target = y * (stride + 1) + 1;
    if (y === 0) row.copy(rows, target);
    else {
      const above = Buffer.from(rgba.buffer, rgba.byteOffset + (y - 1) * stride, stride);
      for (let i = 0; i < stride; i++) rows[target + i] = (row[i]! - above[i]!) & 0xff;
    }
  }
  return Buffer.concat([
    PNG_MAGIC,
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

export function botBannerPng(banner: BotBanner): Buffer {
  if ('image' in banner) return Buffer.from(banner.image.slice(PNG_PREFIX.length), 'base64');
  const image = pixelBannerImage(banner.recipe);
  return encodeRgbaPng(image.width, image.height, image.data);
}

export function botBannerFromPng(bytes: Buffer): BotBanner | undefined {
  const image = `${PNG_PREFIX}${bytes.toString('base64')}`;
  return isBotBannerImage(image) ? { image } : undefined;
}
