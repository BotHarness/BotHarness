import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  ChannelAttachmentError,
  createAttachmentStore,
  safeAttachmentName,
  sniffAttachmentMime,
} from '../src/attachments/store.js';

const roots: string[] = [];
function root(): string {
  const path = mkdtempSync(join(tmpdir(), 'botharness-attachment-'));
  roots.push(path);
  return path;
}
afterEach(() => {
  for (const path of roots.splice(0)) rmSync(path, { recursive: true, force: true });
});
async function* chunks(...values: Uint8Array[]): AsyncIterable<Uint8Array> {
  for (const value of values) yield value;
}

describe('profile attachment CAS', () => {
  it('streams bytes, sniffs MIME, deduplicates by hash, and verifies downloads', async () => {
    const home = root();
    const store = createAttachmentStore({ rootDir: home });
    const bytes = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);
    const hash = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
    const first = await store.upload({
      data: chunks(bytes.subarray(0, 5), bytes.subarray(5)),
      name: '/private/first.png',
    });
    const second = await store.upload({ data: chunks(bytes), name: 'second.png' });
    expect(first).toEqual({ hash, name: 'first.png', mime: 'image/png', size: bytes.length });
    expect(second).toEqual({ ...first, name: 'second.png' });
    expect(readdirSync(join(home, 'objects', hash.slice(7, 9)))).toEqual([hash.slice(7)]);
    expect(store.has(first)).toBe(true);
    expect(store.has({ ...first, mime: 'text/html' })).toBe(false);
    const result = await store.download(hash, second.name);
    expect(result.ref).toEqual(second);
    expect(new Uint8Array(await new Response(result.body).arrayBuffer())).toEqual(bytes);
  });

  it('rejects oversized streams without publishing a ref or leaving a staged part', async () => {
    const home = root();
    const store = createAttachmentStore({ rootDir: home, maxBytes: 3 });
    await expect(
      store.upload({ data: chunks(Uint8Array.from([1, 2]), Uint8Array.from([3, 4])) }),
    ).rejects.toMatchObject({ code: 'too-large' });
    expect(readdirSync(join(home, 'staging'))).toEqual([]);
    expect(existsSync(join(home, 'objects'))).toBe(false);
  });

  it('uses server-side MIME, safe filenames, and rejects unknown object hashes', async () => {
    const store = createAttachmentStore({ rootDir: root() });
    const pdf = await store.upload({
      data: chunks(Buffer.from('%PDF-1.7')),
      name: '..\\draft.pdf',
    });
    expect(pdf.name).toBe('draft.pdf');
    expect(pdf.mime).toBe('application/pdf');
    expect(sniffAttachmentMime(Buffer.from('hello'))).toBe('text/plain');
    expect(sniffAttachmentMime(Uint8Array.from([0, 255]))).toBe('application/octet-stream');
    expect(safeAttachmentName('../')).toBe('attachment');
    await expect(store.download('bad')).rejects.toBeInstanceOf(ChannelAttachmentError);
    await expect(store.download('sha256:' + '0'.repeat(64))).rejects.toMatchObject({
      code: 'not-found',
    });
  });

  it('sweeps only old incomplete staging files, never committed objects', async () => {
    const home = root();
    const store = createAttachmentStore({ rootDir: home });
    const ref = await store.upload({ data: chunks(Buffer.from('kept')), name: 'kept.txt' });
    const staging = join(home, 'staging');
    mkdirSync(staging, { recursive: true });
    const old = join(staging, '00000000-0000-0000-0000-000000000000.part');
    const fresh = join(staging, '11111111-1111-1111-1111-111111111111.part');
    writeFileSync(old, 'old');
    writeFileSync(fresh, 'fresh');
    utimesSync(old, new Date(0), new Date(0));
    expect(await store.sweepStaged(new Date(1000))).toBe(1);
    expect(existsSync(old)).toBe(false);
    expect(existsSync(fresh)).toBe(true);
    expect(store.has(ref)).toBe(true);
  });
});
