import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  createImStoreReader,
  parseImBotsConfig,
  parseWorkspacesDocument,
  resolveBotFromStores,
  resolveDshHome,
} from '../src/index.js';

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

  it('returns an empty list for junk input', () => {
    expect(parseImBotsConfig(undefined)).toEqual([]);
    expect(parseImBotsConfig({ bots: 'nope' })).toEqual([]);
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

  it('returns an empty document for junk input', () => {
    expect(parseWorkspacesDocument('nope')).toEqual({
      workspaces: {},
      aliases: {},
      conversationWorkspaces: {},
    });
  });
});

describe('createImStoreReader', () => {
  it('reads bots and workspaces from the channel root', () => {
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

    expect(snapshot.channelRoot).toBe(join('/opt/dsh', 'integrations', 'dsh-feishu'));
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
  it('resolves the bot for a workspace path', () => {
    const result = resolveBotFromStores('/srv/a', {
      bots: [{ id: 'bot_a', botName: 'A' }],
      workspaces: { workspaces: { bot_a: '/srv/a' }, aliases: {}, conversationWorkspaces: {} },
    });

    expect(result.ok && result.identity.slug).toBe('A');
  });
});
