import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { openLogDatabase } from '../src/logs/log-db.js';
import {
  COMMAND_DEFAULT_LIMIT,
  COMMAND_MAX_LIMIT,
  COMMAND_NAME,
  formatLogEntries,
  parseDeepseekBotLogInput,
  runDeepseekBotLogCommand,
} from '../src/logs/command.js';

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function seedDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'botharness-logcmd-'));
  dirs.push(dir);
  const logs = openLogDatabase({ dir });
  try {
    logs.write({
      plugin: 'computer',
      owner: 'profile-shared',
      kind: 'lifecycle',
      detail: 'start requested',
      ts: 1000,
    });
    logs.write({
      plugin: 'channel',
      owner: 'bot:atlas',
      kind: 'delivery',
      detail: 'send failed',
      ts: 2000,
    });
  } finally {
    logs.close();
  }
  return dir;
}

describe('deepseek-bot-log command', () => {
  it('has a lowercase distinctive name', () => {
    expect(COMMAND_NAME).toBe('deepseek-bot-log');
  });

  it('parses plugin and limit, clamping the window', () => {
    expect(parseDeepseekBotLogInput('')).toEqual({ limit: COMMAND_DEFAULT_LIMIT });
    expect(parseDeepseekBotLogInput('plugin=computer limit=5')).toEqual({
      plugin: 'computer',
      limit: 5,
    });
    expect(parseDeepseekBotLogInput('limit=9999')).toEqual({ limit: COMMAND_MAX_LIMIT });
    expect(parseDeepseekBotLogInput('limit=abc')).toEqual({ limit: COMMAND_DEFAULT_LIMIT });
    expect(parseDeepseekBotLogInput('bogus=1 plugin=channel')).toEqual({
      plugin: 'channel',
      limit: COMMAND_DEFAULT_LIMIT,
    });
  });

  it('formats rows newest-first with kind and detail', () => {
    const text = formatLogEntries([
      {
        id: 2,
        ts: 2000,
        plugin: 'channel',
        owner: 'bot:atlas',
        kind: 'delivery',
        detail: 'send failed',
      },
      {
        id: 1,
        ts: 1000,
        plugin: 'computer',
        owner: 'profile-shared',
        kind: 'lifecycle',
        detail: 'start requested',
      },
    ]);
    expect(text).toContain('[delivery] send failed');
    expect(text).toContain('[lifecycle] start requested');
    expect(text.indexOf('send failed')).toBeLessThan(text.indexOf('start requested'));
  });

  it('reads a seeded store read-only without touching its lifecycle', () => {
    const dir = seedDir();
    return runDeepseekBotLogCommand(dir, '').then((result) => {
      expect(result.kind).toBe('success');
      if (result.kind !== 'success') return;
      expect(result.text).toContain('[delivery] send failed');
      expect(result.text).toContain('[lifecycle] start requested');
    });
  });

  it('filters by plugin from the raw input', () => {
    const dir = seedDir();
    return runDeepseekBotLogCommand(dir, 'plugin=channel').then((result) => {
      expect(result.kind).toBe('success');
      if (result.kind !== 'success') return;
      expect(result.text).toContain('send failed');
      expect(result.text).not.toContain('start requested');
    });
  });

  it('answers empty on a missing store instead of creating one', () => {
    const dir = mkdtempSync(join(tmpdir(), 'botharness-logcmd-empty-'));
    dirs.push(dir);
    return runDeepseekBotLogCommand(dir, '').then((result) => {
      expect(result).toEqual({ kind: 'success', text: '暂无运行记录' });
    });
  });
});
