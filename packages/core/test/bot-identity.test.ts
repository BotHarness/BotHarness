import { describe, expect, it } from 'vitest';

import {
  displayNameForBot,
  emptyWorkspacesDocument,
  resolveBotIdentity,
  type ImBotRecord,
  type WorkspacesDocument,
} from '../src/index.js';

function workspaces(partial: Partial<WorkspacesDocument>): WorkspacesDocument {
  return { ...emptyWorkspacesDocument(), ...partial };
}

const sales: ImBotRecord = { id: 'bot_sales', botName: '销售助手', domain: 'lark' };
const dev: ImBotRecord = { id: 'bot_dev', botName: '研发助手', domain: 'lark' };

describe('resolveBotIdentity', () => {
  it('resolves a bot by its default workspace', () => {
    const result = resolveBotIdentity({
      workspacePath: '/srv/bots/sales',
      bots: [sales],
      workspaces: workspaces({ workspaces: { bot_sales: '/srv/bots/sales' } }),
    });

    expect(result).toEqual({
      ok: true,
      identity: {
        id: 'bot_sales',
        displayName: '销售助手',
        workspace: '/srv/bots/sales',
        botName: '销售助手',
        domain: 'lark',
      },
    });
  });

  it('prefers the alias for the display name', () => {
    const result = resolveBotIdentity({
      workspacePath: '/srv/bots/sales',
      bots: [sales],
      workspaces: workspaces({
        workspaces: { bot_sales: '/srv/bots/sales' },
        aliases: { bot_sales: 'sales' },
      }),
    });

    expect(result.ok && result.identity.displayName).toBe('sales');
  });

  it('normalizes trailing slashes and whitespace', () => {
    const result = resolveBotIdentity({
      workspacePath: '  /srv/bots/sales/  ',
      bots: [sales],
      workspaces: workspaces({ workspaces: { bot_sales: '/srv/bots/sales/' } }),
    });

    expect(result.ok && result.identity.workspace).toBe('/srv/bots/sales');
  });

  it('falls back to the bot id when no alias or name exists', () => {
    const anon: ImBotRecord = { id: 'bot_anon' };
    expect(displayNameForBot(anon, emptyWorkspacesDocument())).toBe('bot_anon');
  });

  it('matches a conversation override only when its key is given', () => {
    const result = resolveBotIdentity({
      workspacePath: '/srv/proj-b',
      bots: [sales],
      workspaces: workspaces({
        workspaces: { bot_sales: '/srv/bots/sales' },
        conversationWorkspaces: { bot_sales: { oc_1: '/srv/proj-b' } },
      }),
      conversationKey: 'oc_1',
    });

    expect(result.ok && result.identity.workspace).toBe('/srv/proj-b');
  });

  it('does not treat an override path as a bot default', () => {
    const result = resolveBotIdentity({
      workspacePath: '/srv/proj-b',
      bots: [sales],
      workspaces: workspaces({
        workspaces: { bot_sales: '/srv/bots/sales' },
        conversationWorkspaces: { bot_sales: { oc_1: '/srv/proj-b' } },
      }),
    });

    expect(result).toEqual({ ok: false, reason: 'not-found', matches: [] });
  });

  it('reports ambiguity when two bots share a workspace', () => {
    const result = resolveBotIdentity({
      workspacePath: '/srv/shared',
      bots: [sales, dev],
      workspaces: workspaces({ workspaces: { bot_sales: '/srv/shared', bot_dev: '/srv/shared' } }),
    });

    expect(result).toEqual({
      ok: false,
      reason: 'ambiguous',
      matches: [
        expect.objectContaining({ id: 'bot_sales' }),
        expect.objectContaining({ id: 'bot_dev' }),
      ],
    });
  });

  it('canonicalizes paths through the injected resolver', () => {
    const result = resolveBotIdentity({
      workspacePath: '/srv/link',
      bots: [sales],
      workspaces: workspaces({ workspaces: { bot_sales: '/srv/real' } }),
      canonicalize: (path) => (path === '/srv/link' ? '/srv/real' : path),
    });

    expect(result.ok && result.identity.id).toBe('bot_sales');
    expect(result.ok && result.identity.workspace).toBe('/srv/real');
  });
});
