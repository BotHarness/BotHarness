import { describe, expect, it } from 'vitest';

import { jpegDimensions } from '../src/jpeg.js';

function jpegWithSof(width: number, height: number): string {
  const bytes = Buffer.alloc(20);
  let i = 0;
  bytes[i++] = 0xff;
  bytes[i++] = 0xd8;
  bytes[i++] = 0xff;
  bytes[i++] = 0xc0;
  bytes.writeUInt16BE(0x0011, i);
  i += 2;
  bytes[i++] = 0x08;
  bytes.writeUInt16BE(height, i);
  i += 2;
  bytes.writeUInt16BE(width, i);
  return bytes.toString('base64');
}

describe('jpeg dimensions', () => {
  it('reads the frame size from the SOF marker', () => {
    expect(jpegDimensions(jpegWithSof(1280, 720))).toEqual({ width: 1280, height: 720 });
    expect(jpegDimensions(jpegWithSof(2400, 1472))).toEqual({ width: 2400, height: 1472 });
  });

  it('returns undefined for non-JPEG data', () => {
    expect(jpegDimensions(Buffer.from('not-a-jpeg').toString('base64'))).toBeUndefined();
  });
});
