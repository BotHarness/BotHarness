import { describe, expect, it } from 'vitest';

import {
  emptyWorkspacesDocument,
  resolveBotIdentity,
  slugForBot,
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
        slug: '销售助手',
        workspace: '/srv/bots/sales',
        botName: '销售助手',
        domain: 'lark',
      },
    });
  });

  it('prefers the alias for the slug', () => {
    const result = resolveBotIdentity({
      workspacePath: '/srv/bots/sales',
      bots: [sales],
      workspaces: workspaces({
        workspaces: { bot_sales: '/srv/bots/sales' },
        aliases: { bot_sales: 'sales' },
      }),
    });

    expect(result.ok && result.identity.slug).toBe('sales');
  });

  it('tolerates trailing slashes and whitespace', () => {
    const result = resolveBotIdentity({
      workspacePath: '  /srv/bots/sales/  ',
      bots: [sales],
      workspaces: workspaces({ workspaces: { bot_sales: '/srv/bots/sales' } }),
    });

    expect(result.ok).toBe(true);
  });

  it('falls back to the bot id when no alias or name exists', () => {
    const anon: ImBotRecord = { id: 'bot_anon' };
    expect(slugForBot(anon, emptyWorkspacesDocument())).toBe('bot_anon');
  });

  it('prefers a conversation override over the default workspace', () => {
    const result = resolveBotIdentity({
      workspacePath: '/srv/proj-b',
      bots: [sales],
      workspaces: workspaces({
        workspaces: { bot_sales: '/srv/bots/sales' },
        conversationWorkspaces: { bot_sales: { oc_1: '/srv/proj-b' } },
      }),
    });

    expect(result.ok && result.identity.workspace).toBe('/srv/proj-b');
  });

  it('still resolves the default workspace when an override exists elsewhere', () => {
    const result = resolveBotIdentity({
      workspacePath: '/srv/bots/sales',
      bots: [sales],
      workspaces: workspaces({
        workspaces: { bot_sales: '/srv/bots/sales' },
        conversationWorkspaces: { bot_sales: { oc_1: '/srv/proj-b' } },
      }),
    });

    expect(result.ok && result.identity.workspace).toBe('/srv/bots/sales');
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

  it('reports not-found for an unknown workspace', () => {
    const result = resolveBotIdentity({
      workspacePath: '/srv/unknown',
      bots: [sales],
      workspaces: workspaces({ workspaces: { bot_sales: '/srv/bots/sales' } }),
    });

    expect(result).toEqual({ ok: false, reason: 'not-found', matches: [] });
  });

  it('canonicalizes paths through the injected resolver', () => {
    const result = resolveBotIdentity({
      workspacePath: '/srv/link',
      bots: [sales],
      workspaces: workspaces({ workspaces: { bot_sales: '/srv/real' } }),
      canonicalize: (path) => (path === '/srv/link' ? '/srv/real' : path),
    });

    expect(result.ok && result.identity.id).toBe('bot_sales');
  });
});
