export function jpegDimensions(base64: string): { width: number; height: number } | undefined {
  const bytes = Buffer.from(base64, 'base64');
  let index = 2;
  while (index + 9 < bytes.length) {
    if (bytes[index] !== 0xff) {
      index += 1;
      continue;
    }
    const marker = bytes[index + 1]!;
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: bytes.readUInt16BE(index + 5), width: bytes.readUInt16BE(index + 7) };
    }
    const length = bytes.readUInt16BE(index + 2);
    index += 2 + length;
  }
  return undefined;
}
