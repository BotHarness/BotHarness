import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { receiveUploadBody, storeUploadBody, streamArchiveResponse } from '../src/index.js';

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function makeDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'botharness-transfer-'));
  dirs.push(dir);
  return dir;
}

function byteStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

describe('transfer IO', () => {
  it('streams an archive with attachment headers', async () => {
    const dir = makeDir();
    const archive = join(dir, 'botharness-computer-config-test.tar');
    writeFileSync(archive, 'hello-archive');
    const response = await streamArchiveResponse(archive);
    expect(response.headers.get('content-disposition')).toContain('attachment');
    expect(response.headers.get('content-disposition')).toContain(
      'botharness-computer-config-test.tar',
    );
    expect(await response.text()).toBe('hello-archive');
  });

  it('fails closed when the archive is gone', async () => {
    await expect(streamArchiveResponse(join(makeDir(), 'missing.tar'))).rejects.toThrow();
  });

  it('writes an upload body to disk without buffering it all', async () => {
    const dir = makeDir();
    const dest = join(dir, 'uploaded.tar');
    await receiveUploadBody(byteStream(['chunk-1-', 'chunk-2']), dest);
    expect(readFileSync(dest, 'utf8')).toBe('chunk-1-chunk-2');
  });

  it('rejects an empty upload body and leaves no file', async () => {
    const dest = join(makeDir(), 'uploaded.tar');
    await expect(receiveUploadBody(null, dest)).rejects.toThrow();
  });

  it('stores uploads atomically past any existing archive', async () => {
    const dir = makeDir();
    const dest = join(dir, 'uploaded.tar');
    await storeUploadBody(byteStream(['new-bytes']), dest);
    expect(readFileSync(dest, 'utf8')).toBe('new-bytes');
    expect(existsSync(`${dest}.part`)).toBe(false);
  });

  it('never truncates an existing archive when the stream tears', async () => {
    const dir = makeDir();
    const dest = join(dir, 'uploaded.tar');
    writeFileSync(dest, 'original-bytes');
    const torn = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.error(new Error('connection reset'));
      },
    });
    await expect(storeUploadBody(torn, dest)).rejects.toThrow(/connection reset/);
    expect(readFileSync(dest, 'utf8')).toBe('original-bytes');
    expect(existsSync(`${dest}.part`)).toBe(false);
  });
});
