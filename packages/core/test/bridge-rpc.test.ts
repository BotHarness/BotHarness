import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Context } from '@deepseek-ai/cordis';
import { remoteMethods } from '@deepseek-ai/dsh-typert-protocol';
import { afterEach, describe, expect, it } from 'vitest';

import { createBridgeMethods, type BridgeMethods } from '../src/bridge/methods.js';
import { BRIDGE_NAMESPACE, BRIDGE_SERVICE_KEY, registerBridge } from '../src/bridge/rpc.js';
import { createPersonaBotRegistry } from '../src/bots/registry.js';
import { createChannelStore } from '../src/channels/store.js';
import { createRosterStore } from '../src/roster/store.js';
import type { BotSessionSource } from '../src/sessions/source.js';
import { createBotStateTracker } from '../src/state/bot-state.js';
import { createTestOwnership } from './helpers.js';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function setup() {
  const root = mkdtempSync(join(tmpdir(), 'botharness-bridge-rpc-'));
  roots.push(root);
  const registry = createPersonaBotRegistry({ rootDir: root });
  const channels = createChannelStore({
    rootDir: join(root, 'channels'),
    now: () => new Date('2026-09-19T00:00:00.000Z'),
  });
  const sessions: BotSessionSource = { list: () => [] };
  const methods: BridgeMethods = createBridgeMethods({
    registry,
    states: createBotStateTracker(),
    channels,
    sessions,
    ownership: createTestOwnership(),
    roster: createRosterStore(),
    createBotId: () => 'ada',
  });
  const ctx = new Context();
  const service = registerBridge(ctx, methods);
  return { root, registry, methods, service };
}

/**
 * Mirrors the gateway's SRC resolver: it reads the formal parameter names the
 * wire `{ args }` mapping is keyed on. Tolerant of the arrow/rest/default
 * forms the resolver accepts so a behaviour-preserving rewrite stays green.
 */
function parameterNames(method: (...args: never[]) => unknown): string[] {
  const source = Function.prototype.toString.call(method);
  const open = source.indexOf('(');
  const close = open === -1 ? -1 : source.indexOf(')', open + 1);
  const parameters = open === -1 || close === -1 ? '' : source.slice(open + 1, close);
  return parameters
    .split(',')
    .map((part) => part.trim().replace(/^\.\.\./, ''))
    .map((part) => part.split('=')[0]?.trim() ?? '')
    .filter((part) => part.length > 0);
}

