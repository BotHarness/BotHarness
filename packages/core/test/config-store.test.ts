import { mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  createImStoreReader,
  emptyWorkspacesDocument,
  parseImBotsConfig,
  parseWorkspacesDocument,
  resolveBotFromStores,
  resolveDshHome,
} from '../src/index.js';

const roots: string[] = [];

function createRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'botharness-config-'));
  roots.push(root);
  return root;
}

afterEach(() => {
  while (roots.length > 0) {
    const root = roots.pop();
    if (root !== undefined) rmSync(root, { recursive: true, force: true });
  }
});

describe('resolveDshHome', () => {
  it('reads DSH_HOME from the environment', () => {
    expect(resolveDshHome({ DSH_HOME: '/opt/dsh' })).toBe('/opt/dsh');
  });

  it('falls back to ~/.dsh', () => {
    expect(resolveDshHome({})).toMatch(/[\\/]\.dsh$/);
  });
});

describe('parseImBotsConfig', () => {
  it('keeps valid bots and drops malformed entries', () => {
    const bots = parseImBotsConfig({
      version: 2,
      bots: [
        { id: 'bot_a', botName: 'A', domain: 'lark', appId: 'cli_x', extra: true },
        { id: 'bot_b', domain: 'feishu' },
        { id: '', botName: 'no id' },
        { id: 'bad id with spaces' },
        null,
        'nope',
        { botName: 'missing id' },
      ],
    });

    expect(bots).toEqual([
      { id: 'bot_a', botName: 'A', appId: 'cli_x', domain: 'lark' },
      { id: 'bot_b', domain: 'feishu' },
    ]);
  });

  it('reads a legacy v1 single-bot config and rejects junk input', () => {
    expect(parseImBotsConfig({ id: 'bot_legacy', botName: 'Legacy', domain: 'feishu' })).toEqual([
      { id: 'bot_legacy', botName: 'Legacy', domain: 'feishu' },
    ]);
    expect(parseImBotsConfig(undefined)).toEqual([]);
  });
});

describe('parseWorkspacesDocument', () => {
  it('parses v3 documents', () => {
    const document = parseWorkspacesDocument({
      version: 3,
      workspaces: { bot_a: '/srv/a' },
      aliases: { bot_a: 'sales' },
      conversationWorkspaces: { bot_a: { oc_1: '/srv/b' }, bot_b: {} },
    });

    expect(document).toEqual({
      workspaces: { bot_a: '/srv/a' },
      aliases: { bot_a: 'sales' },
      conversationWorkspaces: { bot_a: { oc_1: '/srv/b' } },
    });
  });
});

describe('createImStoreReader', () => {
  it('reads bots and workspaces from the integration root', () => {
    const files = new Map<string, string>([
      [
        join('/opt/dsh', 'integrations', 'dsh-feishu', 'config.json'),
        JSON.stringify({ version: 2, bots: [{ id: 'bot_a', botName: 'A', domain: 'lark' }] }),
      ],
      [
        join('/opt/dsh', 'integrations', 'dsh-feishu', 'workspaces.json'),
        JSON.stringify({ version: 3, workspaces: { bot_a: '/srv/a' } }),
      ],
    ]);
    const reader = createImStoreReader({
      dshHome: '/opt/dsh',
      readFile: (path) => files.get(path),
    });

    const snapshot = reader.read();

    expect(snapshot.integrationId).toBe('dsh-feishu');
    expect(snapshot.integrationRoot).toBe(join('/opt/dsh', 'integrations', 'dsh-feishu'));
    expect(snapshot.bots).toEqual([{ id: 'bot_a', botName: 'A', domain: 'lark' }]);
    expect(snapshot.workspaces.workspaces).toEqual({ bot_a: '/srv/a' });
  });

  it('survives missing or malformed files', () => {
    const reader = createImStoreReader({
      dshHome: '/opt/dsh',
      readFile: (path) => (path.endsWith('config.json') ? '{ not json' : undefined),
    });

    const snapshot = reader.read();

    expect(snapshot.bots).toEqual([]);
    expect(snapshot.workspaces.workspaces).toEqual({});
  });
});

describe('resolveBotFromStores', () => {
  it('matches a symlinked workspace through realpath canonicalization', () => {
    const real = createRoot();
    const link = `${real}-link`;
    roots.push(link);
    symlinkSync(real, link);

    const result = resolveBotFromStores(link, {
      bots: [{ id: 'bot_a', botName: 'A' }],
      workspaces: { ...emptyWorkspacesDocument(), workspaces: { bot_a: real } },
    });

    expect(result.ok && result.identity.id).toBe('bot_a');
  });
});
