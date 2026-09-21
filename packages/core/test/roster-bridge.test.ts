import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createBridgeMethods, type BridgeMethods } from '../src/bridge/methods.js';
import { createPersonaBotRegistry } from '../src/bots/registry.js';
import { createChannelStore } from '../src/channels/store.js';
import { createRosterStore, type RosterStore } from '../src/roster/store.js';
import { createBotStateTracker } from '../src/state/bot-state.js';
import { createFakeRosterDomain, type FakeRosterDomain } from './roster-fixture.js';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function setup(): { methods: BridgeMethods; roster: RosterStore; fake: FakeRosterDomain } {
  const root = mkdtempSync(join(tmpdir(), 'botharness-roster-bridge-'));
  roots.push(root);
  const roster = createRosterStore();
  const fake = createFakeRosterDomain();
  const methods = createBridgeMethods({
    registry: createPersonaBotRegistry({ rootDir: root }),
    states: createBotStateTracker(),
    channels: createChannelStore({ rootDir: join(root, 'channels') }),
    sessions: { list: () => [] },
    roster,
  });
  return { methods, roster, fake };
}

describe('roster bridge methods without storage', () => {
  it('reports storage-unavailable for reads and writes', async () => {
    const { methods } = setup();

    expect(methods.rosterGet({})).toEqual({
      ok: false,
      error: { code: 'storage-unavailable', message: 'roster storage is unavailable' },
    });
    expect(await methods.sectionCreate({ name: 'A' })).toEqual({
      ok: false,
      error: { code: 'storage-unavailable', message: 'roster storage is unavailable' },
    });
    expect(await methods.channelAssign({ channelId: 'c1', sectionId: 's1' })).toEqual({
      ok: false,
      error: { code: 'storage-unavailable', message: 'roster storage is unavailable' },
    });
  });
});