describe('bridge typert service', () => {
  it('registers under the gateway service key with the botharness namespace', () => {
    const { service } = setup();

    expect(service.name).toBe(BRIDGE_SERVICE_KEY);
    expect(service.typertRemote.service).toBe(service);
    expect(service.typertRemote.serviceKey).toBe(BRIDGE_SERVICE_KEY);
    expect(service.typertRemote.namespace).toBe(BRIDGE_NAMESPACE);
  });

  it('marks exactly the forty-nine bridge endpoints for typert claims', () => {
    const { service } = setup();

    expect(remoteMethods(service).map((marker) => marker.exportName ?? marker.method)).toEqual([
      'list',
      'get',
      'create',
      'createFromGit',
      'update',
      'pause',
      'resume',
      'channels',
      'channelDm',
      'channelCreate',
      'channelRename',
      'channelGroupInviteCancel',
      'channelGroupMemberRemove',
      'channelGroupWakeSet',
      'channelGroupDelete',
      'channelMessages',
      'channelTimeline',
      'channelReadPosition',
      'channelMarkRead',
      'channelSend',
      'assignments',
      'assignment',
      'workspaceOptions',
      'grants',
      'grantCreate',
      'grantRevoke',
      'assignmentAccessGet',
      'assignmentAccessSet',
      'toolApprovalRules',
      'toolApprovalRuleRevoke',
      'toolApprovalStatus',
      'toolApprovalDecide',
      'userQuestionStatus',
      'userQuestionAnswer',
      'sessions',
      'memorySnapshot',
      'memoryFile',
      'memoryHistory',
      'memoryDiff',
      'memoryGitGraph',
      'memoryGitCommitDiff',
      'memorySave',
      'memoryRepair',
      'rosterGet',
      'sectionCreate',
      'sectionRename',
      'sectionRemove',
      'channelAssign',
      'sectionReorder',
      'topReorder',
      'pinsSet',
      'hiddenSet',
      'rosterBatch',
    ]);
  });

  it('reads parameter names from every form the SRC resolver accepts', () => {
    expect(parameterNames(function (alpha: string, beta: number) {})).toEqual(['alpha', 'beta']);
    expect(parameterNames((alpha: string, ...rest: string[]) => alpha)).toEqual(['alpha', 'rest']);
    expect(parameterNames(function (alpha = 1, beta = 2) {})).toEqual(['alpha', 'beta']);
  });

  it('keeps every method signature parseable by the gateway SRC resolver', () => {
    const { service } = setup();

    expect(parameterNames(service.list)).toEqual(['query']);
    expect(parameterNames(service.get)).toEqual(['slug']);
    expect(parameterNames(service.create)).toEqual([
      'displayName',
      'roles',
      'persona',
      'description',
      'model',
      'preset',
      'workspaces',
      'avatarSeed',
    ]);
    expect(parameterNames(service.update)).toEqual(['slug', 'patch']);
    expect(parameterNames(service.pause)).toEqual(['slug']);
    expect(parameterNames(service.resume)).toEqual(['slug']);
    expect(parameterNames(service.createFromGit)).toEqual([
      'displayName',
      'gitUrl',
      'roles',
      'description',
    ]);
    expect(parameterNames(service.channels)).toEqual([]);
    expect(parameterNames(service.channelDm)).toEqual(['slug', 'displayName']);
    expect(parameterNames(service.channelCreate)).toEqual(['name', 'members']);
    expect(parameterNames(service.channelRename)).toEqual(['channelId', 'name']);
    expect(parameterNames(service.channelMessages)).toEqual(['channelId', 'before', 'limit']);
    expect(parameterNames(service.channelTimeline)).toEqual([
      'channelId',
      'direction',
      'cursor',
      'around',
      'limit',
      'olderLimit',
      'newerLimit',
    ]);
    expect(parameterNames(service.channelSend)).toEqual([
      'channelId',
      'body',
      'replyTo',
      'attachments',
      'messageId',
      'memorySwitchTarget',
      'mentions',
    ]);
    expect(parameterNames(service.assignments)).toEqual(['slug']);
    expect(parameterNames(service.assignment)).toEqual(['slug', 'sessionId']);
    expect(parameterNames(service.sessions)).toEqual(['slug']);
    expect(parameterNames(service.rosterGet)).toEqual([]);
    expect(parameterNames(service.sectionCreate)).toEqual(['name']);
    expect(parameterNames(service.sectionRename)).toEqual(['sectionId', 'name']);
    expect(parameterNames(service.sectionRemove)).toEqual(['sectionId']);
    expect(parameterNames(service.channelAssign)).toEqual(['channelId', 'sectionId', 'index']);
    expect(parameterNames(service.sectionReorder)).toEqual(['order']);
    expect(parameterNames(service.topReorder)).toEqual(['order']);
    expect(parameterNames(service.pinsSet)).toEqual(['pins']);
    expect(parameterNames(service.hiddenSet)).toEqual(['hidden']);
    expect(parameterNames(service.rosterBatch)).toEqual(['action', 'channelIds', 'sectionId']);
  });

  it('dispatches named arguments into the read model', async () => {
    const { service, registry } = setup();

    const created = service.create('Ada', ['研究'], '# Ada\n');
    expect(created.bot).toMatchObject({ slug: 'ada', displayName: 'Ada', roles: ['研究'] });
    expect(registry.get('ada')).toBeDefined();
    expect(service.get('ada').bot.slug).toBe('ada');
    expect(service.list('ada').bots.map((bot) => bot.slug)).toEqual(['ada']);
    expect(service.pause('ada').bot.paused).toBe(true);
    expect(service.resume('ada').bot.paused).toBeUndefined();

    const dm = service.channelDm('ada', 'Ada');
    expect(dm.channel.id).toBe('dm-ada');
    const renamed = service.channelRename('dm-ada', 'Ada Lovelace');
    expect(renamed.channel.name).toBe('Ada Lovelace');
    expect(renamed.bot?.displayName).toBe('Ada Lovelace');
    expect(service.channels().channels.map((channel) => channel.id)).toEqual(['dm-ada']);
    const sent = await service.channelSend('dm-ada', 'hello');
    expect(sent.message.body).toBe('hello');
    expect(service.channels().channels[0]?.latestMessage?.body).toBe('hello');
    expect(service.channelMessages('dm-ada').messages[0]?.body).toBe('hello');
    expect(service.assignments('ada').assignments).toEqual([]);
    expect(service.sessions('ada').sessions).toEqual([]);
  });

  it('throws RemoteError failures so the gateway keeps code and message on the wire', () => {
    const { service } = setup();

    try {
      service.get('missing');
      expect.unreachable('service.get should throw');
    } catch (error) {
      expect(error).toMatchObject({
        name: 'RemoteError',
        isDSHRemoteError: true,
        code: 'not-found',
        message: 'unknown PersonaBot: missing',
        details: {},
      });
    }
  });
});
