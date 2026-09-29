import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { saveScreenshot } from '../src/screenshots.js';

const dirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'browser-shots-'));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('screenshot persistence', () => {
  it('writes the JPEG and keeps only the newest captures', async () => {
    const dir = tempDir();
    const first = await saveScreenshot(dir, 2, 'Zm9v', 1000);
    expect(readFileSync(first, 'utf8')).toBe('foo');
    await saveScreenshot(dir, 2, 'YmFy', 2000);
    await saveScreenshot(dir, 2, 'YmF6', 3000);
    const names = readdirSync(dir).sort();
    expect(names).toEqual(['screenshot-2000.jpg', 'screenshot-3000.jpg']);
  });

  it('reuses the directory across captures', async () => {
    const dir = tempDir();
    const file = await saveScreenshot(dir, 100, 'Zm9v', 42);
    expect(file).toBe(join(dir, 'screenshot-42.jpg'));
    expect(readdirSync(dir)).toEqual(['screenshot-42.jpg']);
  });
});
