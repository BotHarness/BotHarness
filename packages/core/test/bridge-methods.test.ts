import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createBridgeMethods } from '../src/bridge/methods.js';
import { createBridgeRpcHandler } from '../src/bridge/rpc.js';
import { createPersonaBotRegistry } from '../src/bots/registry.js';
import { createBotStateTracker } from '../src/state/bot-state.js';

const roots: string[] = [];

function setup() {
  const root = mkdtempSync(join(tmpdir(), 'botharness-bridge-'));
  roots.push(root);
  const registry = createPersonaBotRegistry({ rootDir: root });
  const states = createBotStateTracker();
  return { registry, states, methods: createBridgeMethods({ registry, states }) };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('bridge methods', () => {
  it('lists PersonaBots with their aggregate state', () => {
    const { registry, states, methods } = setup();
    registry.create({ slug: 'ada', displayName: 'Ada', workspaces: ['/tmp/ada'] });
    states.setSessionState('ada', 'session-1', 'working');

    const result = methods.list({});

    expect(result).toEqual({
      ok: true,
      value: {
        bots: [
          {
            slug: 'ada',
            displayName: 'Ada',
            aggregateState: 'working',
            workspaces: ['/tmp/ada'],
            createdAt: expect.any(String),
          },
        ],
      },
    });
  });

  it('filters by slug or display name', () => {
    const { registry, methods } = setup();
    registry.create({ slug: 'ada', displayName: 'Ada Lovelace' });
    registry.create({ slug: 'bob', displayName: 'Bob' });

    const byName = methods.list({ query: 'love' });
    const bySlug = methods.list({ query: 'BOB' });

    expect(byName.ok && byName.value.bots.map((bot) => bot.slug)).toEqual(['ada']);
    expect(bySlug.ok && bySlug.value.bots.map((bot) => bot.slug)).toEqual(['bob']);
  });

  it('returns a structured not-found failure for unknown slugs', () => {
    const { methods } = setup();

    expect(methods.get({ slug: 'missing' })).toEqual({
      ok: false,
      error: { code: 'not-found', message: 'unknown PersonaBot: missing' },
    });
  });

  it('maps endpoints and rejects unknown ones through the RPC handler', async () => {
    const { registry, methods } = setup();
    registry.create({ slug: 'ada', displayName: 'Ada' });
    const handler = createBridgeRpcHandler(methods);
    const signal = new AbortController().signal;

    const listed = await handler('botharness/list', {}, signal);
    const unknown = await handler('botharness/nope', {}, signal);

    expect(listed.ok && Array.isArray((listed.value as { bots: unknown[] }).bots)).toBe(true);
    expect(unknown).toEqual({
      ok: false,
      error: {
        code: 'not-found',
        message: 'unknown bridge endpoint: botharness/nope',
        details: {},
      },
    });
  });
});
