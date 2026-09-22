import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { defaultExportDir } from '../src/index.js';

const homes: string[] = [];

function makeHome(desktop: boolean): string {
  const home = mkdtempSync(join(tmpdir(), 'botharness-home-'));
  homes.push(home);
  if (desktop) mkdirSync(join(home, 'Desktop'));
  return home;
}

afterEach(() => {
  for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true });
});

describe('defaultExportDir', () => {
  it('places exports under Desktop when the Home folder has one', () => {
    const home = makeHome(true);
    expect(defaultExportDir(home)).toBe(join(home, 'Desktop', 'BotHarness Exports'));
  });

  it('falls back under the Home folder when Desktop is missing', () => {
    const home = makeHome(false);
    expect(defaultExportDir(home)).toBe(join(home, 'BotHarness Exports'));
  });
});