describe('roster bridge methods with storage', () => {
  async function attached() {
    const context = setup();
    await context.roster.attach(context.fake.facility);
    return context;
  }

  it('creates, renames, and removes sections through the envelope', async () => {
    const { methods, fake } = await attached();

    const created = await methods.sectionCreate({ name: '  研究  ' });
    expect(created).toEqual({
      ok: true,
      value: {
        section: { id: expect.stringMatching(/^[0-9a-f-]{36}$/), name: '研究', channelIds: [] },
      },
    });
    const sectionId = created.ok ? created.value.section.id : '';

    expect(await methods.sectionRename({ sectionId, name: '工作流' })).toEqual({
      ok: true,
      value: { section: { id: sectionId, name: '工作流', channelIds: [] } },
    });
    expect(fake.records.get(sectionId)?.name).toBe('工作流');

    expect(await methods.sectionRemove({ sectionId })).toEqual({
      ok: true,
      value: { removed: true },
    });
    expect(await methods.sectionRemove({ sectionId })).toEqual({
      ok: true,
      value: { removed: false },
    });
    expect(methods.rosterGet({})).toEqual({
      ok: true,
      value: { pins: [], hidden: [], sectionOrder: [], sections: [], topOrder: undefined },
    });
  });

  it('assigns channels with single ownership, positioning, and ungrouping', async () => {
    const { methods, fake } = await attached();
    const first = await methods.sectionCreate({ name: 'A' });
    const second = await methods.sectionCreate({ name: 'B' });
    const firstId = first.ok ? first.value.section.id : '';
    const secondId = second.ok ? second.value.section.id : '';

    await methods.channelAssign({ channelId: 'c1', sectionId: firstId });
    await methods.channelAssign({ channelId: 'c2', sectionId: firstId });
    await methods.channelAssign({ channelId: 'c1', sectionId: secondId });

    expect(fake.records.get(firstId)?.channelIds).toEqual(['c2']);
    expect(fake.records.get(secondId)?.channelIds).toEqual(['c1']);

    await methods.channelAssign({ channelId: 'c2', sectionId: firstId, index: 0 });
    await methods.channelAssign({ channelId: 'c1', sectionId: null });
    expect(fake.records.get(firstId)?.channelIds).toEqual(['c2']);
    expect(fake.records.get(secondId)?.channelIds).toEqual([]);

    expect(await methods.channelAssign({ channelId: 'c1', sectionId: 'missing' })).toEqual({
      ok: false,
      error: { code: 'not-found', message: 'unknown Channel section: missing' },
    });
  });

  it('reorders sections and sets pins and hidden Channels', async () => {
    const { methods, fake } = await attached();
    const first = await methods.sectionCreate({ name: 'A' });
    const second = await methods.sectionCreate({ name: 'B' });
    const firstId = first.ok ? first.value.section.id : '';
    const secondId = second.ok ? second.value.section.id : '';

    expect(await methods.sectionReorder({ order: [secondId, firstId] })).toEqual({
      ok: true,
      value: { sectionOrder: [secondId, firstId] },
    });
    expect(await methods.pinsSet({ pins: ['ada', 'ada', 'scout'] })).toEqual({
      ok: true,
      value: { pins: ['ada', 'scout'] },
    });
    expect(await methods.hiddenSet({ hidden: ['scout', 'scout'] })).toEqual({
      ok: true,
      value: { hidden: ['scout'] },
    });
    expect(fake.state()).toEqual({
      pins: ['ada', 'scout'],
      hidden: ['scout'],
      sectionOrder: [secondId, firstId],
    });

    const snapshot = methods.rosterGet({});
    expect(snapshot.ok && snapshot.value.sections.map((section) => section.id)).toEqual([
      secondId,
      firstId,
    ]);
  });

  it('writes absolute flat orders through the envelope', async () => {
    const { methods } = await attached();
    const created = await methods.sectionCreate({ name: 'A' });
    const sectionId = created.ok ? created.value.section.id : '';
    await methods.channelAssign({ channelId: 'c1', sectionId, index: 0 });

    expect(
      await methods.topReorder({
        order: [
          { kind: 'channel', id: 'loose' },
          { kind: 'section', id: sectionId },
        ],
      }),
    ).toEqual({
      ok: true,
      value: {
        topOrder: [
          { kind: 'channel', id: 'loose' },
          { kind: 'section', id: sectionId },
        ],
      },
    });

    const snapshot = methods.rosterGet({});
    expect(snapshot.ok && snapshot.value.topOrder).toEqual([
      { kind: 'channel', id: 'loose' },
      { kind: 'section', id: sectionId },
    ]);
  });

  it('rejects malformed payloads with invalid-input', async () => {
    const { methods } = await attached();

    expect(await methods.sectionCreate({})).toEqual({
      ok: false,
      error: { code: 'invalid-input', message: 'invalid sectionCreate payload' },
    });
    expect(await methods.sectionCreate({ name: '   ' })).toEqual({
      ok: false,
      error: { code: 'invalid-input', message: 'name is required' },
    });
    expect(await methods.sectionRename({ sectionId: 's1' })).toEqual({
      ok: false,
      error: { code: 'invalid-input', message: 'invalid sectionRename payload' },
    });
    expect(await methods.sectionRename({ sectionId: 's1', name: '  ' })).toEqual({
      ok: false,
      error: { code: 'invalid-input', message: 'name is required' },
    });
    expect(await methods.sectionRemove({})).toEqual({
      ok: false,
      error: { code: 'invalid-input', message: 'invalid sectionRemove payload' },
    });
    expect(await methods.channelAssign({ channelId: '' })).toEqual({
      ok: false,
      error: { code: 'invalid-input', message: 'invalid channelAssign payload' },
    });
    expect(await methods.channelAssign({ channelId: 'c1', index: -1 })).toEqual({
      ok: false,
      error: { code: 'invalid-input', message: 'invalid channelAssign payload' },
    });
    expect(await methods.sectionReorder({ order: 'nope' })).toEqual({
      ok: false,
      error: { code: 'invalid-input', message: 'invalid sectionReorder payload' },
    });
    expect(await methods.topReorder({ order: [{ kind: 'channel' }] })).toEqual({
      ok: false,
      error: { code: 'invalid-input', message: 'invalid topReorder payload' },
    });
    expect(await methods.pinsSet({ pins: 'ada' })).toEqual({
      ok: false,
      error: { code: 'invalid-input', message: 'invalid pinsSet payload' },
    });
    expect(await methods.hiddenSet({ hidden: 'ada' })).toEqual({
      ok: false,
      error: { code: 'invalid-input', message: 'invalid hiddenSet payload' },
    });
  });
});
