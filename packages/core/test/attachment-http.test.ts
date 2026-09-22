import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { CHANNEL_ATTACHMENT_PATH, createAttachmentHttp } from '../src/attachments/http.js';
import { createAttachmentStore } from '../src/attachments/store.js';
import type { ChannelAttachmentRef } from '../src/attachments/ref.js';

const roots: string[] = [];
function setup(maxBytes = 1024) {
  const rootDir = mkdtempSync(join(tmpdir(), 'botharness-attachment-http-'));
  roots.push(rootDir);
  return createAttachmentHttp(createAttachmentStore({ rootDir, maxBytes }));
}
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
const url = (query = '') => `http://local${CHANNEL_ATTACHMENT_PATH}${query}`;

describe('exact attachment Fetch route', () => {
  it('streams a PNG upload and inline download with server-sniffed type', async () => {
    const handle = setup();
    const bytes = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2]);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.subarray(0, 4));
        controller.enqueue(bytes.subarray(4));
        controller.close();
      },
    });
    const upload = await handle(
      new Request(url('?name=%2Fprivate%2Fcat.png'), {
        method: 'POST',
        headers: { 'content-type': 'application/octet-stream' },
        body: stream,
        duplex: 'half',
      } as RequestInit & { duplex: 'half' }),
    );
    expect(upload.status).toBe(200);
    const ref = ((await upload.json()) as { attachment: ChannelAttachmentRef }).attachment;
    expect(ref).toMatchObject({ name: 'cat.png', mime: 'image/png', size: bytes.length });
    const download = await handle(
      new Request(url(`?hash=${encodeURIComponent(ref.hash)}&name=cat.png`)),
    );
    expect(download.status).toBe(200);
    expect(download.headers.get('content-type')).toBe('image/png');
    expect(download.headers.get('content-disposition')).toMatch(/^inline;/u);
    expect(download.headers.get('x-content-type-options')).toBe('nosniff');
    expect(new Uint8Array(await download.arrayBuffer())).toEqual(bytes);
  });

  it('forces non-images to download and rejects spoofing and oversize', async () => {
    const handle = setup(8);
    expect(
      (
        await handle(
          new Request(url(), {
            method: 'POST',
            headers: { 'content-type': 'image/png' },
            body: 'fake',
          }),
        )
      ).status,
    ).toBe(415);
    const oversized = await handle(
      new Request(url(), {
        method: 'POST',
        headers: { 'content-type': 'application/octet-stream' },
        body: '123456789',
      }),
    );
    expect(oversized.status).toBe(413);
    const upload = await handle(
      new Request(url('?name=notes.pdf'), {
        method: 'POST',
        headers: { 'content-type': 'application/octet-stream' },
        body: '%PDF-1.7',
      }),
    );
    const ref = ((await upload.json()) as { attachment: ChannelAttachmentRef }).attachment;
    const download = await handle(
      new Request(url(`?hash=${encodeURIComponent(ref.hash)}&name=notes.pdf`)),
    );
    expect(download.headers.get('content-type')).toBe('application/pdf');
    expect(download.headers.get('content-disposition')).toMatch(/^attachment;/u);
    expect((await handle(new Request(url('?hash=bad')))).status).toBe(400);
    expect((await handle(new Request(url()))).status).toBe(400);
    expect((await handle(new Request(url(), { method: 'DELETE' }))).status).toBe(405);
  });
});
